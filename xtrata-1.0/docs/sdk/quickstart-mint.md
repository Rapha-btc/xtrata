# SDK Quickstart: Mint Flow

Use call builders and post-condition helpers for deterministic mint transaction construction.

```ts
import {
  buildBeginInscriptionCall,
  buildAddChunkBatchCall,
  buildSealInscriptionCall,
  buildMintBeginStxPostConditions,
  buildSealStxPostConditions,
  chunkBytes,
  computeExpectedHash,
  toStacksNetwork
} from '@xtrata/sdk';

const contract = {
  address: 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X',
  contractName: 'xtrata-v2-1-0',
  network: 'mainnet' as const
};

const network = toStacksNetwork(contract.network);
const bytes = new TextEncoder().encode('hello');
const chunks = chunkBytes(bytes);
const expectedHash = computeExpectedHash(chunks);

const beginCall = buildBeginInscriptionCall({
  contract,
  network,
  expectedHash,
  mime: 'text/plain',
  totalSize: BigInt(bytes.length),
  totalChunks: BigInt(chunks.length)
});

const beginPostConditions = buildMintBeginStxPostConditions({
  sender: 'SP...WALLET',
  mintPrice: 1_000_000n
});

const chunkCall = buildAddChunkBatchCall({
  contract,
  network,
  expectedHash,
  chunks
});

const sealCall = buildSealInscriptionCall({
  contract,
  network,
  expectedHash,
  tokenUri: 'ipfs://...'
});

const sealPostConditions = buildSealStxPostConditions({
  sender: 'SP...WALLET',
  protocolFeeMicroStx: 100_000n,
  totalChunks: chunks.length
});
```

Flow order remains:
1. `begin`
2. `add-chunk-batch` (one or more)
3. `seal`
