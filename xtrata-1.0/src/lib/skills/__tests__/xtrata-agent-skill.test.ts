import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const SKILL_FILE = path.join(REPO_ROOT, 'XTRATA_AGENT_SKILL.md');
const PUBLIC_APP_FILE = path.join(REPO_ROOT, 'src', 'PublicApp.tsx');

const MINT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'xtrata-mint-example.js');
const TRANSFER_SCRIPT = path.join(REPO_ROOT, 'scripts', 'xtrata-transfer-example.js');
const QUERY_SCRIPT = path.join(REPO_ROOT, 'scripts', 'xtrata-query-example.js');
const AI_SKILLS_DOCS_INDEX = path.join(REPO_ROOT, 'docs', 'ai-skills', 'README.md');
const AI_SKILLS_INSCRIBE_DOC = path.join(REPO_ROOT, 'docs', 'ai-skills', 'skill-inscribe.md');
const AI_SKILLS_AIBTC_DOC = path.join(REPO_ROOT, 'docs', 'ai-skills', 'aibtc-agent-training.md');
const AI_SKILLS_GENERIC_DOC = path.join(REPO_ROOT, 'docs', 'ai-skills', 'generic-agent-training.md');

const PUBLIC_FUNCTIONS = [
  'transfer',
  'set-fee-recipient',
  'set-royalty-recipient',
  'set-staged-begin-fee-unit',
  'set-staged-seal-fee-unit',
  'set-single-tx-fee-unit',
  'set-upload-byte-fee-unit',
  'set-extra-batch-fee-unit',
  'set-fee-unit',
  'set-wallet-fee-bps',
  'clear-wallet-fee-bps',
  'set-wallet-fee-bps-batch',
  'set-caller-fee-bps',
  'clear-caller-fee-bps',
  'set-caller-fee-bps-batch',
  'set-next-id',
  'set-allowed-caller',
  'set-paused',
  'transfer-contract-ownership',
  'migrate-from-v1',
  'migrate-from-v2-1-0',
  'migrate-from-v2-1-1',
  'begin-or-get',
  'begin-inscription',
  'abandon-upload',
  'purge-expired-chunk-batch',
  'add-chunk-batch',
  'seal-inscription',
  'seal-inscription-batch',
  'seal-recursive',
  'seal-with-relationships',
  'mint-single-tx',
  'mint-single-tx-recursive',
  'mint-single-tx-with-relationships'
] as const;

const READ_ONLY_FUNCTIONS = [
  'get-last-token-id',
  'get-next-token-id',
  'get-minted-count',
  'get-minted-id',
  'get-token-uri',
  'get-token-uri-raw',
  'get-owner',
  'get-svg',
  'get-svg-data-uri',
  'get-id-by-hash',
  'get-inscription-meta',
  'inscription-exists',
  'get-inscription-hash',
  'get-inscription-creator',
  'get-inscription-size',
  'get-inscription-chunks',
  'is-inscription-sealed',
  'get-chunk',
  'get-chunk-batch',
  'get-dependencies',
  'get-upload-state',
  'get-pending-chunk',
  'get-migration-source',
  'get-mint-origin',
  'quote-inscription-fee',
  'get-admin',
  'is-allowed-caller',
  'get-fee-recipient',
  'get-royalty-recipient',
  'get-fee-unit',
  'get-begin-fee-unit',
  'get-upload-chunk-fee-unit',
  'get-upload-batch-fee-unit',
  'get-seal-fee-unit',
  'get-single-tx-fee-unit',
  'get-upload-byte-fee-unit',
  'get-extra-batch-fee-unit',
  'get-wallet-fee-bps',
  'get-caller-fee-bps',
  'is-paused'
] as const;

const ERROR_CODES = ['u100', 'u101', 'u102', 'u103', 'u107', 'u109', 'u110', 'u111', 'u112', 'u113', 'u114', 'u115', 'u116', 'u117', 'u118', 'u119'] as const;

describe('XTRATA_AGENT_SKILL package', () => {
  it('ships the skill file and companion scripts', () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(existsSync(MINT_SCRIPT)).toBe(true);
    expect(existsSync(TRANSFER_SCRIPT)).toBe(true);
    expect(existsSync(QUERY_SCRIPT)).toBe(true);
  });

  it('ships a dedicated AI docs set for aibtc and generic agent tracks', () => {
    expect(existsSync(AI_SKILLS_DOCS_INDEX)).toBe(true);
    expect(existsSync(AI_SKILLS_INSCRIBE_DOC)).toBe(true);
    expect(existsSync(AI_SKILLS_AIBTC_DOC)).toBe(true);
    expect(existsSync(AI_SKILLS_GENERIC_DOC)).toBe(true);

    const docsIndex = readFileSync(AI_SKILLS_DOCS_INDEX, 'utf8');
    expect(docsIndex).toContain('aibtc');
    expect(docsIndex).toContain('generic');
    expect(docsIndex).toContain('XTRATA_AGENT_SKILL.md');
    expect(docsIndex).toContain('https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md');
    expect(docsIndex).toContain('https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-mint-example.js');
    expect(docsIndex).toContain('core-native single-tx minting');

    const inscribeDoc = readFileSync(AI_SKILLS_INSCRIBE_DOC, 'utf8');
    expect(inscribeDoc).toContain('mint-single-tx');
    expect(inscribeDoc).toContain('mint-single-tx-recursive');
    expect(inscribeDoc).toContain('get-upload-state');
    expect(inscribeDoc).toContain('principalCV(senderAddress)');
    expect(inscribeDoc).toContain('quote-inscription-fee');

    const aibtcDoc = readFileSync(AI_SKILLS_AIBTC_DOC, 'utf8');
    expect(aibtcDoc).toContain('mint-single-tx');
    expect(aibtcDoc).toContain('mint-single-tx-recursive');
    expect(aibtcDoc).toContain('get-upload-state(expected-hash, owner)');
    expect(aibtcDoc).toContain('https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/XTRATA_AGENT_SKILL.md');
    expect(aibtcDoc).toContain('https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-transfer-example.js');

    const genericDoc = readFileSync(AI_SKILLS_GENERIC_DOC, 'utf8');
    expect(genericDoc).toContain('mint-single-tx');
    expect(genericDoc).toContain('upload-state check');
    expect(genericDoc).toContain('https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/ai-skills/README.md');
    expect(genericDoc).toContain('https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/scripts/xtrata-query-example.js');
  });

  it('documents required contract identifiers and fee model', () => {
    const content = readFileSync(SKILL_FILE, 'utf8');

    expect(content).toContain('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X');
    expect(content).toContain('xtrata-v3-0-0');
    expect(content).toContain('SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v3-0-0');
    expect(content).toContain('quote-inscription-fee');
    expect(content).toContain('mint-single-tx');
    expect(content).toContain('mint-single-tx-recursive');
    expect(content).toContain('PostConditionMode.Deny');
    expect(content).toContain('TX_DELAY_MS = 5000');
  });

  it('documents all public and read-only contract functions', () => {
    const content = readFileSync(SKILL_FILE, 'utf8');
    for (const fn of PUBLIC_FUNCTIONS) {
      expect(content).toContain(`\`${fn}\``);
    }
    for (const fn of READ_ONLY_FUNCTIONS) {
      expect(content).toContain(`\`${fn}\``);
    }
  });

  it('documents all contract error codes and core constants', () => {
    const content = readFileSync(SKILL_FILE, 'utf8');
    for (const code of ERROR_CODES) {
      expect(content).toContain(code);
    }
    expect(content).toContain('CHUNK-SIZE');
    expect(content).toContain('MAX-BATCH-SIZE');
    expect(content).toContain('MAX-TOTAL-CHUNKS');
    expect(content).toContain('UPLOAD-EXPIRY-BLOCKS');
  });

  it('includes workflow, aibtc, error handling, and network sections', () => {
    const content = readFileSync(SKILL_FILE, 'utf8');
    expect(content).toContain('## Workflows');
    expect(content).toContain('## aibtc Integration');
    expect(content).toContain('## Error Handling');
    expect(content).toContain('## API Endpoints');
    expect(content).toContain('## Security Notes');
    expect(content).toContain('withRetry');
  });

  it('companion scripts include required call flow and network controls', () => {
    const mint = readFileSync(MINT_SCRIPT, 'utf8');
    expect(mint).toContain('XTRATA_NETWORK');
    expect(mint).toContain('quote-inscription-fee');
    expect(mint).toContain('mint-single-tx');
    expect(mint).toContain('begin-or-get');
    expect(mint).toContain('add-chunk-batch');
    expect(mint).toContain('seal-recursive');
    expect(mint).toContain('seal-inscription');

    const transfer = readFileSync(TRANSFER_SCRIPT, 'utf8');
    expect(transfer).toContain('XTRATA_NETWORK');
    expect(transfer).toContain('get-owner');
    expect(transfer).toContain('transfer');

    const query = readFileSync(QUERY_SCRIPT, 'utf8');
    expect(query).toContain('XTRATA_NETWORK');
    expect(query).toContain('get-inscription-meta');
    expect(query).toContain('get-chunk-batch');
    expect(query).toContain('quote-inscription-fee');
  });

  it('companion scripts parse in Node without syntax errors', () => {
    execFileSync(process.execPath, ['--check', MINT_SCRIPT], { stdio: 'pipe' });
    execFileSync(process.execPath, ['--check', TRANSFER_SCRIPT], { stdio: 'pipe' });
    execFileSync(process.execPath, ['--check', QUERY_SCRIPT], { stdio: 'pipe' });
  });

  it('public docs section includes AI training topic and external links', () => {
    const publicApp = readFileSync(PUBLIC_APP_FILE, 'utf8');
    expect(publicApp).toContain("id: 'ai-agent-training'");
    expect(publicApp).toContain("id: 'ai-skills-docs'");
    expect(publicApp).toContain("id: 'ai-skills-aibtc'");
    expect(publicApp).toContain("id: 'ai-skills-generic'");
    expect(publicApp).toContain('https://github.com/stxtrata/xtrata/tree/OPTIMISATIONS/xtrata-1.0/docs/ai-skills');
    expect(publicApp).toContain('https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/ai-skills/aibtc-agent-training.md');
    expect(publicApp).toContain('https://github.com/stxtrata/xtrata/blob/OPTIMISATIONS/xtrata-1.0/docs/ai-skills/generic-agent-training.md');
  });
});
