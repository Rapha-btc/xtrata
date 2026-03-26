/**
 * revert-source-bumps.mjs
 *
 * Removes the @bvst-inscription-build marker added by bump-sources.mjs,
 * restoring each source file to its pre-bump content.
 *
 * Usage:
 *   node TASKS/BVST-on-chain-framework/scripts/revert-source-bumps.mjs
 *   node TASKS/BVST-on-chain-framework/scripts/revert-source-bumps.mjs --dry-run
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { bundleRoot, loadModuleIndex } from './_inscription-helpers.mjs';

const dryRun = process.argv.includes('--dry-run');
const workspaceRoot = path.join(bundleRoot, 'workspace');

const MARKER_PATTERNS = [
  /\n\/\/ @bvst-inscription-build: \d+\n?$/,
  /\n\/\* @bvst-inscription-build: \d+ \*\/\n?$/,
  /\n<!-- @bvst-inscription-build: \d+ -->\n?$/,
];

async function revertFile(absPath, mime) {
  if (mime === 'application/wasm') return { skipped: true, reason: 'wasm binary' };

  if (mime === 'application/json') {
    const content = await fs.readFile(absPath, 'utf8');
    const parsed = JSON.parse(content);
    if (!('_inscription_build' in parsed)) return { skipped: true, reason: 'no build field' };
    delete parsed._inscription_build;
    const updated = JSON.stringify(parsed, null, 2) + '\n';
    if (!dryRun) await fs.writeFile(absPath, updated, 'utf8');
    return { changed: true };
  }

  const content = await fs.readFile(absPath, 'utf8');
  let updated = content;
  for (const pattern of MARKER_PATTERNS) {
    updated = updated.replace(pattern, '\n');
  }
  // Also handle trailing newline normalisation
  updated = updated.replace(/\n{2,}$/, '\n');

  if (updated === content) return { skipped: true, reason: 'no build marker found' };
  if (!dryRun) await fs.writeFile(absPath, updated, 'utf8');
  return { changed: true };
}

async function main() {
  const moduleIndex = await loadModuleIndex();
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Reverting source bumps...\n`);

  let changed = 0, skipped = 0, errors = 0;

  for (const record of moduleIndex) {
    if (record.kind === 'catalog') continue;
    const mime = record.mime_type || '';
    const absPath = path.join(workspaceRoot, record.source_repo_path);

    try {
      const result = await revertFile(absPath, mime);
      if (result.changed) {
        console.log(`  REVERT  ${record.name}  (${record.source_repo_path})`);
        changed++;
      } else {
        console.log(`  SKIP    ${record.name}  — ${result.reason}`);
        skipped++;
      }
    } catch (err) {
      console.error(`  ERROR   ${record.name}  — ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. changed=${changed}, skipped=${skipped}, errors=${errors}`);
  if (dryRun) console.log('\n(Dry run — no files written.)');
  else if (changed > 0) console.log('\nNext: run fix-all-hashes.mjs to restore original SHA-256s.');
  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
