/**
 * bump-sources.mjs
 *
 * Adds a harmless build-marker comment/field to every inscribed (non-WASM) source file
 * so each file gets a new content hash. This forces fresh on-chain token IDs, ensuring
 * no older tokens at the same URI path are ever resolved instead.
 *
 * Usage:
 *   node TASKS/BVST-on-chain-framework/scripts/bump-sources.mjs
 *   node TASKS/BVST-on-chain-framework/scripts/bump-sources.mjs --dry-run
 *
 * After running this, execute fix-all-hashes.mjs to update SHA-256s in module-index,
 * batches, and catalog definitions.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleRoot, readJson, loadModuleIndex } from './_inscription-helpers.mjs';

const dryRun = process.argv.includes('--dry-run');
const workspaceRoot = path.join(bundleRoot, 'workspace');

// Build marker appended to each file type.
// Must be syntactically safe for that file type and must not break functionality.
const MARKER = {
  'application/javascript': '// @bvst-inscription-build: 1\n',
  'text/css':               '/* @bvst-inscription-build: 1 */\n',
  'text/html':              '<!-- @bvst-inscription-build: 1 -->\n',
  'application/json':       null, // handled separately — injected as a field
};

async function loadInscriptionLog() {
  try {
    return await readJson('verification/inscription-log.json');
  } catch {
    return null;
  }
}

async function bumpFile(absPath, mime) {
  const content = await fs.readFile(absPath, 'utf8');

  if (mime === 'application/json') {
    // Inject "_inscription_build" field into root object
    const parsed = JSON.parse(content);
    if (parsed._inscription_build) {
      return { skipped: true, reason: 'already has _inscription_build field' };
    }
    parsed._inscription_build = 1;
    const updated = JSON.stringify(parsed, null, 2) + '\n';
    if (!dryRun) await fs.writeFile(absPath, updated, 'utf8');
    return { changed: true, bytes: Buffer.byteLength(updated, 'utf8') };
  }

  const marker = MARKER[mime];
  if (!marker) {
    return { skipped: true, reason: `no marker defined for ${mime}` };
  }

  if (content.includes('@bvst-inscription-build')) {
    return { skipped: true, reason: 'already has build marker' };
  }

  const updated = content.endsWith('\n') ? content + marker : content + '\n' + marker;
  if (!dryRun) await fs.writeFile(absPath, updated, 'utf8');
  return { changed: true, bytes: Buffer.byteLength(updated, 'utf8') };
}

async function main() {
  const moduleIndex = await loadModuleIndex();
  const inscriptionLog = await loadInscriptionLog();

  if (!inscriptionLog) {
    console.error('No inscription-log.json found. Nothing to bump.');
    process.exitCode = 1;
    return;
  }

  const inscribedNames = new Set(
    (inscriptionLog.entries || []).map((e) => e.name)
  );

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Bumping sources for ${inscribedNames.size} inscribed modules...\n`);

  let changed = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of moduleIndex) {
    if (!inscribedNames.has(record.name)) continue;
    if (record.kind === 'catalog') continue; // catalogs are rendered, not bumped

    const mime = record.mime_type || '';

    // Skip binary WASM files — cannot safely add text comments
    if (mime === 'application/wasm') {
      console.log(`  SKIP  ${record.name} (wasm — binary, cannot add text marker)`);
      skipped++;
      continue;
    }

    const relPath = record.source_repo_path;
    const absPath = path.join(workspaceRoot, relPath);

    try {
      const result = await bumpFile(absPath, mime);
      if (result.changed) {
        console.log(`  BUMP  ${record.name}  (${relPath})`);
        changed++;
      } else if (result.skipped) {
        console.log(`  SKIP  ${record.name}  — ${result.reason}`);
        skipped++;
      }
    } catch (err) {
      console.error(`  ERROR ${record.name}  — ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. changed=${changed}, skipped=${skipped}, errors=${errors}`);
  if (dryRun) {
    console.log('\n(Dry run — no files written. Re-run without --dry-run to apply.)');
  } else if (changed > 0) {
    console.log('\nNext step: run fix-all-hashes.mjs to update SHA-256s in module-index + batches + catalogs.');
  }

  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
