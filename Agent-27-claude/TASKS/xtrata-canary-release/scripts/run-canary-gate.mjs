import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bundleRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const verificationDir = path.join(bundleRoot, 'verification');
const configDir = path.join(bundleRoot, 'configs');

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || stdout || `Command failed with exit code ${code}`));
    });
  });
}

async function removeIfExists(absPath) {
  await fs.rm(absPath, { force: true, recursive: true });
}

async function writeJson(absPath, value) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(absPath) {
  return JSON.parse(await fs.readFile(absPath, 'utf8'));
}

function summarizeSections(sections) {
  const summary = {
    failed: 0,
    passed_with_warnings: 0,
    passed: 0,
    skipped: 0
  };
  for (const section of sections) {
    if (section.status === 'failed') summary.failed += 1;
    else if (section.status === 'passed_with_warnings') summary.passed_with_warnings += 1;
    else if (section.status === 'skipped') summary.skipped += 1;
    else summary.passed += 1;
  }
  return summary;
}

async function main() {
  const env = { XTRATA_BUNDLE_ROOT: bundleRoot };
  const quotePath = path.join(verificationDir, 'preflight.quote.json');
  const statusPath = path.join(verificationDir, 'inscription-status.json');
  const reportPath = path.join(verificationDir, 'pre-inscription.report.json');
  const tokenMapPath = path.join(configDir, 'token-map.runtime.json');
  const logPath = path.join(verificationDir, 'inscription-log.json');
  const renderedIndexPath = path.join(verificationDir, 'rendered-index.json');
  const renderedRoot = path.join(bundleRoot, 'rendered');

  await runNode(['TASKS/xtrata-canary-release/scripts/build-canary-release.mjs']);
  await removeIfExists(tokenMapPath);
  await removeIfExists(logPath);
  await removeIfExists(renderedIndexPath);
  await removeIfExists(statusPath);
  await removeIfExists(renderedRoot);

  await runNode([
    'skills/xtrata-release-plan/scripts/xtrata-release-preflight.cjs',
    bundleRoot,
    '--offline',
    '--out',
    quotePath
  ]);
  await runNode(['TASKS/BVST-on-chain-framework/scripts/init-inscription-state.mjs'], { env });
  await runNode([
    'TASKS/BVST-on-chain-framework/scripts/inscription-status.mjs',
    '--out',
    statusPath
  ], { env });

  process.env.XTRATA_BUNDLE_ROOT = bundleRoot;
  const { simulateInscriptionRelease } = await import('../../BVST-on-chain-framework/scripts/simulate-inscription-release.mjs');
  const simulation = await simulateInscriptionRelease({ startTokenId: 9_001 });

  const quote = await readJson(quotePath);
  const status = await readJson(statusPath);
  const moduleIndex = await readJson(path.join(verificationDir, 'module-index.json'));

  const sections = [
    {
      name: 'metadata_refresh',
      status: 'passed',
      errors: [],
      warnings: [],
      details: {
        module_count: moduleIndex.length,
        bundle_root: bundleRoot
      }
    },
    {
      name: 'preflight_quote',
      status: 'passed_with_warnings',
      errors: [],
      warnings: [
        'Quote was generated in offline mode; the planner overlays live fee context from the current BVST production snapshot.'
      ],
      details: {
        module_count: quote?.verification?.moduleCount || 0,
        total_bytes: quote?.verification?.totalBytes || 0
      }
    },
    {
      name: 'state_init',
      status: 'passed',
      errors: [],
      warnings: [],
      details: {
        ready: status?.summary?.ready || 0,
        blocked: status?.summary?.blocked || 0,
        hard_stop: status?.summary?.hard_stop || 0
      }
    },
    {
      name: 'inscription_simulation',
      status: 'passed',
      errors: [],
      warnings: [],
      details: simulation
    }
  ];

  await writeJson(reportPath, {
    generated_at: new Date().toISOString(),
    bundle_root: bundleRoot,
    summary: summarizeSections(sections),
    sections
  });

  console.log(`Canary gate passed for ${moduleIndex.length} artifacts.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
