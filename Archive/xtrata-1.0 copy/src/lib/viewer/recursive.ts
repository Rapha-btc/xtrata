import { callReadOnlyFunction } from '@stacks/transactions';
import type { ClarityValue } from '@stacks/transactions';
import { deserializeCV, serializeCV } from '@stacks/transactions';
import type { ContractConfig } from '../contract/config';
import { getContractId } from '../contract/config';
import { callReadOnlyWithRetry } from '../contract/read-only';
import { toStacksNetwork } from '../network/stacks';
import { bytesToHex } from '../utils/encoding';
import { logDebug, logWarn } from '../utils/logger';

type RecursiveBridgeContext = {
  bridgeId: string;
  contract: ContractConfig;
  senderAddress: string;
  source?: MessageEventSource | null;
  origin?: string | null;
};

type RecursiveRequestMessage = {
  type: 'xtrata:recursive:request';
  bridgeId: string;
  requestId: string;
  functionName: string;
  contractAddress: string;
  contractName: string;
  arguments?: string[];
  sender?: string;
};

type RecursiveResponseMessage = {
  type: 'xtrata:recursive:response';
  bridgeId: string;
  requestId: string;
  ok: boolean;
  result?: string;
  cause?: string;
};

const ALLOWED_FUNCTIONS = new Set([
  'get-chunk',
  'get-inscription-meta',
  'get-token-uri',
  'get-owner',
  'get-dependencies',
  'get-svg',
  'get-svg-data-uri'
]);

const registry = new Map<string, RecursiveBridgeContext>();
let listenerAttached = false;

const ensureListener = () => {
  if (listenerAttached) {
    return;
  }
  if (typeof window === 'undefined') {
    return;
  }
  window.addEventListener('message', (event) => {
    void handleMessage(event as MessageEvent<RecursiveRequestMessage>);
  });
  listenerAttached = true;
};

const toHex = (value: ClarityValue) => `0x${bytesToHex(serializeCV(value))}`;

const respond = (
  target: MessageEventSource | null,
  message: RecursiveResponseMessage,
  origin?: string | null
) => {
  if (!target || typeof (target as Window).postMessage !== 'function') {
    return;
  }
  const targetOrigin = origin && origin !== 'null' ? origin : '*';
  (target as Window).postMessage(message, targetOrigin);
};

const parseArgs = (args: string[] | undefined) => {
  if (!args || !Array.isArray(args)) {
    return [] as ClarityValue[];
  }
  return args.map((arg) => {
    if (typeof arg !== 'string') {
      throw new Error('Invalid argument type');
    }
    return deserializeCV(arg);
  });
};

const handleMessage = async (event: MessageEvent<RecursiveRequestMessage>) => {
  const data = event.data;
  if (!data || data.type !== 'xtrata:recursive:request') {
    return;
  }
  const context = registry.get(data.bridgeId);
  if (!context) {
    return;
  }
  if (context.source && event.source !== context.source) {
    return;
  }
  if (context.origin && event.origin && event.origin !== context.origin) {
    return;
  }
  if (!context.source && event.source) {
    context.source = event.source;
  }
  if (!context.origin && event.origin) {
    context.origin = event.origin;
  }
  const contractId = getContractId(context.contract);
  if (
    data.contractAddress !== context.contract.address ||
    data.contractName !== context.contract.contractName
  ) {
    respond(event.source, {
      type: 'xtrata:recursive:response',
      bridgeId: data.bridgeId,
      requestId: data.requestId,
      ok: false,
      cause: 'Contract mismatch'
    }, context.origin ?? event.origin);
    return;
  }
  if (!ALLOWED_FUNCTIONS.has(data.functionName)) {
    respond(event.source, {
      type: 'xtrata:recursive:response',
      bridgeId: data.bridgeId,
      requestId: data.requestId,
      ok: false,
      cause: 'Function not allowed'
    }, context.origin ?? event.origin);
    return;
  }

  try {
    const functionArgs = parseArgs(data.arguments);
    const network = toStacksNetwork(context.contract.network);
    const senderAddress =
      context.senderAddress || context.contract.address;
    const value = await callReadOnlyWithRetry({
      task: () =>
        callReadOnlyFunction({
          contractAddress: context.contract.address,
          contractName: context.contract.contractName,
          functionName: data.functionName,
          functionArgs,
          senderAddress,
          network
        }),
      functionName: data.functionName,
      contractId
    });

    respond(event.source, {
      type: 'xtrata:recursive:response',
      bridgeId: data.bridgeId,
      requestId: data.requestId,
      ok: true,
      result: toHex(value)
    }, context.origin ?? event.origin);
  } catch (error) {
    logWarn('recursive', 'Bridge call failed', {
      contractId,
      functionName: data.functionName,
      error: error instanceof Error ? error.message : String(error)
    });
    respond(event.source, {
      type: 'xtrata:recursive:response',
      bridgeId: data.bridgeId,
      requestId: data.requestId,
      ok: false,
      cause: error instanceof Error ? error.message : String(error)
    }, context.origin ?? event.origin);
  }
};

export const createBridgeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  const suffix = Math.random().toString(16).slice(2);
  return `bridge-${Date.now().toString(16)}-${suffix}`;
};

export const registerRecursiveBridge = (params: {
  bridgeId: string;
  contract: ContractConfig;
  senderAddress: string;
  source?: MessageEventSource | null;
  origin?: string | null;
}) => {
  registry.set(params.bridgeId, {
    bridgeId: params.bridgeId,
    contract: params.contract,
    senderAddress: params.senderAddress,
    source: params.source ?? null,
    origin: params.origin ?? null
  });
  ensureListener();
  logDebug('recursive', 'Registered recursive bridge', {
    bridgeId: params.bridgeId,
    contractId: getContractId(params.contract)
  });
  return () => {
    registry.delete(params.bridgeId);
  };
};

const buildBridgeScript = (bridgeId: string) => {
  const safeBridgeId = JSON.stringify(bridgeId);
  return `<script data-xtrata-bridge="true">
(function(){
  if (window.__xtrataRecursiveBridge) { return; }
  const bridgeId = ${safeBridgeId};
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;
  const pending = new Map();
  let seq = 0;

  function parseReadOnlyUrl(url) {
    if (!url) return null;
    const marker = '/v2/contracts/call-read/';
    const index = url.indexOf(marker);
    if (index === -1) return null;
    const tail = url.slice(index + marker.length);
    const parts = tail.split('/');
    if (parts.length < 3) return null;
    const functionName = parts[2].split('?')[0].split('#')[0];
    return {
      contractAddress: parts[0],
      contractName: parts[1],
      functionName
    };
  }

  function buildResponse(payload) {
    const body = payload.ok
      ? { okay: true, result: payload.result }
      : { okay: false, cause: payload.cause || 'error' };
    const json = JSON.stringify(body);
    if (typeof Response === 'function') {
      return new Response(json, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return {
      ok: true,
      json: async () => body,
      text: async () => json,
      headers: {
        get: (key) => (key && key.toLowerCase() === 'content-type' ? 'application/json' : null)
      }
    };
  }

  function callBridge(payload) {
    return new Promise((resolve, reject) => {
      if (!window.parent || window.parent === window) {
        reject(new Error('No parent bridge available'));
        return;
      }
      const requestId = bridgeId + ':' + String(++seq);
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Bridge timeout'));
      }, 15000);
      pending.set(requestId, { resolve, reject, timeout });
      window.parent.postMessage(
        {
          type: 'xtrata:recursive:request',
          bridgeId,
          requestId,
          functionName: payload.functionName,
          contractAddress: payload.contractAddress,
          contractName: payload.contractName,
          arguments: payload.arguments || [],
          sender: payload.sender || ''
        },
        '*'
      );
    });
  }

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== 'xtrata:recursive:response' || data.bridgeId !== bridgeId) {
      return;
    }
    const entry = pending.get(data.requestId);
    if (!entry) return;
    clearTimeout(entry.timeout);
    pending.delete(data.requestId);
    if (data.ok) {
      entry.resolve(data.result);
    } else {
      entry.reject(new Error(data.cause || 'Bridge error'));
    }
  });

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const parsed = parseReadOnlyUrl(url);
    if (!parsed || !originalFetch) {
      return originalFetch ? originalFetch(input, init) : Promise.reject(new Error('fetch unavailable'));
    }
    const method = init && init.method ? init.method.toUpperCase() : 'GET';
    if (method !== 'POST') {
      return originalFetch(input, init);
    }
    let body = init && init.body ? init.body : null;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (err) {
        body = null;
      }
    }
    if (!body || !Array.isArray(body.arguments)) {
      return originalFetch(input, init);
    }
    try {
      const result = await callBridge({
        functionName: parsed.functionName,
        contractAddress: parsed.contractAddress,
        contractName: parsed.contractName,
        arguments: body.arguments,
        sender: body.sender || ''
      });
      return buildResponse({ ok: true, result });
    } catch (err) {
      return buildResponse({ ok: false, cause: err && err.message ? err.message : String(err) });
    }
  };

  window.__xtrataRecursiveBridge = { bridgeId };
})();
</script>`;
};

const insertAfterTag = (html: string, tagName: string, content: string) => {
  const regex = new RegExp(`<${tagName}[^>]*>`, 'i');
  const match = html.match(regex);
  if (!match || match.index === undefined) {
    return null;
  }
  const index = match.index + match[0].length;
  return `${html.slice(0, index)}${content}${html.slice(index)}`;
};

export const injectRecursiveBridgeHtml = (html: string, bridgeId: string) => {
  if (!bridgeId || !html) {
    return html;
  }
  if (html.includes('data-xtrata-bridge')) {
    return html;
  }
  const script = buildBridgeScript(bridgeId);
  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}</head>`);
  }
  const afterHead = insertAfterTag(html, 'head', script);
  if (afterHead) {
    return afterHead;
  }
  const afterBody = insertAfterTag(html, 'body', script);
  if (afterBody) {
    return afterBody;
  }
  return `${script}${html}`;
};
