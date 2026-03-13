
const { callReadOnlyFunction, uintCV, cvToJSON, listCV } = require('@stacks/transactions');
const { StacksMainnet } = require('@stacks/network');

const CONTRACT_ADDRESS = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X';
const CONTRACT_NAME = 'xtrata-v2-1-0';
const GENESIS_TOKEN = 107;
const START_ID = 152;
const END_ID = 161;

const network = new StacksMainnet();

async function readOnly(functionName, functionArgs = []) {
  try {
    const result = await callReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName,
      functionArgs,
      senderAddress: CONTRACT_ADDRESS,
      network
    });
    return cvToJSON(result);
  } catch (e) {
    return null;
  }
}

async function getDeps(tokenId) {
  const res = await readOnly('get-dependencies', [uintCV(BigInt(tokenId))]);
  return res?.value?.map(d => Number(d.value)) || [];
}

async function getContent(tokenId) {
  const metaJson = await readOnly('get-inscription-meta', [uintCV(BigInt(tokenId))]);
  if (!metaJson || !metaJson.value) return null;

  const totalChunks = parseInt(metaJson.value.value['total-chunks'].value);
  let allContent = '';

  for (let i = 0; i < totalChunks; i++) {
    const chunkJson = await readOnly('get-chunk', [uintCV(BigInt(tokenId)), uintCV(BigInt(i))]);
    if (chunkJson && chunkJson.value) {
      const hex = chunkJson.value.value.replace('0x', '');
      allContent += Buffer.from(hex, 'hex').toString('utf-8');
    }
  }
  return allContent;
}

async function main() {
  console.log(`Checking tokens ${START_ID} to ${END_ID} for dependencies on ${GENESIS_TOKEN}...`);
  const spine = [];

  for (let id = START_ID; id <= END_ID; id++) {
    const deps = await getDeps(id);
    if (deps.includes(GENESIS_TOKEN)) {
      console.log(`Token #${id} is a child of ${GENESIS_TOKEN}. Fetching state...`);
      const content = await getContent(id);
      if (content) {
        const match = content.match(/<script type="application\/agent27-state">([\s\S]*?)<\/script>/);
        if (match) {
          try {
            const state = JSON.parse(match[1]);
            spine.push({ id, state });
            console.log(`  Found state for #${id}: ${JSON.stringify(state)}`);
          } catch (e) {
            console.log(`  Failed to parse state for #${id}`);
          }
        } else {
          console.log(`  No state block found in #${id}`);
        }
      }
    }
  }

  console.log('\n--- MEMORY SPINE (NEW) ---');
  console.log(JSON.stringify(spine, null, 2));
}

main();
