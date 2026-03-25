#!/usr/bin/env node
/**
 * Iterative hash fixer for BVST on-chain framework.
 * Reads every entry in module-index.json, computes actual SHA-256 from the bundle file,
 * updates module-index, then propagates into batch files and catalog files.
 * Runs iteratively until stable (catalogs are themselves indexed, so changing a catalog
 * changes its own hash entry).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const INDEX_PATH = join(ROOT, 'verification', 'module-index.json');
const BATCHES_DIR = join(ROOT, 'batches');
const CATALOGS_DIR = join(ROOT, 'catalogs');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
function writeJson(p, obj) { writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }

function findFiles(dir, ext) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(ext)) {
      results.push(join(e.parentPath || e.path, e.name));
    }
  }
  return results;
}

function iterate() {
  const index = readJson(INDEX_PATH);
  let changes = 0;

  // Step 1: Update module-index hashes from actual files
  for (const entry of index) {
    const filePath = join(ROOT, entry.bundle_path.replace(/^on-chain-modules\//, ''));
    if (!existsSync(filePath)) {
      console.log(`  MISSING: ${entry.bundle_path}`);
      continue;
    }
    const buf = readFileSync(filePath);
    const actual = sha256(buf);
    const actualBytes = buf.length;
    const actualChunks = Math.ceil(actualBytes / 16384);

    if (entry.expected_sha256 !== actual || entry.bytes !== actualBytes || entry.chunks !== actualChunks) {
      console.log(`  UPDATE: ${entry.name}  sha=${actual.substring(0,12)}...  bytes=${actualBytes}  chunks=${actualChunks}`);
      entry.expected_sha256 = actual;
      entry.bytes = actualBytes;
      entry.chunks = actualChunks;
      changes++;
    }
  }

  writeJson(INDEX_PATH, index);

  // Build name→entry map for propagation
  const byName = Object.fromEntries(index.map(e => [e.name, e]));

  // Step 2: Update batch files
  const batchFiles = findFiles(BATCHES_DIR, '.batch.json');
  for (const bf of batchFiles) {
    const batch = readJson(bf);
    let batchChanged = false;
    for (const art of (batch.artifacts || [])) {
      const entry = byName[art.name];
      if (!entry) continue;
      if (art.sha256 !== entry.expected_sha256 || art.bytes !== entry.bytes || art.chunks !== entry.chunks) {
        art.sha256 = entry.expected_sha256;
        art.bytes = entry.bytes;
        art.chunks = entry.chunks;
        // Also sync path
        art.path = entry.bundle_path;
        batchChanged = true;
      }
    }
    if (batchChanged) {
      writeJson(bf, batch);
      console.log(`  BATCH: ${bf.split('/').pop()}`);
      changes++;
    }
  }

  // Step 3: Update catalog files
  const catalogFiles = findFiles(CATALOGS_DIR, '.catalog.json');
  for (const cf of catalogFiles) {
    const cat = readJson(cf);
    let catChanged = false;

    // Collect all module-like objects from the catalog (various structures)
    const moduleObjects = [];

    // Structure A: cat.modules as object-of-arrays (foundation catalog)
    // Structure B: cat.modules as flat array (major catalogs)
    if (cat.modules) {
      if (Array.isArray(cat.modules)) {
        moduleObjects.push(...cat.modules);
      } else {
        for (const val of Object.values(cat.modules)) {
          if (Array.isArray(val)) moduleObjects.push(...val);
        }
      }
    }

    // Structure C: cat.dependencies with named slots (plugin release catalogs)
    if (cat.dependencies) {
      for (const val of Object.values(cat.dependencies)) {
        if (val && typeof val === 'object' && val.name && val.sha256) {
          moduleObjects.push(val);
        }
      }
    }

    for (const mod of moduleObjects) {
      const entry = byName[mod.name];
      if (!entry) continue;
      if (mod.sha256 !== entry.expected_sha256 || mod.bytes !== entry.bytes || mod.chunks !== entry.chunks) {
        mod.sha256 = entry.expected_sha256;
        mod.bytes = entry.bytes;
        mod.chunks = entry.chunks;
        if (mod.path) mod.path = entry.bundle_path;
        catChanged = true;
      }
    }
    if (catChanged) {
      writeJson(cf, cat);
      console.log(`  CATALOG: ${cf.split('/').pop()}`);
      changes++;
    }
  }

  return changes;
}

// Run iteratively until stable
let round = 0;
while (true) {
  round++;
  console.log(`\n=== Round ${round} ===`);
  const changes = iterate();
  console.log(`  ${changes} change(s)`);
  if (changes === 0) {
    console.log('\nAll hashes stable.');
    break;
  }
  if (round > 5) {
    console.log('\nWARNING: Did not converge after 5 rounds.');
    break;
  }
}
