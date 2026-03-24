#!/usr/bin/env node
/**
 * validate-inscription-readiness.mjs — Pre-inscription test suite
 *
 * Validates the full BVST bundle is correctly formatted for inscription:
 *   1. File integrity — every leaf exists, hash/bytes/chunks match declarations
 *   2. MIME plausibility — declared MIME types match actual file content
 *   3. Chunk limits — no file exceeds helper route limits
 *   4. Dependency graph — valid topological order, no cycles, no dangling refs
 *   5. Catalog template structure — all templates are valid JSON with required fields
 *   6. Simulated render pass — fake token IDs resolve every catalog cleanly
 *   7. Token map consistency — no duplicate entries, structure matches module index
 *   8. Idempotent re-render — rendering twice with same state yields identical output
 *   9. Cross-index consistency — module-index ↔ batch files ↔ token map all agree
 *
 * Modes:
 *   --live   Use real token-map.runtime.json (for mid-inscription validation)
 *   (default) Simulate with fake token IDs starting at 1000
 *
 * Usage:
 *   node scripts/validate-inscription-readiness.mjs
 *   node scripts/validate-inscription-readiness.mjs --live
 *   node scripts/validate-inscription-readiness.mjs --out verification/validation-report.json
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  bundleRoot,
  defaultTokenMapPath,
  defaultRenderRoot,
  defaultRenderedIndexPath,
  CHUNK_SIZE,
  HELPER_LIMIT,
  absFromLogicalPath,
  displayPath,
  ensureDir,
  fileMetrics,
  isTokenResolved,
  loadModuleIndex,
  loadExecutionBatches,
  loadBatchArtifactLookup,
  readJsonAt,
  writeJsonAt,
  pathExists,
  createResolutionSignature,
  toPosix
} from './_inscription-helpers.mjs';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isLive = args.includes('--live');
const outIndex = args.indexOf('--out');
const outPath = outIndex !== -1 && args[outIndex + 1]
  ? path.resolve(args[outIndex + 1])
  : null;

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const results = [];
let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(suite, test, detail = '') {
  passCount++;
  results.push({ suite, test, status: 'pass', detail });
}

function fail(suite, test, detail) {
  failCount++;
  results.push({ suite, test, status: 'FAIL', detail });
  console.error(`  FAIL  ${suite} > ${test}: ${detail}`);
}

function warn(suite, test, detail) {
  warnCount++;
  results.push({ suite, test, status: 'warn', detail });
  console.warn(`  WARN  ${suite} > ${test}: ${detail}`);
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIME_SIGNATURES = {
  'application/javascript': { exts: ['.js', '.mjs'], startPatterns: [/^\s*(\/[/*]|['"`]use |import |export |const |let |var |function |class |window\.|document\.|self\.)/, /^\s*\(/] },
  'text/css': { exts: ['.css'], startPatterns: [/^\s*(\/\*|@|[.#:a-z[]|html|body|:root)/i] },
  'application/json': { exts: ['.json'], validator: (buf) => { JSON.parse(buf.toString('utf8')); return true; } },
  'application/wasm': { exts: ['.wasm'], startBytes: [0x00, 0x61, 0x73, 0x6d] }, // \0asm magic
  'text/html': { exts: ['.html', '.htm'], startPatterns: [/^\s*(<\!DOCTYPE|<html|<head|<body|<script)/i] },
};

function checkMimePlausibility(absPath, declaredMime, buf) {
  const ext = path.extname(absPath).toLowerCase();
  const sig = MIME_SIGNATURES[declaredMime];
  if (!sig) return { ok: true, reason: 'unknown MIME, skipped' };

  // Extension check
  if (sig.exts && !sig.exts.includes(ext)) {
    return { ok: false, reason: `extension ${ext} does not match MIME ${declaredMime} (expected ${sig.exts.join('/')})` };
  }

  // Magic bytes
  if (sig.startBytes) {
    for (let i = 0; i < sig.startBytes.length; i++) {
      if (buf[i] !== sig.startBytes[i]) {
        return { ok: false, reason: `magic bytes mismatch for ${declaredMime}` };
      }
    }
    return { ok: true };
  }

  // Validator function (e.g. JSON.parse)
  if (sig.validator) {
    try {
      sig.validator(buf);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `content validation failed for ${declaredMime}: ${e.message}` };
    }
  }

  // Regex start patterns (text files)
  if (sig.startPatterns) {
    const head = buf.slice(0, 512).toString('utf8');
    // Skip BOM
    const clean = head.replace(/^\uFEFF/, '');
    const matched = sig.startPatterns.some(rx => rx.test(clean));
    if (!matched) {
      return { ok: false, reason: `content start does not match any known pattern for ${declaredMime}: "${clean.substring(0, 60)}..."` };
    }
    return { ok: true };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// 1. File integrity
// ---------------------------------------------------------------------------

async function testFileIntegrity(moduleIndex) {
  section('1. File Integrity');
  let checked = 0;

  for (const mod of moduleIndex) {
    if (mod.kind !== 'leaf') continue;
    const absPath = absFromLogicalPath(mod.bundle_path);

    if (!(await pathExists(absPath))) {
      fail('integrity', `${mod.name} exists`, `file not found: ${displayPath(absPath)}`);
      continue;
    }

    const metrics = await fileMetrics(absPath);
    checked++;

    if (metrics.sha256 !== mod.expected_sha256) {
      fail('integrity', `${mod.name} sha256`, `expected ${mod.expected_sha256}, got ${metrics.sha256}`);
    } else {
      pass('integrity', `${mod.name} sha256`);
    }

    if (metrics.bytes !== mod.bytes) {
      fail('integrity', `${mod.name} bytes`, `expected ${mod.bytes}, got ${metrics.bytes}`);
    } else {
      pass('integrity', `${mod.name} bytes`);
    }

    if (metrics.chunks !== mod.chunks) {
      fail('integrity', `${mod.name} chunks`, `expected ${mod.chunks}, got ${metrics.chunks}`);
    } else {
      pass('integrity', `${mod.name} chunks`);
    }
  }
  console.log(`  ${checked} leaf files verified`);
}

// ---------------------------------------------------------------------------
// 2. MIME plausibility
// ---------------------------------------------------------------------------

async function testMimePlausibility(moduleIndex) {
  section('2. MIME Plausibility');
  let checked = 0;

  for (const mod of moduleIndex) {
    if (mod.kind !== 'leaf') continue;
    const absPath = absFromLogicalPath(mod.bundle_path);
    if (!(await pathExists(absPath))) continue;

    const buf = await fs.readFile(absPath);
    const result = checkMimePlausibility(absPath, mod.mime_type, buf);
    checked++;

    if (!result.ok) {
      fail('mime', `${mod.name} MIME`, result.reason);
    } else {
      pass('mime', `${mod.name} MIME`);
    }
  }
  console.log(`  ${checked} files checked`);
}

// ---------------------------------------------------------------------------
// 3. Chunk limits
// ---------------------------------------------------------------------------

async function testChunkLimits(moduleIndex) {
  section('3. Chunk Limits');

  for (const mod of moduleIndex) {
    if (mod.kind !== 'leaf') continue;
    const expectedChunks = Math.ceil(mod.bytes / CHUNK_SIZE) || 0;

    if (expectedChunks !== mod.chunks) {
      fail('chunks', `${mod.name} chunk calc`, `bytes=${mod.bytes} should yield ${expectedChunks} chunks, declared ${mod.chunks}`);
    } else {
      pass('chunks', `${mod.name} chunk calc`);
    }

    if (mod.route === 'helper' && mod.chunks > HELPER_LIMIT) {
      fail('chunks', `${mod.name} helper limit`, `${mod.chunks} chunks exceeds helper limit of ${HELPER_LIMIT}`);
    } else {
      pass('chunks', `${mod.name} within limit`);
    }

    if (mod.bytes === 0) {
      warn('chunks', `${mod.name} empty`, 'file has 0 bytes');
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Dependency graph — topological ordering + no cycles/dangling refs
// ---------------------------------------------------------------------------

async function testDependencyGraph(moduleIndex, batches) {
  section('4. Dependency Graph');

  const allNames = new Set(moduleIndex.map(m => m.name));

  // Check no dangling dependency refs
  for (const mod of moduleIndex) {
    for (const dep of mod.dependency_names || []) {
      if (!allNames.has(dep)) {
        fail('deps', `${mod.name} dep ref`, `depends on "${dep}" which does not exist in module index`);
      } else {
        pass('deps', `${mod.name} → ${dep} exists`);
      }
    }
  }

  // Check for cycles via DFS
  const adjMap = new Map();
  for (const mod of moduleIndex) {
    adjMap.set(mod.name, mod.dependency_names || []);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  allNames.forEach(n => color.set(n, WHITE));
  let hasCycle = false;
  const cycleParticipants = [];

  function dfs(node, path) {
    color.set(node, GRAY);
    for (const dep of adjMap.get(node) || []) {
      if (!color.has(dep)) continue;
      if (color.get(dep) === GRAY) {
        hasCycle = true;
        cycleParticipants.push(`${node} → ${dep} (cycle via: ${path.join(' → ')})`);
        return;
      }
      if (color.get(dep) === WHITE) {
        dfs(dep, [...path, dep]);
      }
    }
    color.set(node, BLACK);
  }

  for (const name of allNames) {
    if (color.get(name) === WHITE) dfs(name, [name]);
  }

  if (hasCycle) {
    fail('deps', 'no cycles', cycleParticipants.join('; '));
  } else {
    pass('deps', 'no cycles in dependency graph');
  }

  // Check batch ordering: within each batch, every artifact appears after its depends_on
  for (const { file, batch } of batches) {
    const seen = new Set();
    // Include all previously-inscribed artifacts (from prior batches) as resolved
    // In the batch system, prerequisite_batches list what came before
    for (const preBatch of batches) {
      if (preBatch.file === file) break;
      for (const art of preBatch.batch.artifacts) {
        seen.add(art.name);
      }
    }

    let orderValid = true;
    for (const art of batch.artifacts) {
      for (const dep of art.depends_on || []) {
        if (!seen.has(dep)) {
          fail('deps', `${file} topo order`, `"${art.name}" (order ${art.order}) appears before dependency "${dep}"`);
          orderValid = false;
        }
      }
      seen.add(art.name);
    }
    if (orderValid) {
      pass('deps', `${file} topological order valid`);
    }
  }

  // Verify topo_order in module-index is monotonically valid
  const byTopo = moduleIndex.filter(m => m.topo_order != null).sort((a, b) => a.topo_order - b.topo_order);
  const resolvedByTopo = new Set();
  let topoValid = true;
  for (const mod of byTopo) {
    for (const dep of mod.dependency_names || []) {
      if (!resolvedByTopo.has(dep)) {
        fail('deps', `topo_order consistency`, `"${mod.name}" (topo ${mod.topo_order}) has dependency "${dep}" that hasn't appeared yet`);
        topoValid = false;
      }
    }
    resolvedByTopo.add(mod.name);
  }
  if (topoValid) {
    pass('deps', 'module-index topo_order is valid');
  }
}

// ---------------------------------------------------------------------------
// 5. Catalog template structure
// ---------------------------------------------------------------------------

async function testCatalogTemplates(moduleIndex) {
  section('5. Catalog Templates');
  const catalogs = moduleIndex.filter(m => m.kind === 'catalog');

  for (const cat of catalogs) {
    const absPath = absFromLogicalPath(cat.bundle_path);
    if (!(await pathExists(absPath))) {
      fail('catalog-tmpl', `${cat.name} exists`, `template not found: ${displayPath(absPath)}`);
      continue;
    }

    let data;
    try {
      const raw = await fs.readFile(absPath, 'utf8');
      data = JSON.parse(raw);
      pass('catalog-tmpl', `${cat.name} valid JSON`);
    } catch (e) {
      fail('catalog-tmpl', `${cat.name} valid JSON`, e.message);
      continue;
    }

    // Required fields
    if (!data.name) {
      fail('catalog-tmpl', `${cat.name} has name field`, 'missing "name"');
    } else if (data.name !== cat.name) {
      fail('catalog-tmpl', `${cat.name} name matches`, `template name="${data.name}" ≠ index name="${cat.name}"`);
    } else {
      pass('catalog-tmpl', `${cat.name} name matches`);
    }

    if (!data.type) {
      fail('catalog-tmpl', `${cat.name} has type`, 'missing "type" field');
    } else {
      pass('catalog-tmpl', `${cat.name} has type`);
    }

    // Check that every module entry has token_id: null placeholder
    const modules = data.modules || data.catalogs || data.families || data.plugins || data.releases || [];
    const moduleEntries = Array.isArray(modules) ? modules : [];
    let hasNullTokens = true;
    for (const entry of moduleEntries) {
      if (entry && typeof entry === 'object' && 'token_id' in entry) {
        if (entry.token_id !== null) {
          hasNullTokens = false;
          warn('catalog-tmpl', `${cat.name} template has non-null token_id`, `module "${entry.name}" has token_id=${entry.token_id}`);
        }
      }
    }
    if (hasNullTokens && moduleEntries.length > 0) {
      pass('catalog-tmpl', `${cat.name} all token_ids null in template`);
    }

    // Check declared dependencies match modules listed in catalog
    const catModuleNames = moduleEntries
      .filter(e => e && typeof e === 'object' && e.name)
      .map(e => e.name);
    for (const dep of cat.dependency_names || []) {
      if (!catModuleNames.includes(dep)) {
        // Dependency might be a transitive dep — only warn
        warn('catalog-tmpl', `${cat.name} dep coverage`, `dependency "${dep}" not directly listed as a module entry`);
      }
    }
  }
  console.log(`  ${catalogs.length} catalog templates checked`);
}

// ---------------------------------------------------------------------------
// 6. Simulated render pass
// ---------------------------------------------------------------------------

async function testSimulatedRender(moduleIndex, tokenMap) {
  section('6. Simulated Render Pass');

  // Build a token entries map — either live or simulated
  const entries = new Map(Object.entries(tokenMap.entries || {}));
  let simulated = false;

  if (!isLive) {
    // Assign fake token IDs to all leaves in topological order
    const sorted = [...moduleIndex].sort((a, b) => (a.topo_order || 999) - (b.topo_order || 999));
    let fakeId = 1000;
    for (const mod of sorted) {
      if (mod.kind === 'leaf') {
        entries.set(mod.name, {
          token_id: fakeId,
          txid: `0x${'f'.repeat(64).slice(0, 60)}${String(fakeId).padStart(4, '0')}`,
          block_height: 7000000 + fakeId
        });
        fakeId++;
      }
    }
    simulated = true;
    console.log(`  Using simulated token IDs (${fakeId - 1000} leaves assigned)`);
  } else {
    const resolved = [...entries.values()].filter(e => isTokenResolved(e)).length;
    console.log(`  Using live token map (${resolved}/${entries.size} resolved)`);
  }

  // Process catalogs in topological order so simulated IDs cascade correctly
  const catalogs = moduleIndex
    .filter(m => m.kind === 'catalog')
    .sort((a, b) => (a.topo_order || 999) - (b.topo_order || 999));
  const batchLookup = await loadBatchArtifactLookup();
  let nextCatalogFakeId = 2000;

  for (const cat of catalogs) {
    const batchEntry = batchLookup.get(cat.name);
    const depNames = batchEntry
      ? (batchEntry.artifact.depends_on || [])
      : (cat.dependency_names || []);

    const missing = depNames.filter(dep => {
      const entry = entries.get(dep);
      return !entry || !isTokenResolved(entry);
    });

    if (missing.length > 0) {
      if (isLive) {
        // In live mode, some catalogs won't be ready yet — just report
        pass('render-sim', `${cat.name} deps (${depNames.length - missing.length}/${depNames.length} resolved)`,
          `waiting on: ${missing.join(', ')}`);
      } else {
        fail('render-sim', `${cat.name} all deps resolved`, `missing: ${missing.join(', ')}`);
      }
      continue;
    }

    pass('render-sim', `${cat.name} all ${depNames.length} deps resolved`);

    // In simulated mode, assign a fake token ID to this catalog NOW
    // so downstream catalogs can resolve their dependency on it
    if (simulated && !isTokenResolved(entries.get(cat.name))) {
      entries.set(cat.name, {
        token_id: nextCatalogFakeId,
        txid: `0x${'a'.repeat(60)}${String(nextCatalogFakeId).padStart(4, '0')}`,
        block_height: 7002000 + nextCatalogFakeId
      });
      nextCatalogFakeId++;
    }

    // Try actually rendering the template
    const absPath = absFromLogicalPath(cat.bundle_path);
    if (!(await pathExists(absPath))) continue;

    try {
      const raw = await fs.readFile(absPath, 'utf8');
      const template = JSON.parse(raw);

      // Walk and resolve token references
      const resolved = resolveNodeDeep(template, entries);
      const issues = collectUnresolvedFields(resolved, entries);

      if (issues.length > 0) {
        fail('render-sim', `${cat.name} fully resolved`, `${issues.length} unresolved field(s): ${issues.slice(0, 3).join(', ')}`);
      } else {
        pass('render-sim', `${cat.name} renders cleanly`);
      }

      // Verify rendered JSON is valid
      const rendered = JSON.stringify(resolved, null, 2);
      try {
        JSON.parse(rendered);
        pass('render-sim', `${cat.name} rendered JSON valid`);
      } catch (e) {
        fail('render-sim', `${cat.name} rendered JSON valid`, e.message);
      }

      // Check no null token_id fields remain after resolution
      const nullTokens = findNullTokenIds(resolved);
      if (nullTokens.length > 0 && !isLive) {
        fail('render-sim', `${cat.name} no null token_ids post-render`, `${nullTokens.length} null token_id(s): ${nullTokens.slice(0, 3).join(', ')}`);
      } else {
        pass('render-sim', `${cat.name} no null token_ids post-render`);
      }

    } catch (e) {
      fail('render-sim', `${cat.name} render attempt`, e.message);
    }
  }
}

// Deep resolve: fill in token_id/txid/block_height from entries map
function resolveNodeDeep(node, entries) {
  if (Array.isArray(node)) {
    return node.map(v => resolveNodeDeep(v, entries));
  }
  if (!node || typeof node !== 'object') return node;

  const resolved = {};
  for (const [key, value] of Object.entries(node)) {
    resolved[key] = resolveNodeDeep(value, entries);
    // If this is a string reference to a known token entry, inject companion fields
    if (key !== 'name' && typeof value === 'string' && entries.has(value)) {
      const ref = entries.get(value);
      resolved[`${key}_token_id`] = ref.token_id;
      resolved[`${key}_txid`] = ref.txid;
      resolved[`${key}_block_height`] = ref.block_height;
    }
  }
  // If the node has a name matching a token entry, fill in its own fields
  if (typeof node.name === 'string' && entries.has(node.name)) {
    const ref = entries.get(node.name);
    if ('token_id' in node) resolved.token_id = ref.token_id;
    if ('txid' in node) resolved.txid = ref.txid;
    if ('block_height' in node) resolved.block_height = ref.block_height;
  }
  return resolved;
}

function collectUnresolvedFields(node, entries, path = '$', issues = []) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectUnresolvedFields(v, entries, `${path}[${i}]`, issues));
    return issues;
  }
  if (!node || typeof node !== 'object') return issues;

  if (typeof node.name === 'string' && entries.has(node.name)) {
    if ('token_id' in node && node.token_id === null) issues.push(`${path}.name=${node.name}`);
    if ('txid' in node && node.txid === null) issues.push(`${path}.txid null for ${node.name}`);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'name') continue;
    collectUnresolvedFields(value, entries, `${path}.${key}`, issues);
  }
  return issues;
}

function findNullTokenIds(node, path = '$', results = []) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => findNullTokenIds(v, `${path}[${i}]`, results));
    return results;
  }
  if (!node || typeof node !== 'object') return results;
  if ('token_id' in node && node.token_id === null) {
    results.push(`${path}.name=${node.name || '?'}`);
  }
  for (const [key, value] of Object.entries(node)) {
    findNullTokenIds(value, `${path}.${key}`, results);
  }
  return results;
}

// ---------------------------------------------------------------------------
// 7. Token map consistency
// ---------------------------------------------------------------------------

async function testTokenMapConsistency(moduleIndex, tokenMap) {
  section('7. Token Map Consistency');

  const tmEntries = tokenMap.entries || {};
  const tmNames = new Set(Object.keys(tmEntries));
  const indexNames = new Set(moduleIndex.map(m => m.name));

  // Every module-index entry should have a token map slot
  for (const name of indexNames) {
    if (!tmNames.has(name)) {
      fail('token-map', `${name} in token map`, 'missing from token-map entries');
    } else {
      pass('token-map', `${name} in token map`);
    }
  }

  // Every token map entry should exist in module index
  for (const name of tmNames) {
    if (!indexNames.has(name)) {
      warn('token-map', `${name} in module index`, 'token map entry has no matching module');
    }
  }

  // No duplicate token IDs (among resolved entries)
  const tokenIdsSeen = new Map();
  for (const [name, entry] of Object.entries(tmEntries)) {
    if (entry.token_id != null) {
      if (tokenIdsSeen.has(entry.token_id)) {
        fail('token-map', `unique token_id ${entry.token_id}`, `shared by "${name}" and "${tokenIdsSeen.get(entry.token_id)}"`);
      } else {
        tokenIdsSeen.set(entry.token_id, name);
      }
    }
  }
  if (tokenIdsSeen.size > 0) {
    pass('token-map', `${tokenIdsSeen.size} token IDs are unique`);
  }

  // Verify resolved entries have all three fields populated
  for (const [name, entry] of Object.entries(tmEntries)) {
    const hasAny = entry.token_id != null || entry.txid != null || entry.block_height != null;
    const hasAll = entry.token_id != null && entry.txid != null && entry.block_height != null;
    if (hasAny && !hasAll) {
      fail('token-map', `${name} complete`, `partially resolved: token_id=${entry.token_id}, txid=${entry.txid}, block_height=${entry.block_height}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 8. Idempotent re-render
// ---------------------------------------------------------------------------

async function testIdempotentRender(moduleIndex, tokenMap) {
  section('8. Idempotent Re-render');

  if (!isLive) {
    console.log('  Skipped in simulated mode (no rendered/ output to compare)');
    pass('idempotent', 'skipped (simulated mode)');
    return;
  }

  // Check if any rendered files exist
  const renderRoot = path.join(bundleRoot, 'rendered');
  if (!(await pathExists(renderRoot))) {
    console.log('  No rendered/ directory yet — skipped');
    pass('idempotent', 'skipped (no rendered/ dir)');
    return;
  }

  const entries = await fs.readdir(renderRoot);
  const jsonFiles = entries.filter(f => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    console.log('  No rendered catalogs yet — skipped');
    pass('idempotent', 'skipped (no rendered catalogs)');
    return;
  }

  // For each rendered catalog, read it, re-resolve from template, compare
  const tokenEntries = new Map(Object.entries(tokenMap.entries || {}));
  let allMatch = true;

  for (const file of jsonFiles) {
    const renderedPath = path.join(renderRoot, file);
    const renderedData = await readJsonAt(renderedPath);
    const catName = renderedData.name;
    if (!catName) continue;

    const mod = moduleIndex.find(m => m.name === catName);
    if (!mod) continue;

    const templatePath = absFromLogicalPath(mod.bundle_path);
    if (!(await pathExists(templatePath))) continue;

    const template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
    const reRendered = resolveNodeDeep(template, tokenEntries);

    // Compare serialized output (ignoring render metadata fields we add)
    const rendered1 = JSON.stringify(renderedData, null, 2);
    const rendered2 = JSON.stringify(reRendered, null, 2);

    if (rendered1 === rendered2) {
      pass('idempotent', `${catName} re-render matches`);
    } else {
      fail('idempotent', `${catName} re-render matches`, 'rendered output differs on re-render');
      allMatch = false;
    }
  }
  if (allMatch && jsonFiles.length > 0) {
    console.log(`  ${jsonFiles.length} rendered catalog(s) are idempotent`);
  }
}

// ---------------------------------------------------------------------------
// 9. Cross-index consistency (module-index ↔ batches ↔ token map)
// ---------------------------------------------------------------------------

async function testCrossIndexConsistency(moduleIndex, batches, tokenMap) {
  section('9. Cross-Index Consistency');

  const batchLookup = await loadBatchArtifactLookup();
  const tmEntries = tokenMap.entries || {};

  // Every batch artifact should exist in module index
  for (const [name, { file, artifact }] of batchLookup) {
    const mod = moduleIndex.find(m => m.name === name);
    if (!mod) {
      fail('cross-index', `${name} in module index`, `batch ${file} references artifact not in module-index`);
      continue;
    }

    // sha256 match
    if (mod.kind === 'leaf' && artifact.sha256 && artifact.sha256 !== mod.expected_sha256) {
      fail('cross-index', `${name} sha256 batch↔index`, `batch=${artifact.sha256} ≠ index=${mod.expected_sha256}`);
    } else if (mod.kind === 'leaf' && artifact.sha256) {
      pass('cross-index', `${name} sha256 match`);
    }

    // bytes match
    if (artifact.bytes != null && artifact.bytes !== mod.bytes) {
      fail('cross-index', `${name} bytes batch↔index`, `batch=${artifact.bytes} ≠ index=${mod.bytes}`);
    } else if (artifact.bytes != null) {
      pass('cross-index', `${name} bytes match`);
    }

    // chunks match
    if (artifact.chunks != null && artifact.chunks !== mod.chunks) {
      fail('cross-index', `${name} chunks batch↔index`, `batch=${artifact.chunks} ≠ index=${mod.chunks}`);
    } else if (artifact.chunks != null) {
      pass('cross-index', `${name} chunks match`);
    }

    // route match
    if (artifact.route && artifact.route !== mod.route) {
      fail('cross-index', `${name} route batch↔index`, `batch=${artifact.route} ≠ index=${mod.route}`);
    } else if (artifact.route) {
      pass('cross-index', `${name} route match`);
    }

    // depends_on consistency
    const batchDeps = new Set(artifact.depends_on || []);
    const indexDeps = new Set(mod.dependency_names || []);
    for (const dep of batchDeps) {
      if (!indexDeps.has(dep)) {
        warn('cross-index', `${name} dep alignment`, `batch has dep "${dep}" not in module-index dependency_names`);
      }
    }
  }

  // Every module-index entry should be in a batch
  const batchNames = new Set(batchLookup.keys());
  for (const mod of moduleIndex) {
    if (!batchNames.has(mod.name)) {
      warn('cross-index', `${mod.name} in batch`, 'module-index entry not found in any batch file');
    }
  }

  // Count alignment
  const batchTotal = batchLookup.size;
  const indexTotal = moduleIndex.length;
  const tmTotal = Object.keys(tmEntries).length;
  console.log(`  Counts: module-index=${indexTotal}, batches=${batchTotal}, token-map=${tmTotal}`);
  if (batchTotal !== indexTotal) {
    warn('cross-index', 'artifact count', `batch total (${batchTotal}) ≠ module-index total (${indexTotal})`);
  }
  if (tmTotal !== indexTotal) {
    warn('cross-index', 'token map count', `token-map entries (${tmTotal}) ≠ module-index total (${indexTotal})`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  BVST Pre-Inscription Validation Suite           ║`);
  console.log(`║  Mode: ${isLive ? 'LIVE (real token map)' : 'SIMULATED (fake token IDs)'}${' '.repeat(isLive ? 14 : 10)}║`);
  console.log(`╚══════════════════════════════════════════════════╝`);

  const moduleIndex = await loadModuleIndex();
  const batches = await loadExecutionBatches();
  const tokenMap = await readJsonAt(defaultTokenMapPath);

  console.log(`\nBundle: ${displayPath(bundleRoot)}`);
  console.log(`Artifacts: ${moduleIndex.length} (${moduleIndex.filter(m => m.kind === 'leaf').length} leaves, ${moduleIndex.filter(m => m.kind === 'catalog').length} catalogs)`);

  await testFileIntegrity(moduleIndex);
  await testMimePlausibility(moduleIndex);
  await testChunkLimits(moduleIndex);
  await testDependencyGraph(moduleIndex, batches);
  await testCatalogTemplates(moduleIndex);
  await testSimulatedRender(moduleIndex, tokenMap);
  await testTokenMapConsistency(moduleIndex, tokenMap);
  await testIdempotentRender(moduleIndex, tokenMap);
  await testCrossIndexConsistency(moduleIndex, batches, tokenMap);

  // Summary
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  PASS: ${passCount}  FAIL: ${failCount}  WARN: ${warnCount}`);
  console.log(`══════════════════════════════════════════════════`);

  if (failCount > 0) {
    console.log(`\n❌ ${failCount} failure(s) — DO NOT INSCRIBE until resolved\n`);
  } else if (warnCount > 0) {
    console.log(`\n⚠  All checks passed with ${warnCount} warning(s)\n`);
  } else {
    console.log(`\n✅ All checks passed — bundle is inscription-ready\n`);
  }

  // Write report if requested
  if (outPath) {
    const report = {
      generated_at: new Date().toISOString(),
      mode: isLive ? 'live' : 'simulated',
      bundle_root: displayPath(bundleRoot),
      artifact_count: moduleIndex.length,
      pass_count: passCount,
      fail_count: failCount,
      warn_count: warnCount,
      verdict: failCount > 0 ? 'BLOCKED' : warnCount > 0 ? 'PASS_WITH_WARNINGS' : 'PASS',
      results
    };
    await writeJsonAt(outPath, report);
    console.log(`Report written to ${displayPath(outPath)}`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(2);
});
