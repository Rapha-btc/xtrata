import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const staticApps = [
  {
    source: 'opus-file-generator',
    target: 'dist/opus-file-generator'
  },
  {
    source: 'recursive-apps/x-board',
    target: 'dist/recursive-apps/x-board'
  }
];

const ignoredNames = new Set(['.DS_Store', '.git', '.gitignore', '.gitIgnore', 'node_modules']);

const copyStaticApp = async ({ source, target }) => {
  const sourcePath = join(repoRoot, source);
  const targetPath = join(repoRoot, target);
  const sourceStats = await stat(sourcePath).catch(() => null);

  if (!sourceStats?.isDirectory()) {
    throw new Error(`Static app source directory not found: ${source}`);
  }

  await mkdir(join(repoRoot, 'dist'), { recursive: true });
  await rm(targetPath, { recursive: true, force: true });
  await cp(sourcePath, targetPath, {
    recursive: true,
    filter: (path) => {
      const name = basename(path);
      return !ignoredNames.has(name);
    }
  });

  console.log(`[static-apps] copied ${source} -> ${target}`);
};

for (const staticApp of staticApps) {
  await copyStaticApp(staticApp);
}

const createXboardAliases = async () => {
  const versionSourceDir = join(repoRoot, 'recursive-apps/x-board/xboard-version-testing');
  const aliasDir = join(repoRoot, 'dist/x-board');
  const entries = await readdir(versionSourceDir, { withFileTypes: true });
  const versionFiles = entries
    .filter((entry) => entry.isFile() && /^x-board-v\d+(?:\.\d+)?(?:-[^.]+)?\.html$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  await rm(aliasDir, { recursive: true, force: true });
  await mkdir(aliasDir, { recursive: true });

  await cp(join(versionSourceDir, 'index.html'), join(aliasDir, 'index.html'));
  await cp(join(versionSourceDir, 'latest-manifest.js'), join(aliasDir, 'latest-manifest.js'));

  for (const fileName of versionFiles) {
    const sourcePath = join(versionSourceDir, fileName);
    const slug = parse(fileName).name;
    await cp(sourcePath, join(aliasDir, fileName));
    await mkdir(join(aliasDir, slug), { recursive: true });
    await cp(sourcePath, join(aliasDir, slug, 'index.html'));
  }

  console.log(`[static-apps] generated x-board aliases -> dist/x-board (${versionFiles.length} versions)`);
};

await createXboardAliases();
