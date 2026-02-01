#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

const VARIANT_SETS = [
  {
    id: 'xtrata-v1.1.0',
    variants: [
      {
        name: 'clarinet',
        trait: 'local',
        file: 'contracts/clarinet/contracts/xtrata-v1.1.0.clar',
        fallback: 'contracts/other/xtrata-v1.1.0.clar'
      },
      {
        name: 'testnet',
        trait: 'testnet',
        file: 'contracts/other/xtrata-v1.1.0.clar',
        fallback: 'contracts/clarinet/contracts/xtrata-v1.1.0.clar'
      },
      {
        name: 'mainnet',
        trait: 'mainnet',
        file: 'contracts/live/xtrata-v1.1.0.clar',
        fallback: 'contracts/other/xtrata-v1.1.0.clar'
      }
    ]
  }
];

const MARKERS = {
  local: ';; [LOCAL / CLARINET]',
  testnet: ';; [TESTNET]',
  mainnet: ';; [MAINNET]'
};

const isTraitLine = (line) =>
  line.includes('(impl-trait') || line.includes('(use-trait');

const normalizeTraitLines = (content, targetTrait) => {
  const lines = content.split('\n');
  let section = null;
  const sectionsFound = new Set();
  const updated = lines.map((line) => {
    if (line.includes(MARKERS.local)) {
      section = 'local';
      sectionsFound.add('local');
      return line;
    }
    if (line.includes(MARKERS.testnet)) {
      section = 'testnet';
      sectionsFound.add('testnet');
      return line;
    }
    if (line.includes(MARKERS.mainnet)) {
      section = 'mainnet';
      sectionsFound.add('mainnet');
      return line;
    }
    if (!section || !isTraitLine(line)) {
      return line;
    }

    const match = line.match(/^(\s*)(?:;;\s*)?(.*)$/);
    if (!match) {
      return line;
    }
    const indent = match[1] ?? '';
    const body = (match[2] ?? '').trim();
    if (!body.startsWith('(')) {
      return line;
    }
    const enabled = section === targetTrait;
    return enabled ? `${indent}${body}` : `${indent};; ${body}`;
  });

  return {
    content: updated.join('\n'),
    sectionsFound
  };
};

const stripTraitBlock = (content) => {
  const lines = content.split('\n');
  let section = null;
  const normalized = [];
  for (const line of lines) {
    if (line.includes(MARKERS.local)) {
      section = 'local';
      normalized.push(line);
      continue;
    }
    if (line.includes(MARKERS.testnet)) {
      section = 'testnet';
      normalized.push(line);
      continue;
    }
    if (line.includes(MARKERS.mainnet)) {
      section = 'mainnet';
      normalized.push(line);
      continue;
    }
    if (section && isTraitLine(line)) {
      continue;
    }
    normalized.push(line);
  }
  return normalized.join('\n');
};

const loadFile = async (filePath, fallbackPath, fix) => {
  const absolute = path.join(ROOT, filePath);
  try {
    return {
      path: filePath,
      content: await fs.readFile(absolute, 'utf8'),
      existed: true
    };
  } catch (error) {
    if (!fix) {
      throw new Error(`Missing contract file: ${filePath}`);
    }
    const fallbackAbsolute = path.join(ROOT, fallbackPath);
    const fallbackContent = await fs.readFile(fallbackAbsolute, 'utf8');
    await fs.writeFile(absolute, fallbackContent, 'utf8');
    return {
      path: filePath,
      content: fallbackContent,
      existed: false
    };
  }
};

const main = async () => {
  const mode = process.argv[2] ?? 'verify';
  const fix = mode === 'sync' || mode === 'fix' || mode === '--fix';
  const results = [];
  const rows = [];

  for (const set of VARIANT_SETS) {
    const setResults = [];
    for (const variant of set.variants) {
      const loaded = await loadFile(variant.file, variant.fallback, fix);
      const normalized = normalizeTraitLines(loaded.content, variant.trait);
      const missing = ['local', 'testnet', 'mainnet'].filter(
        (entry) => !normalized.sectionsFound.has(entry)
      );
      if (missing.length > 0) {
        throw new Error(
          `${set.id}/${variant.name} contract missing trait markers: ${missing.join(', ')}`
        );
      }

      const updated = normalized.content;
      const changed = updated !== loaded.content;
      if (changed && fix) {
        const absolute = path.join(ROOT, variant.file);
        await fs.writeFile(absolute, updated, 'utf8');
      }

      const entry = {
        name: variant.name,
        file: variant.file,
        trait: variant.trait,
        changed,
        existed: loaded.existed,
        content: updated
      };
      results.push(entry);
      setResults.push(entry);
    }

    const reference = stripTraitBlock(setResults[0].content);
    for (const result of setResults.slice(1)) {
      const normalized = stripTraitBlock(result.content);
      if (normalized !== reference) {
        throw new Error(
          `Contract sources differ beyond trait block (${set.id}): ${setResults[0].file} vs ${result.file}`
        );
      }
    }

    for (const entry of setResults) {
      const status = entry.changed ? (fix ? 'updated' : 'mismatch') : 'ok';
      const created = entry.existed ? '' : ' (created)';
      rows.push(
        `- ${set.id}/${entry.name}: ${entry.file} -> ${entry.trait} [${status}]${created}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log('Contract trait variants');
  // eslint-disable-next-line no-console
  console.log(rows.join('\n'));

  if (!fix) {
    const mismatches = results.filter((entry) => entry.changed);
    if (mismatches.length > 0) {
      const detail = mismatches.map((entry) => entry.file).join(', ');
      throw new Error(`Trait variants out of sync: ${detail}`);
    }
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`Contract variant check failed: ${message}`);
  process.exit(1);
});
