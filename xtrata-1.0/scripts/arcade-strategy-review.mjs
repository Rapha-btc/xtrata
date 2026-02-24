import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const arcadeRoot = path.resolve(__dirname, '../recursive-apps/21-arcade');
const gamesDir = path.join(arcadeRoot, 'games');

const WORKSPACE_DIR_RE = /^game\d{2}_[a-z0-9_]+-v[a-z0-9][a-z0-9._-]*$/i;
const GAME_FILE_RE = /^(game\d{2}_[a-z0-9_]+?)(?:-v([a-z0-9][a-z0-9._-]*))?\.js$/i;

function parseArgs(argv){
  const args = {
    game: null,
    init: false,
    strict: false,
    json: false
  };

  for(let i = 0; i < argv.length; i += 1){
    const token = argv[i];
    if((token === '--game' || token === '-g') && argv[i + 1]){
      args.game = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if(token === '--init') args.init = true;
    if(token === '--strict') args.strict = true;
    if(token === '--json') args.json = true;
  }
  return args;
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
  if(aIsNum !== bIsNum) return aIsNum ? 1 : -1;
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

function archetypeForGenre(genreTag){
  const genre = String(genreTag || '').toLowerCase();
  if(genre.includes('rpg')) return 'rpg';
  if(genre.includes('platform')) return 'platformer';
  if(genre.includes('runner')) return 'runner';
  if(genre.includes('shoot')) return 'shooter';
  if(genre.includes('racer') || genre.includes('racing')) return 'racing';
  if(genre.includes('puzzle') || genre.includes('logic')) return 'puzzle';
  if(genre.includes('maze')) return 'maze';
  if(genre.includes('action')) return 'action';
  return 'arcade';
}

function strategyByArchetype(archetype){
  const map = {
    shooter: {
      scaleGoal: 'Scale waves, enemy classes, and weapon interactions without frame drops.',
      iterationLanes: ['enemy-composition', 'weapon-balance', 'reward-risk', 'performance'],
      testFocus: ['spawn-density-regressions', 'combat-dps-balance', 'collision-performance', 'cleanup-leaks']
    },
    platformer: {
      scaleGoal: 'Scale level count and movement depth while preserving input feel and readability.',
      iterationLanes: ['level-design', 'movement-physics', 'checkpoint-tuning', 'performance'],
      testFocus: ['jump-arc-consistency', 'collision-edge-cases', 'camera-follow-stability', 'save-restart']
    },
    runner: {
      scaleGoal: 'Scale obstacle vocabulary and pacing variation while keeping runs fair.',
      iterationLanes: ['obstacle-catalog', 'tempo-curves', 'player-ability-balance', 'performance'],
      testFocus: ['spawn-fairness', 'hitbox-regressions', 'speed-scaling', 'restart-cleanup']
    },
    rpg: {
      scaleGoal: 'Scale narrative branches, progression systems, and inventory complexity.',
      iterationLanes: ['story-state', 'build-diversity', 'economy-balance', 'save-integrity'],
      testFocus: ['quest-state-transitions', 'inventory-consistency', 'combat-balance', 'save-load-integrity']
    },
    puzzle: {
      scaleGoal: 'Scale puzzle libraries and difficulty curves with deterministic solvability.',
      iterationLanes: ['puzzle-authoring', 'difficulty-curation', 'hint-systems', 'performance'],
      testFocus: ['solver-validity', 'difficulty-regressions', 'undo-redo-integrity', 'state-reset']
    },
    racing: {
      scaleGoal: 'Scale track variety and speed tiers while preserving control fidelity.',
      iterationLanes: ['track-authoring', 'handling-balance', 'ai-racers', 'performance'],
      testFocus: ['lap-timing-accuracy', 'collision-robustness', 'speed-tier-balance', 'input-latency']
    },
    maze: {
      scaleGoal: 'Scale map complexity and enemy behaviors while preserving route readability.',
      iterationLanes: ['map-design', 'enemy-pathing', 'resource-pressure', 'performance'],
      testFocus: ['pathfinding-validity', 'spawn-safety', 'win-loss-state', 'cleanup-leaks']
    },
    action: {
      scaleGoal: 'Scale encounters and abilities while preserving clear cause/effect.',
      iterationLanes: ['encounter-design', 'ability-balance', 'feedback-clarity', 'performance'],
      testFocus: ['damage-balance', 'cooldown-logic', 'state-transition', 'render-stability']
    },
    arcade: {
      scaleGoal: 'Scale content breadth while preserving deterministic scoring and fast restarts.',
      iterationLanes: ['content-expansion', 'balance', 'ux-feedback', 'performance'],
      testFocus: ['score-integrity', 'round-progression', 'restart-cleanup', 'resource-usage']
    }
  };
  return map[archetype] || map.arcade;
}

function decodeJsStringLiteral(raw){
  return String(raw || '')
    .replace(/\\\\/g, '\\')
    .replace(/\\'/g, '\'')
    .replace(/\\"/g, '"');
}

function extractRuntimePropString(text, key){
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const singleRe = new RegExp(`\\b${escapedKey}\\s*[:=]\\s*'((?:\\\\.|[^'\\\\])*)'`, 'i');
  const doubleRe = new RegExp(`\\b${escapedKey}\\s*[:=]\\s*\"((?:\\\\.|[^\"\\\\])*)\"`, 'i');
  const single = text.match(singleRe);
  if(single) return decodeJsStringLiteral(single[1]);
  const double = text.match(doubleRe);
  if(double) return decodeJsStringLiteral(double[1]);
  return null;
}

function parseRuntimeMetadata(source){
  const text = String(source || '');
  return {
    id: extractRuntimePropString(text, 'id'),
    title: extractRuntimePropString(text, 'title'),
    genreTag: extractRuntimePropString(text, 'genreTag')
  };
}

async function readJsonIfExists(filePath){
  try{
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  }catch(error){
    if(error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function listWorkspaceDirs(){
  const entries = await fs.readdir(arcadeRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && WORKSPACE_DIR_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function findLatestRuntimeFileForGame(gameKey){
  const files = await fs.readdir(gamesDir);
  let latest = null;
  for(const fileName of files){
    const match = fileName.match(GAME_FILE_RE);
    if(!match) continue;
    if(match[1] !== gameKey) continue;
    const version = match[2] || null;
    if(!latest || compareVersion(version, latest.version) > 0){
      latest = { fileName, version };
    }
  }
  return latest;
}

function defaultStrategyProfile({
  workspaceDir,
  gameKey,
  runtimeFileName,
  runtimeVersion,
  runtimeMeta
}){
  const genreTag = runtimeMeta.genreTag || 'Unknown';
  const archetype = archetypeForGenre(genreTag);
  const strategy = strategyByArchetype(archetype);
  return {
    schemaVersion: 1,
    gameKey,
    gameId: runtimeMeta.id || gameKey.replace(/^game\d{2}_/, ''),
    title: runtimeMeta.title || gameKey,
    genreTag,
    archetype,
    workspaceDir,
    runtime: {
      file: runtimeFileName || null,
      version: runtimeVersion ? `v${runtimeVersion}` : 'v1'
    },
    reviewStatus: 'draft',
    reviewer: null,
    reviewedAt: null,
    scaleGoal: strategy.scaleGoal,
    iterationLanes: strategy.iterationLanes,
    testFocus: strategy.testFocus,
    notes: [
      'Set reviewStatus to approved before production promotion.',
      'Update lanes and tests whenever game archetype or core loop changes.'
    ]
  };
}

function validateProfile(profile, strict){
  const errors = [];
  if(!profile || typeof profile !== 'object'){
    errors.push('Profile is missing or invalid JSON.');
    return errors;
  }

  const requiredStrings = ['gameKey', 'gameId', 'genreTag', 'archetype', 'reviewStatus', 'scaleGoal'];
  for(const key of requiredStrings){
    if(typeof profile[key] !== 'string' || !profile[key].trim()){
      errors.push(`Missing required string: ${key}`);
    }
  }

  if(!Array.isArray(profile.iterationLanes) || profile.iterationLanes.length === 0){
    errors.push('iterationLanes must be a non-empty array.');
  }
  if(!Array.isArray(profile.testFocus) || profile.testFocus.length === 0){
    errors.push('testFocus must be a non-empty array.');
  }

  if(strict && profile.reviewStatus !== 'approved'){
    errors.push('reviewStatus must be "approved" in strict mode.');
  }

  return errors;
}

async function checkWorkspaceDocs(workspacePath){
  const agentsPath = path.join(workspacePath, 'AGENTS.md');
  const readmePath = path.join(workspacePath, 'README.md');
  const [agents, readme] = await Promise.all([
    fs.readFile(agentsPath, 'utf8'),
    fs.readFile(readmePath, 'utf8')
  ]);

  const issues = [];
  if(!agents.includes('GAME_STRATEGY.json')){
    issues.push('AGENTS.md must reference GAME_STRATEGY.json.');
  }
  if(!agents.includes('arcade:strategy:review')){
    issues.push('AGENTS.md must include arcade:strategy:review command.');
  }
  if(!readme.includes('GAME_STRATEGY.json')){
    issues.push('README.md must reference GAME_STRATEGY.json.');
  }
  return issues;
}

async function ensureStrategyProfile({ workspaceDir, init }){
  const workspacePath = path.join(arcadeRoot, workspaceDir);
  const gameKey = workspaceDir.replace(/-v[a-z0-9][a-z0-9._-]*$/i, '');
  const strategyPath = path.join(workspacePath, 'GAME_STRATEGY.json');
  let profile = await readJsonIfExists(strategyPath);

  if(!profile){
    if(!init){
      return {
        workspaceDir,
        strategyPath,
        gameKey,
        created: false,
        missing: true
      };
    }
    const latestRuntime = await findLatestRuntimeFileForGame(gameKey);
    let runtimeMeta = { id: null, title: null, genreTag: null };
    if(latestRuntime){
      const runtimeSource = await fs.readFile(path.join(gamesDir, latestRuntime.fileName), 'utf8');
      runtimeMeta = parseRuntimeMetadata(runtimeSource);
    }
    profile = defaultStrategyProfile({
      workspaceDir,
      gameKey,
      runtimeFileName: latestRuntime ? latestRuntime.fileName : null,
      runtimeVersion: latestRuntime ? latestRuntime.version : null,
      runtimeMeta
    });
    await fs.writeFile(strategyPath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
    return {
      workspaceDir,
      strategyPath,
      gameKey,
      created: true,
      missing: false
    };
  }

  return {
    workspaceDir,
    strategyPath,
    gameKey,
    profile,
    created: false,
    missing: false
  };
}

async function main(){
  const args = parseArgs(process.argv.slice(2));
  const workspaces = await listWorkspaceDirs();
  const targetWorkspaces = args.game
    ? workspaces.filter((name) => name.startsWith(`${args.game}-`))
    : workspaces;

  if(targetWorkspaces.length === 0){
    const message = args.game
      ? `No workspace found for game key: ${args.game}`
      : 'No arcade workspaces found.';
    console.error(`[arcade-strategy-review] ${message}`);
    process.exitCode = 1;
    return;
  }

  const result = {
    checked: 0,
    created: [],
    failures: []
  };

  for(const workspaceDir of targetWorkspaces){
    const ensured = await ensureStrategyProfile({ workspaceDir, init: args.init });
    const workspacePath = path.join(arcadeRoot, workspaceDir);
    result.checked += 1;
    if(ensured.created){
      result.created.push(path.relative(process.cwd(), ensured.strategyPath));
    }
    if(ensured.missing){
      result.failures.push({
        workspace: workspaceDir,
        errors: ['Missing GAME_STRATEGY.json (run with --init to create).']
      });
      continue;
    }

    const profile = ensured.profile || await readJsonIfExists(ensured.strategyPath);
    const validationErrors = validateProfile(profile, args.strict);
    const docIssues = await checkWorkspaceDocs(workspacePath);
    const allErrors = validationErrors.concat(docIssues);
    if(allErrors.length > 0){
      result.failures.push({
        workspace: workspaceDir,
        errors: allErrors
      });
    }
  }

  if(args.json){
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('[arcade-strategy-review]');
    console.log(`checked: ${result.checked}`);
    if(result.created.length > 0){
      console.log('created:');
      for(const item of result.created){
        console.log(`  - ${item}`);
      }
    }
    if(result.failures.length === 0){
      console.log(`status: ok${args.strict ? ' (strict)' : ''}`);
    } else {
      console.log(`status: failed (${result.failures.length} workspace(s))`);
      for(const failure of result.failures){
        console.log(`- ${failure.workspace}`);
        for(const error of failure.errors){
          console.log(`  - ${error}`);
        }
      }
    }
  }

  if(result.failures.length > 0){
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[arcade-strategy-review] failed');
  console.error(error);
  process.exitCode = 1;
});
