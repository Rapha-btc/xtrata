import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateManifest } from '../../../../scripts/arcade-game-manifest.mjs';
import { buildGame } from '../src/build/build-game.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAME_ID = 'game01_astro_blaster';
const GAME_FILE_RE = new RegExp(`^${GAME_ID}(?:-v([a-z0-9][a-z0-9._-]*))?\\.js$`, 'i');
const gamesDir = path.resolve(__dirname, '../../games');

function normalizeVersion(versionRaw){
  if(typeof versionRaw === 'undefined' || versionRaw === null) return null;
  const cleaned = String(versionRaw).trim().replace(/^v/i, '');
  return cleaned || null;
}

function tokenizeVersion(versionRaw){
  if(!versionRaw) return [];
  return String(versionRaw)
    .split(/[._-]+/)
    .filter(Boolean)
    .map((token) => (/^\d+$/.test(token) ? Number(token) : token.toLowerCase()));
}

function compareToken(a, b){
  const aIsNum = typeof a === 'number';
  const bIsNum = typeof b === 'number';
  if(aIsNum && bIsNum){
    if(a === b) return 0;
    return a > b ? 1 : -1;
  }
  if(aIsNum !== bIsNum){
    return aIsNum ? 1 : -1;
  }
  const cmp = String(a).localeCompare(String(b));
  if(cmp === 0) return 0;
  return cmp > 0 ? 1 : -1;
}

function compareVersion(a, b){
  if(!a && !b) return 0;
  if(!a) return -1;
  if(!b) return 1;

  const ta = tokenizeVersion(a);
  const tb = tokenizeVersion(b);
  const maxLen = Math.max(ta.length, tb.length);

  for(let i = 0; i < maxLen; i += 1){
    if(typeof ta[i] === 'undefined' && typeof tb[i] === 'undefined') return 0;
    if(typeof ta[i] === 'undefined') return -1;
    if(typeof tb[i] === 'undefined') return 1;
    const cmp = compareToken(ta[i], tb[i]);
    if(cmp !== 0) return cmp;
  }

  return 0;
}

async function findLatestVersion(){
  const entries = await fs.readdir(gamesDir, { withFileTypes: true });
  let latest = null;

  for(const entry of entries){
    if(!entry.isFile()) continue;
    const match = entry.name.match(GAME_FILE_RE);
    if(!match) continue;

    const version = normalizeVersion(match[1]) || '1';
    if(compareVersion(version, latest) > 0){
      latest = version;
    }
  }

  return latest;
}

function suggestNextDecimalVersion(latestVersion){
  const normalized = normalizeVersion(latestVersion);
  if(!normalized){
    return '2.1';
  }

  const parts = normalized.split('.');
  const major = Number(parts[0]);
  if(!Number.isFinite(major) || major < 2){
    return '2.1';
  }

  if(parts.length < 2){
    return `${major}.1`;
  }

  const minor = Number(parts[1]);
  if(Number.isFinite(minor) && minor >= 0){
    return `${major}.${minor + 1}`;
  }

  return `${major}.1`;
}

async function createVersionSnapshot(sourcePath){
  const latestVersion = await findLatestVersion();
  const nextVersion = suggestNextDecimalVersion(latestVersion);
  const snapshotFile = `${GAME_ID}-v${nextVersion}.js`;
  const snapshotPath = path.join(gamesDir, snapshotFile);
  await fs.copyFile(sourcePath, snapshotPath);
  return {
    latestVersion: latestVersion || '1',
    nextVersion,
    snapshotFile,
    snapshotPath
  };
}

async function main(){
  const result = await buildGame({ write: true });
  const snapshot = await createVersionSnapshot(result.outputPath);
  const manifest = await generateManifest();
  console.log('[astro-blaster-v2] build complete');
  console.log(`output: ${result.outputPath}`);
  console.log(`snapshot: ${snapshot.snapshotPath}`);
  console.log(`version progression: v${snapshot.latestVersion} -> v${snapshot.nextVersion}`);
  console.log(`manifest updated: ${manifest.games.length} game slots`);
  console.log(`legacy source hash: ${result.sourceHash}`);
  console.log(`modules: ${result.manifest.modulePipeline.join(', ')}`);
}

main().catch((error) => {
  console.error('[astro-blaster-v2] build failed');
  console.error(error);
  process.exitCode = 1;
});
