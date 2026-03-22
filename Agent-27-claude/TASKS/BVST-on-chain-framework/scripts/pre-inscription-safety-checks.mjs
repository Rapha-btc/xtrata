import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bundleRoot, loadModuleIndex, readJson, toPosix, writeJson } from './_inscription-helpers.mjs';
import { verifyBundle } from './verify-bundle.mjs';
import { simulateInscriptionRelease } from './simulate-inscription-release.mjs';
import { runWorkspaceHttpSmoke } from './http-smoke-workspace.mjs';
import { runWorkspaceBrowserSmoke } from './browser-smoke-workspace.mjs';

function parseArgs(argv) {
  const args = {
    out: 'verification/pre-inscription.report.json',
    withBrowserSmoke: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--with-browser-smoke') {
      args.withBrowserSmoke = true;
      continue;
    }
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }
    args[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    index += 1;
  }
  return args;
}

function createSection(name) {
  return { name, status: 'passed', errors: [], warnings: [], details: {} };
}

function fail(section, message) {
  section.status = 'failed';
  section.errors.push(message);
}

function warn(section, message) {
  if (section.status === 'passed') section.status = 'passed_with_warnings';
  section.warnings.push(message);
}

function isListenPermissionError(err) {
  if (!err) return false;
  return err.code === 'EPERM' || /listen EPERM/i.test(err.message || '');
}

async function walkFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else out.push(abs);
    }
  }
  return out.sort();
}

function isAllowedLiteral(filePath, literal) {
  if (literal === 'https://json-schema.org/draft/2020-12/schema') return true;
  if (literal.startsWith('data:audio/')) return true;
  return false;
}

async function validateManifestAndPatchSemantics() {
  const section = createSection('plugin_semantics');
  const selection = await readJson('configs/first-wave-selection.json');
  const moduleIndex = await loadModuleIndex();
  const moduleByName = new Map(moduleIndex.map((record) => [record.name, record]));
  const plugins = [];

  for (const family of selection.families || []) {
    for (const pluginName of family.plugins || []) {
      const pluginRoot = path.join(bundleRoot, 'workspace', 'Plugins', 'Instruments', pluginName);
      const manifest = JSON.parse(await fs.readFile(path.join(pluginRoot, 'manifest.json'), 'utf8'));
      const patch = JSON.parse(await fs.readFile(path.join(pluginRoot, 'patch.json'), 'utf8'));
      const gui = await fs.readFile(path.join(pluginRoot, 'gui.html'), 'utf8');
      const issues = [];
      const warnings = [];

      if (manifest.name !== pluginName) issues.push(`Manifest name mismatch for ${pluginName}.`);
      if (typeof manifest.version !== 'string' || !manifest.version.trim()) issues.push(`Manifest version missing for ${pluginName}.`);
      if (manifest.components?.ui_html !== 'gui.html') issues.push(`Manifest ui_html must be gui.html for ${pluginName}.`);
      if (typeof manifest.components?.audio_engine !== 'string') issues.push(`Manifest audio_engine missing for ${pluginName}.`);
      if (typeof manifest.io?.outputs !== 'number' || manifest.io.outputs <= 0) issues.push(`Manifest outputs invalid for ${pluginName}.`);
      if (!gui.includes('id="app-container"')) issues.push(`GUI shell missing #app-container for ${pluginName}.`);
      if (!gui.includes('runPatch({')) issues.push(`GUI shell does not invoke runPatch for ${pluginName}.`);
      if (!gui.includes('../../../System/shared/patch_runtime.js')) issues.push(`GUI shell import path unexpected for ${pluginName}.`);

      if (patch.schema !== 'bvst.patch/v1') issues.push(`Patch schema mismatch for ${pluginName}.`);
      if (!patch.config || typeof patch.config !== 'object') issues.push(`Patch config missing for ${pluginName}.`);
      if (patch.meta?.name && patch.config?.name && patch.meta.name !== patch.config.name) {
        warnings.push(`Patch meta.name and config.name differ for ${pluginName}.`);
      }

      const modules = Array.isArray(patch.config?.modules) ? patch.config.modules : [];
      if (modules.length === 0) issues.push(`Patch has no modules for ${pluginName}.`);
      const controlIds = new Set();
      const positiveParams = new Map();
      const controlsById = new Map();
      const sampler = patch.config?.sampler && typeof patch.config.sampler === 'object' ? patch.config.sampler : null;

      for (const mod of modules) {
        if (!mod || typeof mod !== 'object') {
          issues.push(`Patch module entry invalid for ${pluginName}.`);
          continue;
        }
        if (!Array.isArray(mod.controls) || mod.controls.length === 0) {
          issues.push(`Patch module "${mod.name || '?'}" has no controls for ${pluginName}.`);
          continue;
        }

        for (const control of mod.controls) {
          if (controlIds.has(control.id)) {
            issues.push(`Duplicate control id "${control.id}" for ${pluginName}.`);
            continue;
          }
          controlIds.add(control.id);
          controlsById.set(control.id, control);

          if (!Number.isInteger(control.param)) {
            issues.push(`Control "${control.id}" has non-integer param for ${pluginName}.`);
          } else if (control.param >= 0) {
            if (positiveParams.has(control.param)) {
              issues.push(`Duplicate param ${control.param} for ${pluginName} (${positiveParams.get(control.param)} and ${control.id}).`);
            } else {
              positiveParams.set(control.param, control.id);
            }
          }

          const hasNumericRange = typeof control.min === 'number' && typeof control.max === 'number';
          if (hasNumericRange && control.min > control.max) {
            issues.push(`Control "${control.id}" has min > max for ${pluginName}.`);
          }
          if (control.curve === 'log' && hasNumericRange && (control.min <= 0 || control.max <= 0)) {
            issues.push(`Control "${control.id}" uses log curve with non-positive bounds for ${pluginName}.`);
          }
          if (control.type === 'select') {
            if (!Array.isArray(control.options) || control.options.length === 0) {
              issues.push(`Select control "${control.id}" has no options for ${pluginName}.`);
            }
            if (typeof control.val === 'number' && Array.isArray(control.options)) {
              if (control.val < 0 || control.val >= control.options.length) {
                issues.push(`Select control "${control.id}" default index is out of range for ${pluginName}.`);
              }
            }
          }
          if (control.type !== 'button' && hasNumericRange && typeof control.val === 'number') {
            if (control.val < control.min || control.val > control.max) {
              issues.push(`Control "${control.id}" default value is out of range for ${pluginName}.`);
            }
          }
        }
      }

      if (sampler) {
        const allowedPolicies = new Set(['standalone-dev', 'inscriptions-only', 'declared-only']);
        if (sampler.sourcePolicy && !allowedPolicies.has(sampler.sourcePolicy)) {
          issues.push(`Sampler sourcePolicy "${sampler.sourcePolicy}" is invalid for ${pluginName}.`);
        }
        const sourceCount =
          (typeof sampler.source === 'string' && sampler.source.trim() ? 1 : 0) +
          (Array.isArray(sampler.sources) ? sampler.sources.length : 0);
        if (sampler.sourcePolicy === 'declared-only' && sourceCount === 0) {
          issues.push(`Sampler declared-only policy requires source or sources for ${pluginName}.`);
        }
        if (sampler.maxSampleBytes !== undefined && (!Number.isInteger(sampler.maxSampleBytes) || sampler.maxSampleBytes <= 0)) {
          issues.push(`Sampler maxSampleBytes must be a positive integer for ${pluginName}.`);
        }
        if (sampler.maxSampleSeconds !== undefined && (!(typeof sampler.maxSampleSeconds === 'number') || sampler.maxSampleSeconds <= 0)) {
          issues.push(`Sampler maxSampleSeconds must be positive for ${pluginName}.`);
        }
        const defaults = sampler.defaults && typeof sampler.defaults === 'object' ? sampler.defaults : null;
        if (defaults) {
          if (typeof defaults.loopStart === 'number' && (defaults.loopStart < 0 || defaults.loopStart > 1)) {
            issues.push(`Sampler defaults.loopStart is out of range for ${pluginName}.`);
          }
          if (typeof defaults.loopEnd === 'number' && (defaults.loopEnd < 0 || defaults.loopEnd > 1)) {
            issues.push(`Sampler defaults.loopEnd is out of range for ${pluginName}.`);
          }
          if (
            typeof defaults.loopStart === 'number' &&
            typeof defaults.loopEnd === 'number' &&
            defaults.loopStart > defaults.loopEnd
          ) {
            issues.push(`Sampler loop defaults are inverted for ${pluginName}.`);
          }
        }
        if (sampler.sourcePolicy && sampler.sourcePolicy !== 'standalone-dev' && sampler.allowDataUrls === true) {
          warnings.push(`Sampler allowDataUrls should usually stay false outside standalone-dev for ${pluginName}.`);
        }
      }

      const presets = patch.config?.presets && typeof patch.config.presets === 'object' ? patch.config.presets : {};
      if (Object.keys(presets).length === 0) {
        warnings.push(`No presets found for ${pluginName}.`);
      }
      if (typeof patch.config?.defaultPreset === 'string' && patch.config.defaultPreset && !presets[patch.config.defaultPreset]) {
        issues.push(`defaultPreset "${patch.config.defaultPreset}" missing from presets for ${pluginName}.`);
      }

      for (const [presetName, presetValues] of Object.entries(presets)) {
        if (!presetValues || typeof presetValues !== 'object') {
          issues.push(`Preset "${presetName}" is not an object for ${pluginName}.`);
          continue;
        }
        for (const [controlId, value] of Object.entries(presetValues)) {
          const control = controlsById.get(controlId);
          if (!control) {
            issues.push(`Preset "${presetName}" references unknown control "${controlId}" for ${pluginName}.`);
            continue;
          }
          if (control.type !== 'button' && typeof value === 'number' && typeof control.min === 'number' && typeof control.max === 'number') {
            if (value < control.min || value > control.max) {
              issues.push(`Preset "${presetName}" sets "${controlId}" out of range for ${pluginName}.`);
            }
          }
        }
      }

      const version = manifest.version;
      const manifestRecord = [...moduleByName.values()].find((record) => record.name === `bvst.plugin.${pluginName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.manifest.v${version}`);
      const patchRecord = [...moduleByName.values()].find((record) => record.name === `bvst.plugin.${pluginName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.patch.v${version}`);
      const shellRecord = [...moduleByName.values()].find((record) => record.name === `bvst.plugin.${pluginName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.shell.v${version}`);
      if (!manifestRecord || !patchRecord || !shellRecord) {
        issues.push(`Module index entries missing for ${pluginName} v${version}.`);
      }

      if (issues.length > 0) {
        for (const issue of issues) fail(section, issue);
      }
      for (const item of warnings) warn(section, item);

      plugins.push({
        plugin: pluginName,
        family: family.key,
        version,
        control_count: controlIds.size,
        preset_count: Object.keys(presets).length
      });
    }
  }

  section.details.plugins = plugins;
  return section;
}

async function validateExternalities() {
  const section = createSection('externalities');
  const files = await walkFiles(path.join(bundleRoot, 'workspace'));
  const textExts = new Set(['.html', '.js', '.json', '.css', '.svg', '.txt', '.md']);
  const literals = [];
  const disallowedExecutablePatterns = [
    /\b(?:fetch|import)\s*\(\s*['"]https?:\/\//,
    /\bnew URL\(\s*['"]https?:\/\//,
    /\b(?:src|href)\s*=\s*["']https?:\/\//i,
    /url\(\s*['"]?https?:\/\//i
  ];

  for (const absPath of files) {
    const relPath = toPosix(path.relative(bundleRoot, absPath));
    if (!textExts.has(path.extname(absPath).toLowerCase())) {
      continue;
    }
    const content = await fs.readFile(absPath, 'utf8');
    const rawUrls = content.match(/https?:\/\/[^\s"')>]+|data:audio\/[^\s"')>]+/g) || [];
    for (const literal of rawUrls) {
      literals.push({ file: relPath, literal });
      if (!isAllowedLiteral(relPath, literal)) {
        fail(section, `Unexpected literal URL in ${relPath}: ${literal}`);
      }
    }
    for (const pattern of disallowedExecutablePatterns) {
      if (pattern.test(content)) {
        fail(section, `Executable remote dependency pattern found in ${relPath}.`);
      }
    }
  }

  section.details.literal_url_count = literals.length;
  section.details.literals = literals;
  return section;
}

async function validateSamplerRuntime() {
  const section = createSection('sampler_runtime');
  try {
    const schemaPath = path.join(bundleRoot, 'workspace', 'System', 'shared', 'bvst_patch_v1.schema.json');
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    const samplerProp = schema?.$defs?.BvstInitConfig?.properties?.sampler || null;
    const samplerConfig = schema?.$defs?.SamplerConfig || null;
    const policies = samplerConfig?.properties?.sourcePolicy?.enum || [];

    if (!samplerProp || samplerProp.$ref !== '#/$defs/SamplerConfig') {
      fail(section, 'Patch schema does not route config.sampler through $defs.SamplerConfig.');
    }
    if (!samplerConfig) {
      fail(section, 'Patch schema is missing $defs.SamplerConfig.');
    }
    if (!Array.isArray(policies) || policies.length < 3) {
      fail(section, 'SamplerConfig.sourcePolicy enum is missing expected policy options.');
    }

    const smokeHtml = path.join(bundleRoot, 'workspace', 'System', 'tests', 'sampler-smoke.html');
    const smokeJs = path.join(bundleRoot, 'workspace', 'System', 'tests', 'sampler-smoke.js');
    await fs.access(smokeHtml);
    await fs.access(smokeJs);

    section.details = {
      schema_ref: samplerProp ? samplerProp.$ref : null,
      source_policies: policies,
      sampler_smoke_html: toPosix(path.relative(bundleRoot, smokeHtml)),
      sampler_smoke_js: toPosix(path.relative(bundleRoot, smokeJs))
    };
  } catch (err) {
    fail(section, err && err.message ? err.message : String(err));
  }
  return section;
}

async function validateHttpSmoke() {
  const section = createSection('http_workspace_smoke');
  try {
    section.details = await runWorkspaceHttpSmoke();
  } catch (err) {
    if (isListenPermissionError(err)) {
      section.status = 'skipped';
      section.details.reason = 'Local HTTP bind was blocked by the current execution environment.';
      return section;
    }
    fail(section, err && err.message ? err.message : String(err));
  }
  return section;
}

async function validateSimulation() {
  const section = createSection('inscription_simulation');
  try {
    section.details = await simulateInscriptionRelease();
  } catch (err) {
    fail(section, err && err.message ? err.message : String(err));
  }
  return section;
}

async function validateBrowserSmoke(enabled) {
  const section = createSection('browser_smoke');
  if (!enabled) {
    section.status = 'skipped';
    section.details.reason = 'Run with --with-browser-smoke to attempt headless browser bootstrap checks.';
    return section;
  }

  try {
    const result = await runWorkspaceBrowserSmoke();
    if (!result.available) {
      section.status = 'skipped';
      section.details.reason = result.reason;
      return section;
    }
    section.details = {
      baseUrl: result.baseUrl,
      screenshotRoot: result.screenshotRoot,
      screenshots: result.screenshots,
      samplerScreenshots: result.samplerScreenshots
    };
  } catch (err) {
    if (isListenPermissionError(err)) {
      section.status = 'skipped';
      section.details.reason = 'Local browser smoke could not bind a workspace server in the current execution environment.';
      return section;
    }
    fail(section, err && err.message ? err.message : String(err));
  }
  return section;
}

function summarizeSections(sections) {
  return {
    failed: sections.filter((section) => section.status === 'failed').length,
    passed_with_warnings: sections.filter((section) => section.status === 'passed_with_warnings').length,
    passed: sections.filter((section) => section.status === 'passed').length,
    skipped: sections.filter((section) => section.status === 'skipped').length
  };
}

export async function runPreInscriptionSafetyChecks(options = {}) {
  const sections = [];

  const integrity = createSection('bundle_integrity');
  try {
    const result = await verifyBundle();
    integrity.details.module_count = result.moduleIndex.length;
  } catch (err) {
    fail(integrity, err && err.message ? err.message : String(err));
  }
  sections.push(integrity);
  sections.push(await validateManifestAndPatchSemantics());
  sections.push(await validateSamplerRuntime());
  sections.push(await validateExternalities());
  sections.push(await validateHttpSmoke());
  sections.push(await validateSimulation());
  sections.push(await validateBrowserSmoke(Boolean(options.withBrowserSmoke)));

  const report = {
    generated_at: new Date().toISOString(),
    bundle_root: bundleRoot,
    summary: summarizeSections(sections),
    sections
  };

  await writeJson(options.out || 'verification/pre-inscription.report.json', report);

  if (report.summary.failed > 0) {
    throw new Error(`Pre-inscription safety checks failed in ${report.summary.failed} section(s).`);
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await runPreInscriptionSafetyChecks(args);
  console.log(
    `Pre-inscription safety checks passed: ${report.summary.passed} passed, ${report.summary.passed_with_warnings} with warnings, ${report.summary.skipped} skipped.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
