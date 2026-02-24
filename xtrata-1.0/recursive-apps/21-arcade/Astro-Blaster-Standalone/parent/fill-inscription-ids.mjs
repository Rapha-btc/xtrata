#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'astro-blaster-standalone.inscription-manifest.json');
const DEFAULT_TEMPLATE_PATH = path.join(__dirname, 'astro-blaster-parent.template.html');
const LEAF_KEYS = ['styles', 'utils', 'highscores', 'gameRuntime', 'main'];
const UINT_RE = /^(0|[1-9][0-9]*)$/;

function usage(){
  console.log([
    'Usage:',
    '  node parent/fill-inscription-ids.mjs --styles <id> --utils <id> --highscores <id> --game-runtime <id> --main <id> [--parent <id>] [--dry-run]',
    '  node parent/fill-inscription-ids.mjs --ids-file <path-to-json> [--parent <id>] [--dry-run]',
    '  node parent/fill-inscription-ids.mjs --ids-json \'{\"styles\":1,\"utils\":2,\"highscores\":3,\"gameRuntime\":4,\"main\":5,\"parent\":6}\'',
    '',
    'Options:',
    '  --manifest <path>   Override manifest path',
    '  --template <path>   Override parent template path',
    '  --styles <id>       Leaf module inscription ID',
    '  --utils <id>        Leaf module inscription ID',
    '  --highscores <id>   Leaf module inscription ID',
    '  --game-runtime <id> Leaf module inscription ID (alias: --gameRuntime)',
    '  --main <id>         Leaf module inscription ID',
    '  --parent <id>       Parent inscription ID (optional)',
    '  --ids-file <path>   JSON file containing IDs',
    '  --ids-json <json>   Inline JSON containing IDs',
    '  --dry-run           Print intended changes without writing files',
    '  --help              Show this help'
  ].join('\n'));
}

function parseUint(raw, label, { allowZero = false } = {}){
  if(raw === null || typeof raw === 'undefined') return null;
  const text = String(raw).trim();
  if(!text) return null;
  if(!UINT_RE.test(text)){
    throw new Error(`${label} must be an unsigned integer.`);
  }
  if(!allowZero && text === '0'){
    throw new Error(`${label} must be greater than zero.`);
  }
  return text.replace(/^0+(?=[0-9])/, '') || '0';
}

function toManifestNumberOrString(uintText){
  if(typeof uintText !== 'string' || !UINT_RE.test(uintText)){
    throw new Error(`Invalid uint value "${String(uintText)}".`);
  }
  const asBigInt = BigInt(uintText);
  if(asBigInt <= BigInt(Number.MAX_SAFE_INTEGER)){
    return Number(uintText);
  }
  return uintText;
}

function parseIdSourcePayload(raw, label){
  let parsed;
  try{
    parsed = JSON.parse(raw);
  }catch(error){
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  if(!parsed || typeof parsed !== 'object' || Array.isArray(parsed)){
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function normalizeLeafPayload(payload, label){
  const source = payload && typeof payload === 'object' && payload.moduleIds && typeof payload.moduleIds === 'object'
    ? payload.moduleIds
    : payload;
  const out = {};
  LEAF_KEYS.forEach((key) => {
    if(Object.prototype.hasOwnProperty.call(source, key)){
      out[key] = parseUint(source[key], `${label}.${key}`);
    }
  });
  return out;
}

function buildApiBaseUrl(network){
  const normalized = String(network || '').toLowerCase();
  if(normalized === 'testnet') return '/hiro/testnet';
  if(normalized === 'devnet' || normalized === 'regtest') return 'http://localhost:3999';
  return '/hiro/mainnet';
}

function buildApiFallbackBaseUrls(network){
  const normalized = String(network || '').toLowerCase();
  if(normalized === 'testnet') return ['https://api.testnet.hiro.so'];
  if(normalized === 'devnet' || normalized === 'regtest') return [];
  return ['https://api.mainnet.hiro.so'];
}

function escapeRegex(text){
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceSingleObjectField(source, field, valueLiteral){
  const regex = new RegExp(`^(\\s*${escapeRegex(field)}:\\s*)([^\\n]*?)(,?)$`, 'gm');
  const matches = [...source.matchAll(regex)];
  if(matches.length !== 1){
    throw new Error(`Expected exactly one "${field}" field in parent template, found ${matches.length}.`);
  }
  return source.replace(regex, (_match, prefix, _currentValue, suffix) => `${prefix}${valueLiteral}${suffix}`);
}

function quoteJsString(value){
  return `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function coalesceLeafIds(explicitLeafIds, fileLeafIds, inlineLeafIds){
  const out = {};
  LEAF_KEYS.forEach((key) => {
    if(typeof explicitLeafIds[key] === 'string'){
      out[key] = explicitLeafIds[key];
      return;
    }
    if(typeof inlineLeafIds[key] === 'string'){
      out[key] = inlineLeafIds[key];
      return;
    }
    if(typeof fileLeafIds[key] === 'string'){
      out[key] = fileLeafIds[key];
    }
  });
  return out;
}

async function parseArgs(argv){
  const options = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    templatePath: DEFAULT_TEMPLATE_PATH,
    dryRun: false,
    leafIdsFromFlags: {},
    leafIdsFromFile: {},
    leafIdsFromInlineJson: {},
    parentFromFile: null,
    parentFromInlineJson: null,
    parentFromFlag: null
  };

  for(let i = 0; i < argv.length; i += 1){
    const arg = argv[i];

    if(arg === '--help' || arg === '-h'){
      usage();
      process.exit(0);
    }
    if(arg === '--dry-run'){
      options.dryRun = true;
      continue;
    }
    if(arg === '--manifest'){
      i += 1;
      options.manifestPath = path.resolve(argv[i] || '');
      continue;
    }
    if(arg === '--template'){
      i += 1;
      options.templatePath = path.resolve(argv[i] || '');
      continue;
    }
    if(arg === '--styles'){
      i += 1;
      options.leafIdsFromFlags.styles = parseUint(argv[i], '--styles');
      continue;
    }
    if(arg === '--utils'){
      i += 1;
      options.leafIdsFromFlags.utils = parseUint(argv[i], '--utils');
      continue;
    }
    if(arg === '--highscores'){
      i += 1;
      options.leafIdsFromFlags.highscores = parseUint(argv[i], '--highscores');
      continue;
    }
    if(arg === '--game-runtime' || arg === '--gameRuntime'){
      i += 1;
      options.leafIdsFromFlags.gameRuntime = parseUint(argv[i], '--game-runtime');
      continue;
    }
    if(arg === '--main'){
      i += 1;
      options.leafIdsFromFlags.main = parseUint(argv[i], '--main');
      continue;
    }
    if(arg === '--parent'){
      i += 1;
      options.parentFromFlag = parseUint(argv[i], '--parent');
      continue;
    }
    if(arg === '--ids-file'){
      i += 1;
      const filePath = path.resolve(argv[i] || '');
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = parseIdSourcePayload(raw, '--ids-file');
      options.leafIdsFromFile = normalizeLeafPayload(parsed, '--ids-file');
      if(Object.prototype.hasOwnProperty.call(parsed, 'parent')){
        options.parentFromFile = parseUint(parsed.parent, '--ids-file.parent');
      }
      continue;
    }
    if(arg === '--ids-json'){
      i += 1;
      const parsed = parseIdSourcePayload(argv[i] || '', '--ids-json');
      options.leafIdsFromInlineJson = normalizeLeafPayload(parsed, '--ids-json');
      if(Object.prototype.hasOwnProperty.call(parsed, 'parent')){
        options.parentFromInlineJson = parseUint(parsed.parent, '--ids-json.parent');
      }
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const leafIds = coalesceLeafIds(
    options.leafIdsFromFlags,
    options.leafIdsFromFile,
    options.leafIdsFromInlineJson
  );
  const hasAnyLeafId = LEAF_KEYS.some((key) => typeof leafIds[key] === 'string');
  const missingLeafIds = LEAF_KEYS.filter((key) => typeof leafIds[key] !== 'string');

  if(hasAnyLeafId && missingLeafIds.length > 0){
    throw new Error(
      `Leaf ID update requires all module IDs. Missing: ${missingLeafIds.join(', ')}`
    );
  }

  const parentId = options.parentFromFlag || options.parentFromInlineJson || options.parentFromFile;
  if(!hasAnyLeafId && !parentId){
    throw new Error('No updates requested. Provide all leaf IDs, --parent, or both.');
  }

  return {
    manifestPath: options.manifestPath,
    templatePath: options.templatePath,
    dryRun: options.dryRun,
    leafIds,
    hasLeafIds: hasAnyLeafId,
    parentId: parentId || null
  };
}

function applyManifestUpdates(manifest, { hasLeafIds, leafIds, parentId }){
  const next = JSON.parse(JSON.stringify(manifest));

  if(hasLeafIds){
    const byKey = new Map();
    if(Array.isArray(next.leafModules)){
      next.leafModules.forEach((moduleEntry) => {
        if(moduleEntry && typeof moduleEntry === 'object' && moduleEntry.key){
          byKey.set(moduleEntry.key, moduleEntry);
        }
      });
    }
    LEAF_KEYS.forEach((key) => {
      const target = byKey.get(key);
      if(!target){
        throw new Error(`Manifest leafModules is missing key "${key}".`);
      }
      target.mintedInscriptionId = toManifestNumberOrString(leafIds[key]);
    });

    if(!next.recursiveSeal || !Array.isArray(next.recursiveSeal.dependencyOrder)){
      throw new Error('Manifest recursiveSeal.dependencyOrder is missing.');
    }

    next.recursiveSeal.dependencies = next.recursiveSeal.dependencyOrder.map((key) => {
      const value = leafIds[key];
      if(typeof value !== 'string'){
        throw new Error(`recursiveSeal.dependencyOrder references unknown key "${key}".`);
      }
      return toManifestNumberOrString(value);
    });
  }

  if(parentId){
    if(!next.parent || typeof next.parent !== 'object'){
      throw new Error('Manifest parent block is missing.');
    }
    next.parent.mintedInscriptionId = toManifestNumberOrString(parentId);
  }

  return next;
}

function applyTemplateUpdates(templateText, manifest, leafIds){
  const contentContract = manifest.contentContract || {};
  const scoreContract = manifest.scoreContract || {};
  const scoreNetwork = scoreContract.network || contentContract.network || 'mainnet';

  let next = templateText;
  next = replaceSingleObjectField(next, 'contentContractAddress', quoteJsString(contentContract.address || ''));
  next = replaceSingleObjectField(next, 'contentContractName', quoteJsString(contentContract.name || ''));
  next = replaceSingleObjectField(
    next,
    'senderAddress',
    quoteJsString(contentContract.senderAddress || contentContract.address || '')
  );
  next = replaceSingleObjectField(
    next,
    'networkPriority',
    `[${quoteJsString(contentContract.network || 'mainnet')}]`
  );

  next = replaceSingleObjectField(next, 'styles', leafIds.styles);
  next = replaceSingleObjectField(next, 'utils', leafIds.utils);
  next = replaceSingleObjectField(next, 'highscores', leafIds.highscores);
  next = replaceSingleObjectField(next, 'gameRuntime', leafIds.gameRuntime);
  next = replaceSingleObjectField(next, 'main', leafIds.main);

  next = replaceSingleObjectField(next, 'network', quoteJsString(scoreNetwork));
  next = replaceSingleObjectField(next, 'contractAddress', quoteJsString(scoreContract.address || ''));
  next = replaceSingleObjectField(next, 'contractName', quoteJsString(scoreContract.name || ''));
  next = replaceSingleObjectField(
    next,
    'functionName',
    quoteJsString(scoreContract.functionName || 'submit-score')
  );
  next = replaceSingleObjectField(
    next,
    'leaderboardFunctionName',
    quoteJsString(scoreContract.leaderboardFunctionName || 'get-top10')
  );
  next = replaceSingleObjectField(next, 'apiBaseUrl', quoteJsString(buildApiBaseUrl(scoreNetwork)));
  next = replaceSingleObjectField(
    next,
    'apiFallbackBaseUrls',
    JSON.stringify(buildApiFallbackBaseUrls(scoreNetwork))
  );
  next = replaceSingleObjectField(
    next,
    'readSenderAddress',
    quoteJsString(scoreContract.readSenderAddress || '')
  );

  return next;
}

async function main(){
  const options = await parseArgs(process.argv.slice(2));

  const manifestRaw = await fs.readFile(options.manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const nextManifest = applyManifestUpdates(manifest, options);

  let nextTemplate = null;
  if(options.hasLeafIds){
    const templateRaw = await fs.readFile(options.templatePath, 'utf8');
    nextTemplate = applyTemplateUpdates(templateRaw, nextManifest, options.leafIds);
  }

  const summary = {
    manifestPath: options.manifestPath,
    templatePath: options.templatePath,
    dryRun: options.dryRun,
    updatedLeafIds: options.hasLeafIds ? options.leafIds : null,
    updatedParentId: options.parentId || null
  };

  if(options.dryRun){
    console.log('[fill-inscription-ids] dry run (no files written)');
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await fs.writeFile(options.manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');
  if(nextTemplate !== null){
    await fs.writeFile(options.templatePath, nextTemplate, 'utf8');
  }

  console.log('[fill-inscription-ids] updated files');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[fill-inscription-ids] failed');
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
});
