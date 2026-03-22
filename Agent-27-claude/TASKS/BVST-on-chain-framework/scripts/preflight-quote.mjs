import { spawn } from 'node:child_process';
import path from 'node:path';
import { bundleRoot, repoRoot } from './_inscription-helpers.mjs';

const scriptPath = path.join(repoRoot, 'skills', 'xtrata-release-plan', 'scripts', 'xtrata-release-preflight.cjs');
const child = spawn(process.execPath, [scriptPath, bundleRoot, ...process.argv.slice(2)], {
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

child.on('error', (err) => {
  console.error(err);
  process.exitCode = 1;
});
