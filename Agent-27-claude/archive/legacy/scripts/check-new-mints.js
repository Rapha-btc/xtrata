
const { callReadOnlyFunction, uintCV, cvToJSON } = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';

const network = new StacksMainnet();

async function readOnly(functionName, functionArgs = []) {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName,
    functionArgs,
    senderAddress: CONTRACT_ADDRESS,
    network
  });
  return cvToJSON(result);
}

async function main() {
  for (let id = 153; id <= 160; id++) {
    const meta = await readOnly('get-inscription-meta', [uintCV(BigInt(id))]);
    const deps = await readOnly('get-dependencies', [uintCV(BigInt(id))]);
    console.log(`Token #${id}:`, JSON.stringify(meta?.value?.value, null, 2));
    console.log(`  Deps:`, JSON.stringify(deps?.value, null, 2));
  }
}

main();
