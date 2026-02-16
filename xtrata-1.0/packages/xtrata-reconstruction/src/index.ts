import { sha256 } from '@noble/hashes/sha256';

export const CHUNK_SIZE = 16_384;
export const EMPTY_HASH = new Uint8Array(32);

const concatBytes = (left: Uint8Array, right: Uint8Array) => {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
};

export const chunkBytes = (data: Uint8Array, chunkSize = CHUNK_SIZE) => {
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be greater than zero');
  }

  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    chunks.push(data.slice(offset, offset + chunkSize));
  }
  return chunks;
};

export const assembleChunks = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
};

export const computeExpectedHash = (chunks: Uint8Array[]) => {
  let runningHash = EMPTY_HASH;
  for (const chunk of chunks) {
    runningHash = new Uint8Array(sha256(concatBytes(runningHash, chunk)));
  }
  return runningHash;
};

export type VerificationResult = {
  ok: boolean;
  expectedHashHex: string;
  actualHashHex: string;
  reason: string | null;
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');

export const verifyPayload = (
  bytes: Uint8Array,
  expectedHash: Uint8Array,
  chunkSize = CHUNK_SIZE
): VerificationResult => {
  const chunks = chunkBytes(bytes, chunkSize);
  const actual = computeExpectedHash(chunks);
  const expectedHex = toHex(expectedHash);
  const actualHex = toHex(actual);
  return {
    ok: expectedHex === actualHex,
    expectedHashHex: expectedHex,
    actualHashHex: actualHex,
    reason: expectedHex === actualHex ? null : 'hash-mismatch'
  };
};

export type DependencyGraph = {
  root: bigint;
  edges: Array<{ from: bigint; to: bigint }>;
  nodes: bigint[];
  truncated: boolean;
};

export type DependencyReaders = {
  getDependencies: (tokenId: bigint) => Promise<bigint[]>;
};

export type ResolveDependenciesOptions = {
  maxNodes?: number;
};

export const resolveDependencies = async (
  tokenId: bigint,
  readers: DependencyReaders,
  options?: ResolveDependenciesOptions
): Promise<DependencyGraph> => {
  const maxNodes = Math.max(1, options?.maxNodes ?? 512);
  const queue: bigint[] = [tokenId];
  const seen = new Set<string>();
  const nodes: bigint[] = [];
  const edges: Array<{ from: bigint; to: bigint }> = [];
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift() as bigint;
    const key = current.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    nodes.push(current);

    if (nodes.length >= maxNodes) {
      truncated = true;
      break;
    }

    const dependencies = await readers.getDependencies(current);
    for (const dep of dependencies) {
      edges.push({ from: current, to: dep });
      const depKey = dep.toString();
      if (!seen.has(depKey)) {
        queue.push(dep);
      }
    }
  }

  return {
    root: tokenId,
    edges,
    nodes,
    truncated
  };
};

export type ReconstructionMeta = {
  mimeType?: string | null;
  totalSize: bigint;
  totalChunks?: bigint | null;
  finalHash: Uint8Array;
};

export type ReconstructionReaders = DependencyReaders & {
  getInscriptionMeta: (tokenId: bigint) => Promise<ReconstructionMeta | null>;
  getChunk: (tokenId: bigint, index: bigint) => Promise<Uint8Array | null>;
  getTokenUri?: (tokenId: bigint) => Promise<string | null>;
};

export type ReconstructionResult = {
  tokenId: bigint;
  mimeType: string | null;
  tokenUri: string | null;
  bytes: Uint8Array;
  chunkCount: bigint;
  dependencies: DependencyGraph;
  verification: VerificationResult;
};

const resolveTotalChunks = (meta: ReconstructionMeta, chunkSize = CHUNK_SIZE) => {
  if (meta.totalChunks !== undefined && meta.totalChunks !== null && meta.totalChunks >= 0n) {
    return meta.totalChunks;
  }
  if (meta.totalSize <= 0n) {
    return 0n;
  }
  const size = BigInt(chunkSize);
  return (meta.totalSize + size - 1n) / size;
};

const fetchChunks = async (params: {
  tokenId: bigint;
  totalChunks: bigint;
  getChunk: (tokenId: bigint, index: bigint) => Promise<Uint8Array | null>;
}) => {
  const total = Number(params.totalChunks);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error('Chunk count is not safely representable in JavaScript.');
  }
  const chunks: Uint8Array[] = [];
  for (let index = 0; index < total; index += 1) {
    const chunk = await params.getChunk(params.tokenId, BigInt(index));
    if (!chunk) {
      throw new Error(`Missing chunk ${index.toString()}`);
    }
    chunks.push(chunk);
  }
  return chunks;
};

export const reconstructInscription = async (
  tokenId: bigint,
  readers: ReconstructionReaders,
  options?: ResolveDependenciesOptions
): Promise<ReconstructionResult> => {
  const meta = await readers.getInscriptionMeta(tokenId);
  if (!meta) {
    throw new Error(`Inscription meta not found for token ${tokenId.toString()}`);
  }

  const totalChunks = resolveTotalChunks(meta);
  const chunks = await fetchChunks({
    tokenId,
    totalChunks,
    getChunk: readers.getChunk
  });
  const bytes = assembleChunks(chunks);
  const expectedSize = Number(meta.totalSize);
  const normalizedBytes =
    Number.isSafeInteger(expectedSize) && expectedSize >= 0 && bytes.length > expectedSize
      ? bytes.slice(0, expectedSize)
      : bytes;

  const verification = verifyPayload(normalizedBytes, meta.finalHash);
  const dependencies = await resolveDependencies(tokenId, readers, options);
  const tokenUri = readers.getTokenUri ? await readers.getTokenUri(tokenId) : null;

  return {
    tokenId,
    mimeType: meta.mimeType ?? null,
    tokenUri,
    bytes: normalizedBytes,
    chunkCount: totalChunks,
    dependencies,
    verification
  };
};
