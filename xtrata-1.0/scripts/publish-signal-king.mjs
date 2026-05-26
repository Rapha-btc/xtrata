import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const repoRoot = process.cwd();
const source = resolve(repoRoot, 'recursive-apps/signal-king/index.html');
const outputs = [
  resolve(repoRoot, 'dist/signal-king.html'),
  resolve(repoRoot, 'dist/recursive-apps/signal-king.html')
];

for (const output of outputs) {
  await mkdir(dirname(output), { recursive: true });
  await copyFile(source, output);
}

console.log('[signal-king] published standalone previews', {
  source,
  outputs
});
