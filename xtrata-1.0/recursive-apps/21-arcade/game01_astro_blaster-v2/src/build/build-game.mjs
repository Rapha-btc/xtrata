import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createModuleRegistry } from '../framework/module-registry.mjs';
import { cloneSerializable } from '../framework/clone-serializable.mjs';
import { defaultModules } from './default-modules.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SOURCE_GAME_PATH = path.resolve(__dirname, '../legacy/game01_astro_blaster.legacy.js');
export const OUTPUT_GAME_PATH = path.resolve(__dirname, '../../../games/game01_astro_blaster-v2.js');

function indentLiteral(text, spaces){
  const pad = ' '.repeat(spaces);
  return String(text)
    .split('\n')
    .map((line) => `${pad}${line}`)
    .join('\n');
}

export function extractLegacyIifeBody(source){
  const match = String(source).match(/var\s+Game01\s*=\s*\(function\(\)\{([\s\S]*)\}\)\(\);\s*$/);
  if(!match){
    throw new Error('Unable to locate legacy Game01 IIFE in source game file.');
  }
  return match[1].replace(/^\n/, '');
}

export async function readLegacySource(sourcePath = SOURCE_GAME_PATH){
  return fs.readFile(sourcePath, 'utf8');
}

function buildRuntimePatchSnippet(runtimePatch, runtimeSnippets){
  const runtimeJson = JSON.stringify(runtimePatch, null, 2);
  const injectedSnippets = Array.isArray(runtimeSnippets)
    ? runtimeSnippets
      .map((snippet) => String(snippet || '').trim())
      .filter(Boolean)
    : [];
  const cloneFn = [
    '  function cloneSerializable(value){',
    '    return JSON.parse(JSON.stringify(value));',
    '  }'
  ].join('\n');

  return [
    cloneFn,
    `  var runtimePatch = ${indentLiteral(runtimeJson, 2).trimStart()};`,
    ...injectedSnippets.map((snippet) => indentLiteral(snippet, 2)),
    '  game.__astroV2 = cloneSerializable(runtimePatch);',
    '  game.getV2Manifest = function(){ return cloneSerializable(game.__astroV2); };'
  ].join('\n');
}

export function renderOutputSource({ legacyBody, sourceHash, runtimePatch, runtimeSnippets, manifest }){
  const generatedAtIso = manifest.generatedAtIso;
  const runtimePatchSnippet = buildRuntimePatchSnippet(runtimePatch, runtimeSnippets);

  return [
    '/* eslint-disable */',
    '/*',
    ' * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.',
    ` * Source: recursive-apps/21-arcade/game01_astro_blaster-v2/src/legacy/game01_astro_blaster.legacy.js`,
    ` * Build Framework: recursive-apps/21-arcade/game01_astro_blaster-v2/src/build/build-game.mjs`,
    ` * Generated At: ${generatedAtIso}`,
    ` * Legacy Source SHA256: ${sourceHash}`,
    ' */',
    '',
    'var Game01 = (function(){',
    legacyBody.trimEnd(),
    '})();',
    '',
    '(function(game){',
    '  if(!game) return;',
    runtimePatchSnippet,
    '})(typeof Game01 !== "undefined" ? Game01 : null);',
    ''
  ].join('\n');
}

export async function buildGame({ sourcePath = SOURCE_GAME_PATH, outputPath = OUTPUT_GAME_PATH, write = true } = {}){
  const legacySource = await readLegacySource(sourcePath);
  const legacyBody = extractLegacyIifeBody(legacySource);
  const sourceHash = createHash('sha256').update(legacySource, 'utf8').digest('hex');

  const registry = createModuleRegistry();
  for(const moduleDefinition of defaultModules){
    registry.register(moduleDefinition);
  }

  const artifact = {
    runtimePatch: {},
    runtimeSnippets: [],
    manifest: {
      generatedAtIso: new Date().toISOString(),
      modulePipeline: []
    }
  };

  const context = {
    sourcePath,
    outputPath,
    sourceHash
  };

  const finalArtifact = registry.applyAll(artifact, context);
  const outputSource = renderOutputSource({
    legacyBody,
    sourceHash,
    runtimePatch: cloneSerializable(finalArtifact.runtimePatch),
    runtimeSnippets: cloneSerializable(finalArtifact.runtimeSnippets || []),
    manifest: cloneSerializable(finalArtifact.manifest)
  });

  if(write){
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, outputSource, 'utf8');
  }

  return {
    outputPath,
    outputSource,
    sourceHash,
    modulePipeline: registry.list(),
    manifest: cloneSerializable(finalArtifact.manifest)
  };
}
