const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

let _cachedTools = null;
const RECOVERY_WAIT_MS = Number(process.env.AIBTC_INBOX_RECOVERY_WAIT_MS || 90_000);
const RECOVERY_POLL_MS = Number(process.env.AIBTC_INBOX_RECOVERY_POLL_MS || 5_000);

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
  const recoveryModule = await import(pathToFileURL(path.join(packageRoot, 'dist', 'utils', 'x402-recovery.js')).href);
  const networkModule = await import(pathToFileURL(path.join(packageRoot, 'dist', 'services', 'x402.service.js')).href);

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
    handlers,
    pollTransactionConfirmation: recoveryModule.pollTransactionConfirmation,
    network: networkModule.NETWORK
  };
  return _cachedTools;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function emitStatus(onStatus, message) {
  if (typeof onStatus === 'function' && message) {
    onStatus(String(message));
  }
}

function createRecoveryError(message, recovery) {
  const error = new Error(message);
  if (recovery) error.recovery = recovery;
  return error;
}

function isConfirmedStatus(status) {
  return status === 'success' || status === 'confirmed';
}

function extractRecoveryMetadata(errorText) {
  const raw = String(errorText || '');
  const txid = raw.match(/\btxid:\s*([0-9a-f]{64})/i)?.[1] || '';
  const status = raw.match(/\bstatus:\s*([a-z-]+)/i)?.[1] || '';
  const explorer = raw.match(/\bexplorer:\s*(https?:\/\/\S+)/i)?.[1] || '';
  const retryAfterSeconds = Number(raw.match(/retryAfter[^0-9]*(\d+)/i)?.[1] || 0);

  const topLevelJsonText = raw
    .replace(/^Message delivery failed \(\d+\):\s*/i, '')
    .split('\n\nPayment transaction was submitted but settlement failed.')[0]
    .trim();
  const topLevel = safeJsonParse(topLevelJsonText);
  const relayText = typeof topLevel?.error === 'string' ? topLevel.error : '';
  const relayJsonText = relayText.startsWith('Sponsor relay failed: ')
    ? relayText.slice('Sponsor relay failed: '.length)
    : '';
  const relay = safeJsonParse(relayJsonText);
  const relayCode = String(relay?.code || '').trim();
  const retryable = relay?.retryable === true || /retryable[^a-z]*(true|1)/i.test(raw);

  return {
    paymentTxid: txid,
    status,
    explorer,
    retryAfterSeconds,
    relayCode,
    retryable,
    raw
  };
}

function shouldAutoRecoverNonceConflict(metadata) {
  if (!metadata?.paymentTxid) return false;
  if (metadata.relayCode === 'NONCE_CONFLICT') return true;
  return /NONCE_CONFLICT|ConflictingNonceInMempool|BadNonce/i.test(metadata.raw || '');
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

async function invokeSendInboxMessage({ recipientBtcAddress, recipientStxAddress, content, paymentTxid }) {
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

async function waitForPaymentConfirmation(paymentTxid) {
  const { pollTransactionConfirmation, network } = await loadRegisteredTools();
  return pollTransactionConfirmation(paymentTxid, network, RECOVERY_WAIT_MS, RECOVERY_POLL_MS);
}

async function recoverWithPaymentTxid({ recipientBtcAddress, recipientStxAddress, content, paymentTxid, onStatus, initialErrorText }) {
  const normalizedTxid = String(paymentTxid || '').trim();
  if (!normalizedTxid) {
    throw new Error('Missing payment txid for inbox recovery');
  }

  emitStatus(onStatus, `waiting for payment confirmation ${normalizedTxid.slice(0, 12)}...`);
  const confirmation = await waitForPaymentConfirmation(normalizedTxid);
  const recovery = {
    paymentTxid: confirmation.txid || normalizedTxid,
    status: confirmation.status || 'pending',
    explorer: confirmation.explorer || ''
  };

  if (!isConfirmedStatus(recovery.status)) {
    const prefix = initialErrorText ? `${initialErrorText}\n\n` : '';
    throw createRecoveryError(
      `${prefix}Payment tx is still ${recovery.status}. Keep the existing payment txid and retry recovery after confirmation.\n` +
      `  txid: ${recovery.paymentTxid}\n` +
      `  status: ${recovery.status}\n` +
      `  explorer: ${recovery.explorer || '[unavailable]'}`,
      recovery
    );
  }

  emitStatus(onStatus, `payment confirmed; retrying manual recovery ${recovery.paymentTxid.slice(0, 12)}...`);
  const data = await invokeSendInboxMessage({
    recipientBtcAddress,
    recipientStxAddress,
    content,
    paymentTxid: recovery.paymentTxid
  });

  const payment = data.payment && typeof data.payment === 'object' ? data.payment : {};
  data.payment = {
    ...payment,
    txid: payment.txid || recovery.paymentTxid,
    recovered: payment.recovered !== false,
    explorer: payment.explorer || recovery.explorer
  };
  return data;
}

async function sendInboxMessage({ recipientBtcAddress, recipientStxAddress, content, walletPassword, paymentTxid, onStatus }) {
  await unlockWallet(walletPassword);

  if (paymentTxid) {
    emitStatus(onStatus, `reusing prior payment txid ${String(paymentTxid).slice(0, 12)}...`);
    return recoverWithPaymentTxid({
      recipientBtcAddress,
      recipientStxAddress,
      content,
      paymentTxid,
      onStatus
    });
  }

  try {
    return await invokeSendInboxMessage({
      recipientBtcAddress,
      recipientStxAddress,
      content
    });
  } catch (error) {
    const errorText = error.message || 'send_inbox_message failed';
    const recovery = extractRecoveryMetadata(errorText);
    if (!shouldAutoRecoverNonceConflict(recovery)) {
      throw error;
    }

    if (recovery.retryAfterSeconds > 0) {
      emitStatus(onStatus, `nonce conflict from sponsor relay; backing off ${recovery.retryAfterSeconds}s...`);
      await sleep(recovery.retryAfterSeconds * 1000);
    } else {
      emitStatus(onStatus, 'nonce conflict from sponsor relay; attempting payment recovery...');
    }

    try {
      return await recoverWithPaymentTxid({
        recipientBtcAddress,
        recipientStxAddress,
        content,
        paymentTxid: recovery.paymentTxid,
        onStatus,
        initialErrorText: errorText
      });
    } catch (recoveryError) {
      if (!recoveryError.recovery) recoveryError.recovery = recovery;
      throw recoveryError;
    }
  }
}

module.exports = {
  sendInboxMessage,
  resolveAibtcPackageRoot
};
