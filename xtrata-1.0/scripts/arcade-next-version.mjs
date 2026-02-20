import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gamesDir = path.resolve(__dirname, '../recursive-apps/21-arcade/games');

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

function normalizeVersion(versionRaw){
  if(typeof versionRaw === 'undefined' || versionRaw === null) return null;
  const cleaned = String(versionRaw).trim().replace(/^v/i, '');
  return cleaned || null;
}

function parseArgs(argv){
  const args = { game: null, explicitVersion: null, json: false };
  for(let i = 0; i < argv.length; i += 1){
    const token = argv[i];
    if((token === '--game' || token === '-g') && argv[i + 1]){
      args.game = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if((token === '--version' || token === '-v') && argv[i + 1]){
      args.explicitVersion = normalizeVersion(argv[i + 1]);
      i += 1;
      continue;
    }
    if(token === '--json'){
      args.json = true;
    }
  }
  return args;
}

function usage(){
  return [
    'Usage:',
    '  node scripts/arcade-next-version.mjs --game game01_astro_blaster [--version 3] [--json]',
    '',
    'Defaults:',
    '  - If latest is v2, next suggested is v2.1',
    '  - If latest is v2.1, next suggested is v2.2',
    '  - If --version is provided, that explicit version is returned'
  ].join('\n');
}

function suggestNextVersion(latestVersion){
  const normalized = normalizeVersion(latestVersion);
  if(!normalized){
    return '2';
  }

  const parts = normalized.split('.');
  const major = Number(parts[0]);
  if(!Number.isFinite(major) || major < 0){
    return `${normalized}.1`;
  }

  if(major >= 2){
    if(parts.length < 2){
      return `${major}.1`;
    }
    const minor = Number(parts[1]);
    if(Number.isFinite(minor) && minor >= 0){
      return `${major}.${minor + 1}`;
    }
    return `${major}.1`;
  }

  return String(major + 1);
}

function gameFileRegex(gameId){
  const escaped = gameId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(${escaped})(?:-v([a-z0-9][a-z0-9._-]*))?\\.js$`, 'i');
}

async function findLatestVersion(gameId){
  const files = await fs.readdir(gamesDir, { withFileTypes: true });
  const re = gameFileRegex(gameId);
  let latest = null;

  for(const entry of files){
    if(!entry.isFile()) continue;
    const match = entry.name.match(re);
    if(!match) continue;
    const version = normalizeVersion(match[2]);
    if(compareVersion(version, latest) > 0){
      latest = version;
    }
  }

  return latest;
}

async function main(){
  const args = parseArgs(process.argv.slice(2));
  if(!args.game){
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const latestVersion = await findLatestVersion(args.game);
  const nextVersion = args.explicitVersion || suggestNextVersion(latestVersion);
  const nextFile = `${args.game}-v${nextVersion}.js`;

  const result = {
    game: args.game,
    latestVersion: latestVersion || '1',
    nextVersion,
    nextFile,
    explicit: !!args.explicitVersion,
    policy: 'default-after-v2-is-minor-decimal'
  };

  if(args.json){
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('[arcade-next-version]');
  console.log(`game: ${result.game}`);
  console.log(`latest: v${result.latestVersion}`);
  console.log(`next: v${result.nextVersion}${result.explicit ? ' (explicit override)' : ' (default policy)'}`);
  console.log(`file: recursive-apps/21-arcade/games/${result.nextFile}`);
}

main().catch((error) => {
  console.error('[arcade-next-version] failed');
  console.error(error);
  process.exitCode = 1;
});
