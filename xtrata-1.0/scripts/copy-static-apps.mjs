import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const staticApps = [
  {
    source: 'opus-file-generator',
    target: 'dist/opus-file-generator'
  }
];

const ignoredNames = new Set(['.DS_Store', '.git', '.gitignore', '.gitIgnore']);

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
