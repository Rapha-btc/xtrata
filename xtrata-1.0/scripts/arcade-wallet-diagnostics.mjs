import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { bytesToHex } from '@stacks/common';
import {
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  serializePostCondition
} from '@stacks/transactions';

const HIGHSCORES_PATH = 'recursive-apps/21-arcade/lib/highscores.js';

function createLocalStorage(){
  const store = new Map();
  return {
    getItem(key){
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value){
      store.set(key, String(value));
    },
    removeItem(key){
      store.delete(key);
    },
    clear(){
      store.clear();
    }
  };
}

function decodeJwtPayload(token){
  const parts = String(token || '').split('.');
  if(parts.length < 2) throw new Error('Invalid JWT token payload.');
  const payload = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = payload + '='.repeat((4 - (payload.length % 4 || 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function loadHighScores(){
  const code = fs.readFileSync(HIGHSCORES_PATH, 'utf8');
  const context = {
    console,
    window: {
      location: {
        protocol: 'https:',
        origin: 'http://localhost'
      },
      ARCADE_ONCHAIN_DEBUG: false
    },
    document: {
      body: {
        appendChild(){},
        removeChild(){}
      },
      createElement(){
        return {
          style: {},
          appendChild(){},
          removeChild(){},
          setAttribute(){},
          querySelector(){ return null; },
          addEventListener(){},
          removeEventListener(){},
          classList: {
            add(){},
            remove(){}
          }
        };
      },
      getElementById(){
        return null;
      }
    },
    localStorage: createLocalStorage(),
    fetch: async () => {
      throw new Error('fetch not mocked in diagnostics');
    },
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    Math,
    BigInt,
    Number,
    String,
    Array,
    Object,
    RegExp,
    Error,
    Buffer
  };
  context.window.window = context.window;
  context.window.document = context.document;
  context.window.localStorage = context.localStorage;
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(code, context, { filename: HIGHSCORES_PATH });

  const api = context.HighScores;
  if(!api){
    throw new Error('HighScores global was not initialized in diagnostics VM.');
  }
  return api;
}

async function runSerializePostConditionTest(api){
  const address = 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7';
  const expected = bytesToHex(
    serializePostCondition(
      makeStandardSTXPostCondition(address, FungibleConditionCode.LessEqual, 30000n)
    )
  );
  const actual = api._debugSerializeStxPostConditionHex({
    type: 'stx',
    address,
    amount: '30000',
    condition: 'less_equal'
  });
  assert.equal(actual, expected, 'Serialized STX post condition hex must match stacks.js output.');
}

async function runContractCallVariantTest(api){
  const variants = api._debugBuildContractCallParamVariants({
    contractAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-arcade-scores-v1-3',
    functionName: 'submit-score',
    functionArgs: ['0x0d00000003616263'],
    network: 'mainnet',
    postConditionMode: 2,
    postConditionVariants: [[{
      type: 'stx',
      address: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      amount: '30000',
      condition: 'less_equal'
    }]]
  });

  assert.ok(Array.isArray(variants) && variants.length > 0, 'Contract-call variants should be generated.');

  const hasHexPostConditionVariant = variants.some(variant => {
    const pcs = variant?.params?.postConditions;
    return Array.isArray(pcs) && pcs.length > 0 && typeof pcs[0] === 'string' && pcs[0].length > 0;
  });
  assert.ok(hasHexPostConditionVariant, 'At least one contract-call variant must use hex post conditions.');
}

async function runRequestMethodCompatibilityTest(api){
  const txResult = await api._debugRequestWalletContractCall({
    request(method, params){
      const pcs = params?.postConditions;
      const args = params?.functionArgs;
      const hasHexPostCondition = Array.isArray(pcs) && pcs.length > 0 && typeof pcs[0] === 'string' && !pcs[0].startsWith('0x');
      const hasNo0xArgs = Array.isArray(args) && args.every(arg => typeof arg === 'string' && !arg.startsWith('0x'));
      if(method !== 'stx_callContract' || !hasHexPostCondition || !hasNo0xArgs){
        return { jsonrpc: '2.0', id: 'diag', error: { code: -32602, message: 'Invalid parameters.' } };
      }
      return { jsonrpc: '2.0', id: 'diag', result: { txid: '0xdiag-rpc' } };
    }
  }, {
    contractAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-arcade-scores-v1-3',
    functionName: 'submit-score',
    functionArgs: [
      '0x0d0000000d617374726f5f626c6173746572',
      '0x0100000000000000000000000000000000',
      '0x01000000000000000000000000000007d3',
      '0x0d000000034a494d'
    ],
    network: 'mainnet',
    postConditionMode: 2,
    postConditionVariants: [[{
      type: 'stx',
      address: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      amount: '30000',
      condition: 'less_equal'
    }]],
    enableCallV2Fallback: false,
    enableTransactionRequestFallback: false
  }, 'window.XverseProviders.BitcoinProvider');

  assert.ok(txResult?.result?.txid === '0xdiag-rpc', 'RPC submit should succeed with compatible variant.');
}

async function runTransactionRequestCompatibilityTest(api){
  const txResult = await api._debugRequestWalletContractCall({
    transactionRequest(token){
      const payload = decodeJwtPayload(token);
      const pcs = payload?.postConditions;
      const args = payload?.functionArgs;
      const hasHexPostCondition = Array.isArray(pcs) && pcs.length > 0 && typeof pcs[0] === 'string' && !pcs[0].startsWith('0x');
      const hasNo0xArgs = Array.isArray(args) && args.every(arg => typeof arg === 'string' && !arg.startsWith('0x'));
      const hasNetwork = !!payload.network;
      if(!hasHexPostCondition || !hasNo0xArgs || !hasNetwork){
        throw new Error('transactionRequest payload format is incompatible');
      }
      return { txRaw: '0x00', txId: '0xdiag-token' };
    }
  }, {
    contractAddress: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
    contractName: 'xtrata-arcade-scores-v1-3',
    functionName: 'submit-score',
    functionArgs: [
      '0x0d0000000d617374726f5f626c6173746572',
      '0x0100000000000000000000000000000000',
      '0x01000000000000000000000000000007d3',
      '0x0d000000034a494d'
    ],
    network: 'mainnet',
    postConditionMode: 2,
    postConditionVariants: [[{
      type: 'stx',
      address: 'SP10W2EEM757922QTVDZZ5CSEW55JEFNN30J69TM7',
      amount: '30000',
      condition: 'less_equal'
    }]],
    enableCallV2Fallback: false,
    enableTransactionRequestFallback: false
  }, 'window.XverseProviders.BitcoinProvider');

  assert.equal(txResult?.txId, '0xdiag-token', 'transactionRequest submit should succeed with compatible token payload.');
}

async function main(){
  const api = loadHighScores();
  const suites = [
    ['serialize-stx-post-condition', runSerializePostConditionTest],
    ['contract-call-variants', runContractCallVariantTest],
    ['rpc-request-compatibility', runRequestMethodCompatibilityTest],
    ['transaction-request-compatibility', runTransactionRequestCompatibilityTest]
  ];

  let failed = 0;
  for(const [name, fn] of suites){
    try{
      await fn(api);
      console.log(`[arcade-wallet:diag] PASS ${name}`);
    } catch (error){
      failed += 1;
      console.error(`[arcade-wallet:diag] FAIL ${name}`);
      console.error(error);
    }
  }

  if(failed > 0){
    console.error(`[arcade-wallet:diag] ${failed} suite(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log(`[arcade-wallet:diag] ${suites.length} suite(s) passed`);
}

main();
