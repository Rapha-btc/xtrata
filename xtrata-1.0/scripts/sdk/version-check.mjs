#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sdkPackagePath = path.join(rootDir, 'packages', 'xtrata-sdk', 'package.json');
const reconstructionPackagePath = path.join(
  rootDir,
  'packages',
  'xtrata-reconstruction',
  'package.json'
);

const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const readPackage = async (packagePath) => {
  const raw = await fs.readFile(packagePath, 'utf8');
  return JSON.parse(raw);
};

const fail = (message) => {
  console.error(`[sdk:version:check] FAIL ${message}`);
  process.exit(1);
};

const main = async () => {
  const sdkPackage = await readPackage(sdkPackagePath);
  const reconstructionPackage = await readPackage(reconstructionPackagePath);

  for (const pkg of [sdkPackage, reconstructionPackage]) {
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@xtrata/')) {
      fail(`invalid package name: ${pkg.name}`);
    }
    if (typeof pkg.version !== 'string' || !semverPattern.test(pkg.version)) {
      fail(`invalid semver for ${pkg.name}: ${pkg.version}`);
    }
    if (pkg.private === true) {
      fail(`${pkg.name} must not be private for publish readiness.`);
    }
  }

  if (sdkPackage.version !== reconstructionPackage.version) {
    fail(
      `package versions differ (${sdkPackage.name}@${sdkPackage.version} vs ${reconstructionPackage.name}@${reconstructionPackage.version}).`
    );
  }

  console.log(
    `[sdk:version:check] PASS ${sdkPackage.name}@${sdkPackage.version} ${reconstructionPackage.name}@${reconstructionPackage.version}`
  );
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
