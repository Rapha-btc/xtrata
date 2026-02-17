#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const docsDir = path.join(rootDir, 'docs', 'sdk');
const packageJsonPath = path.join(rootDir, 'package.json');

const markdownLinkPattern = /\[[^\]]*]\(([^)]+)\)/g;
const npmRunPattern = /`npm run ([a-zA-Z0-9:_-]+)`/g;

const isRemoteLink = (value) =>
  value.startsWith('http://') ||
  value.startsWith('https://') ||
  value.startsWith('mailto:') ||
  value.startsWith('#');

const normalizeLinkTarget = (rawTarget) => {
  const noTitle = rawTarget.trim().split(/\s+/)[0] ?? '';
  const unwrapped = noTitle.startsWith('<') && noTitle.endsWith('>')
    ? noTitle.slice(1, -1)
    : noTitle;
  const [withoutAnchor] = unwrapped.split('#');
  return withoutAnchor;
};

const resolveLinkPath = (sourceFilePath, target) => {
  if (target.startsWith('docs/') || target.startsWith('examples/') || target.startsWith('packages/')) {
    return path.resolve(rootDir, target);
  }
  return path.resolve(path.dirname(sourceFilePath), target);
};

const readMarkdownFiles = async () => {
  const entries = await fs.readdir(docsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(docsDir, entry.name));
};

const fileExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  const packageJsonRaw = await fs.readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);
  const knownScripts = new Set(Object.keys(packageJson.scripts ?? {}));
  const markdownFiles = await readMarkdownFiles();

  const missingLinks = [];
  const missingScripts = new Set();

  for (const filePath of markdownFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const relativeFilePath = path.relative(rootDir, filePath);

    for (const match of content.matchAll(markdownLinkPattern)) {
      const rawTarget = match[1] ?? '';
      if (!rawTarget || isRemoteLink(rawTarget)) {
        continue;
      }
      const target = normalizeLinkTarget(rawTarget);
      if (!target || isRemoteLink(target)) {
        continue;
      }
      const resolved = resolveLinkPath(filePath, target);
      const exists = await fileExists(resolved);
      if (!exists) {
        missingLinks.push({
          source: relativeFilePath,
          target: rawTarget
        });
      }
    }

    for (const match of content.matchAll(npmRunPattern)) {
      const scriptName = match[1];
      if (!knownScripts.has(scriptName)) {
        missingScripts.add(scriptName);
      }
    }
  }

  if (missingLinks.length > 0 || missingScripts.size > 0) {
    console.error('[sdk:docs:validate] FAIL');
    if (missingLinks.length > 0) {
      console.error('Missing local markdown links:');
      for (const item of missingLinks) {
        console.error(`- ${item.source}: ${item.target}`);
      }
    }
    if (missingScripts.size > 0) {
      console.error('Missing npm scripts referenced in docs:');
      for (const scriptName of missingScripts) {
        console.error(`- npm run ${scriptName}`);
      }
    }
    process.exit(1);
  }

  console.log(
    `[sdk:docs:validate] PASS (${markdownFiles.length} files, links + npm run references validated)`
  );
};

main().catch((error) => {
  console.error('[sdk:docs:validate] FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
