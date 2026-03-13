
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
  for (let id = 138; id <= 151; id++) {
    const deps = await readOnly('get-dependencies', [uintCV(BigInt(id))]);
    if (deps?.value && deps.value.some(d => d.value === "134")) {
      const meta = await readOnly('get-inscription-meta', [uintCV(BigInt(id))]);
      console.log(`Token #${id} depends on #134!`);
      console.log(`  Meta:`, JSON.stringify(meta?.value?.value, null, 2));
      console.log(`  Deps:`, JSON.stringify(deps?.value, null, 2));
    }
  }
}

main();
