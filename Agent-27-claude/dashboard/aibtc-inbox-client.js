const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

let _cachedTools = null;

function getNpxRoot() {
  return path.join(os.homedir(), '.npm', '_npx');
}

function resolveAibtcPackageRoot() {
  const override = process.env.AIBTC_MCP_ROOT;
  if (override) {
    const abs = path.resolve(override);
    if (fs.existsSync(path.join(abs, 'package.json'))) return abs;
  }

  const npxRoot = getNpxRoot();
  if (!fs.existsSync(npxRoot)) {
    throw new Error('AIBTC MCP package cache not found under ~/.npm/_npx');
  }

  const candidates = [];
  for (const entry of fs.readdirSync(npxRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(npxRoot, entry.name, 'node_modules', '@aibtc', 'mcp-server');
    const pkgPath = path.join(candidate, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const stat = fs.statSync(pkgPath);
    candidates.push({ root: candidate, mtimeMs: stat.mtimeMs });
  }

  if (candidates.length === 0) {
    throw new Error('No cached @aibtc/mcp-server package found under ~/.npm/_npx');
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].root;
}

async function loadRegisteredTools() {
  if (_cachedTools) return _cachedTools;

  const packageRoot = resolveAibtcPackageRoot();
  const inboxModule = await import(pathToFileURL(path.join(packageRoot, 'dist', 'tools', 'inbox.tools.js')).href);
  const walletModule = await import(pathToFileURL(path.join(packageRoot, 'dist', 'tools', 'wallet-management.tools.js')).href);

  const handlers = new Map();
  const server = {
    registerTool(name, _config, handler) {
      handlers.set(name, handler);
    }
  };

  walletModule.registerWalletManagementTools(server);
  inboxModule.registerInboxTools(server);

  _cachedTools = {
    packageRoot,
    handlers
  };
  return _cachedTools;
}

function extractToolText(response) {
  const blocks = Array.isArray(response?.content) ? response.content : [];
  return blocks
    .filter((block) => block && block.type === 'text')
    .map((block) => String(block.text || ''))
    .join('\n')
    .trim();
}

function parseToolResponse(response) {
  const text = extractToolText(response);
  if (response?.isError) {
    const errorText = text.startsWith('Error: ') ? text.slice('Error: '.length) : text || 'Unknown MCP error';
    return { ok: false, text, error: errorText };
  }

  if (!text) return { ok: true, text: '', data: {} };

  try {
    return { ok: true, text, data: JSON.parse(text) };
  } catch {
    return { ok: true, text, data: { raw: text } };
  }
}

async function callTool(name, args) {
  const { handlers } = await loadRegisteredTools();
  const handler = handlers.get(name);
  if (!handler) {
    throw new Error(`AIBTC MCP tool not registered: ${name}`);
  }
  const response = await handler(args || {});
  return parseToolResponse(response);
}

async function unlockWallet(password) {
  if (!password) {
    return { ok: true, skipped: true };
  }

  const result = await callTool('wallet_unlock', { password });
  if (!result.ok) {
    throw new Error(result.error || 'wallet_unlock failed');
  }
  return result;
}

async function sendInboxMessage({ recipientBtcAddress, recipientStxAddress, content, walletPassword, paymentTxid }) {
  await unlockWallet(walletPassword);
  const result = await callTool('send_inbox_message', {
    recipientBtcAddress,
    recipientStxAddress,
    content,
    ...(paymentTxid ? { paymentTxid } : {})
  });

  if (!result.ok) {
    throw new Error(result.error || 'send_inbox_message failed');
  }

  const data = result.data || {};
  if (data.success === false) {
    throw new Error(data.message || result.text || 'send_inbox_message failed');
  }

  return data;
}

module.exports = {
  sendInboxMessage,
  resolveAibtcPackageRoot
};
