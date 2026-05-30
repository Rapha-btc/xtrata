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

export type ReconstructionErrorCode =
  | 'metadata-not-found'
  | 'unsealed'
  | 'missing-chunk'
  | 'short-content'
  | 'unsafe-chunk-count'
  | 'unsafe-total-size'
  | 'terminal-read-error';

export type ReconstructionReadMode = 'none' | 'single' | 'batch' | 'mixed';

export type ReconstructionReadError = {
  sourceId: string | null;
  operation: 'meta' | 'token-uri' | 'dependencies' | 'chunk' | 'chunk-batch';
  index?: bigint;
  indexes?: bigint[];
  message: string;
};

export type ReconstructionDiagnostics = {
  requestedSourceId: string | null;
  metaSourceId: string | null;
  chunkSourceId: string | null;
  fallbackUsed: boolean;
  readMode: ReconstructionReadMode;
  batchReads: number;
  singleReads: number;
  batchFallbacks: number;
  missingChunks: bigint[];
  errors: ReconstructionReadError[];
};

const createDiagnostics = (requestedSourceId: string | null): ReconstructionDiagnostics => ({
  requestedSourceId,
  metaSourceId: null,
  chunkSourceId: null,
  fallbackUsed: false,
  readMode: 'none',
  batchReads: 0,
  singleReads: 0,
  batchFallbacks: 0,
  missingChunks: [],
  errors: []
});

const updateReadMode = (diagnostics: ReconstructionDiagnostics) => {
  if (diagnostics.batchReads > 0 && diagnostics.singleReads > 0) {
    diagnostics.readMode = 'mixed';
  } else if (diagnostics.batchReads > 0) {
    diagnostics.readMode = 'batch';
  } else if (diagnostics.singleReads > 0) {
    diagnostics.readMode = 'single';
  } else {
    diagnostics.readMode = 'none';
  }
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const isCostBalanceExceededMessage = (message: string) =>
  message.toLowerCase().includes('costbalanceexceeded');

export class ReconstructionContentError extends Error {
  code: ReconstructionErrorCode;
  diagnostics?: ReconstructionDiagnostics;

  constructor(
    code: ReconstructionErrorCode,
    message: string,
    diagnostics?: ReconstructionDiagnostics
  ) {
    super(message);
    this.name = 'ReconstructionContentError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export class ReconstructionVerificationError extends Error {
  verification: VerificationResult;
  diagnostics?: ReconstructionDiagnostics;

  constructor(verification: VerificationResult, diagnostics?: ReconstructionDiagnostics) {
    super(
      `Reconstructed payload verification failed (${verification.reason ?? 'hash-mismatch'}): expected ${verification.expectedHashHex}, got ${verification.actualHashHex}`
    );
    this.name = 'ReconstructionVerificationError';
    this.verification = verification;
    this.diagnostics = diagnostics;
  }
}

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

export const assertVerified = (verification: VerificationResult) => {
  if (!verification.ok) {
    throw new ReconstructionVerificationError(verification);
  }
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
  owner?: string | null;
  creator?: string | null;
  mimeType?: string | null;
  totalSize: bigint;
  totalChunks?: bigint | null;
  sealed?: boolean | null;
  finalHash: Uint8Array;
};

export type ReconstructionReaders = DependencyReaders & {
  getInscriptionMeta: (tokenId: bigint) => Promise<ReconstructionMeta | null>;
  getChunk: (tokenId: bigint, index: bigint) => Promise<Uint8Array | null>;
  getChunkBatch?: (tokenId: bigint, indexes: bigint[]) => Promise<(Uint8Array | null)[]>;
  getTokenUri?: (tokenId: bigint) => Promise<string | null>;
};

export type ReconstructionSource = {
  sourceId?: string | null;
  readers: ReconstructionReaders;
};

export type ReconstructionResult = {
  tokenId: bigint;
  mimeType: string | null;
  tokenUri: string | null;
  bytes: Uint8Array;
  chunkCount: bigint;
  dependencies: DependencyGraph;
  verification: VerificationResult;
  diagnostics: ReconstructionDiagnostics;
};

export type ReconstructionFetchOptions = {
  batchSize?: number;
  concurrency?: number;
  preferBatch?: boolean;
  isTerminalReadError?: (error: unknown) => boolean;
};

export type ReconstructInscriptionOptions = ResolveDependenciesOptions &
  ReconstructionFetchOptions & {
    strict?: boolean;
    sourceId?: string | null;
  };

const resolveTotalChunks = (meta: ReconstructionMeta, chunkSize = CHUNK_SIZE) => {
  if (
    meta.totalChunks !== undefined &&
    meta.totalChunks !== null &&
    (meta.totalChunks > 0n || meta.totalSize <= 0n)
  ) {
    return meta.totalChunks;
  }
  if (meta.totalSize <= 0n) {
    return 0n;
  }
  const size = BigInt(chunkSize);
  return (meta.totalSize + size - 1n) / size;
};

const safeNumberFromBigInt = (
  value: bigint,
  code: 'unsafe-chunk-count' | 'unsafe-total-size',
  label: string,
  diagnostics: ReconstructionDiagnostics
) => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ReconstructionContentError(
      code,
      `${label} is not safely representable in JavaScript.`,
      diagnostics
    );
  }
  return Number(value);
};

const sourceIdOf = (source: ReconstructionSource) => source.sourceId ?? null;

const recordReadError = (
  diagnostics: ReconstructionDiagnostics,
  error: ReconstructionReadError
) => {
  diagnostics.errors.push(error);
};

const asTerminalReadError = (
  error: unknown,
  diagnostics: ReconstructionDiagnostics,
  options?: ReconstructionFetchOptions
) => {
  if (error instanceof ReconstructionContentError && error.code === 'terminal-read-error') {
    return error;
  }
  return options?.isTerminalReadError?.(error)
    ? new ReconstructionContentError('terminal-read-error', errorMessage(error), diagnostics)
    : null;
};

const readSingleChunk = async (params: {
  source: ReconstructionSource;
  tokenId: bigint;
  index: bigint;
  diagnostics: ReconstructionDiagnostics;
  options?: ReconstructionFetchOptions;
}) => {
  params.diagnostics.singleReads += 1;
  updateReadMode(params.diagnostics);
  try {
    return await params.source.readers.getChunk(params.tokenId, params.index);
  } catch (error) {
    recordReadError(params.diagnostics, {
      sourceId: sourceIdOf(params.source),
      operation: 'chunk',
      index: params.index,
      message: errorMessage(error)
    });
    const terminalError = asTerminalReadError(error, params.diagnostics, params.options);
    if (terminalError) {
      throw terminalError;
    }
    return null;
  }
};

const normalizeBatchSize = (batchSize: number | undefined) => {
  if (batchSize === undefined) {
    return 50;
  }
  if (!Number.isFinite(batchSize)) {
    return 50;
  }
  return Math.max(1, Math.min(50, Math.floor(batchSize)));
};

const normalizeConcurrency = (concurrency: number | undefined, total: number) => {
  if (total <= 1) {
    return 1;
  }
  if (concurrency === undefined || !Number.isFinite(concurrency)) {
    return 1;
  }
  return Math.max(1, Math.min(total, Math.floor(concurrency)));
};

const runWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) => {
  if (items.length === 0) {
    return;
  }
  const workerCount = normalizeConcurrency(concurrency, items.length);
  let cursor = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) {
        return;
      }
      await worker(items[current]);
    }
  });
  await Promise.all(workers);
};

const readChunksFromSource = async (params: {
  source: ReconstructionSource;
  tokenId: bigint;
  totalChunks: bigint;
  diagnostics: ReconstructionDiagnostics;
  preloadedChunks?: Map<string, Uint8Array>;
  options?: ReconstructionFetchOptions;
}) => {
  const total = safeNumberFromBigInt(
    params.totalChunks,
    'unsafe-chunk-count',
    'Chunk count',
    params.diagnostics
  );
  const chunksByIndex = new Map<string, Uint8Array>(params.preloadedChunks);
  const allIndexes = Array.from({ length: total }, (_entry, index) => BigInt(index));
  const batchSize = normalizeBatchSize(params.options?.batchSize);
  const concurrency = normalizeConcurrency(params.options?.concurrency, total);
  const preferBatch = params.options?.preferBatch !== false;
  let terminalReadError: ReconstructionContentError | null = null;

  const throwIfTerminalReadFailed = () => {
    if (terminalReadError) {
      throw terminalReadError;
    }
  };

  const readSingles = async (indexes: bigint[]) => {
    await runWithConcurrency(indexes, concurrency, async (index) => {
      throwIfTerminalReadFailed();
      if (chunksByIndex.has(index.toString())) {
        return;
      }
      let chunk: Uint8Array | null;
      try {
        chunk = await readSingleChunk({
          source: params.source,
          tokenId: params.tokenId,
          index,
          diagnostics: params.diagnostics,
          options: params.options
        });
      } catch (error) {
        terminalReadError = asTerminalReadError(error, params.diagnostics, params.options);
        throw error;
      }
      if (chunk && chunk.length > 0) {
        chunksByIndex.set(index.toString(), chunk);
      }
    });
  };

  const readBatch = async (indexes: bigint[]): Promise<void> => {
    throwIfTerminalReadFailed();
    const pendingIndexes = indexes.filter((index) => !chunksByIndex.has(index.toString()));
    if (pendingIndexes.length === 0) {
      return;
    }

    if (!preferBatch || !params.source.readers.getChunkBatch) {
      await readSingles(pendingIndexes);
      return;
    }

    try {
      params.diagnostics.batchReads += 1;
      updateReadMode(params.diagnostics);
      const batch = await params.source.readers.getChunkBatch(params.tokenId, pendingIndexes);
      if (batch.length !== pendingIndexes.length) {
        throw new Error(
          `Batch result length ${batch.length.toString()} did not match request length ${pendingIndexes.length.toString()}.`
        );
      }

      const missingIndexes: bigint[] = [];
      batch.forEach((chunk, index) => {
        const chunkIndex = pendingIndexes[index];
        if (chunk && chunk.length > 0) {
          chunksByIndex.set(chunkIndex.toString(), chunk);
        } else {
          missingIndexes.push(chunkIndex);
        }
      });

      if (missingIndexes.length > 0) {
        params.diagnostics.batchFallbacks += 1;
        await readSingles(missingIndexes);
      }
    } catch (error) {
      const message = errorMessage(error);
      recordReadError(params.diagnostics, {
        sourceId: sourceIdOf(params.source),
        operation: 'chunk-batch',
        indexes: [...pendingIndexes],
        message
      });
      const terminalError = asTerminalReadError(error, params.diagnostics, params.options);
      if (terminalError) {
        terminalReadError = terminalError;
        throw terminalError;
      }
      params.diagnostics.batchFallbacks += 1;

      if (pendingIndexes.length === 1 || !isCostBalanceExceededMessage(message)) {
        await readSingles(pendingIndexes);
        return;
      }

      const midpoint = Math.ceil(pendingIndexes.length / 2);
      await readBatch(pendingIndexes.slice(0, midpoint));
      await readBatch(pendingIndexes.slice(midpoint));
    }
  };

  const batches: bigint[][] = [];
  const fetchIndexes = allIndexes.filter((index) => !chunksByIndex.has(index.toString()));
  for (let index = 0; index < fetchIndexes.length; index += batchSize) {
    batches.push(fetchIndexes.slice(index, index + batchSize));
  }
  await runWithConcurrency(batches, concurrency, readBatch);

  const chunks: Uint8Array[] = [];
  const missingChunks: bigint[] = [];
  for (const index of allIndexes) {
    const chunk = chunksByIndex.get(index.toString());
    if (!chunk) {
      missingChunks.push(index);
    } else {
      chunks.push(chunk);
    }
  }

  if (missingChunks.length > 0) {
    params.diagnostics.missingChunks.push(...missingChunks);
    throw new ReconstructionContentError(
      'missing-chunk',
      `Missing chunk ${missingChunks.map((index) => index.toString()).join(', ')}`,
      params.diagnostics
    );
  }

  return chunks;
};

const readMetaFromSources = async (params: {
  tokenId: bigint;
  sources: ReconstructionSource[];
  diagnostics: ReconstructionDiagnostics;
  options?: ReconstructionFetchOptions;
}) => {
  for (const source of params.sources) {
    try {
      const meta = await source.readers.getInscriptionMeta(params.tokenId);
      if (meta) {
        params.diagnostics.metaSourceId = sourceIdOf(source);
        params.diagnostics.fallbackUsed =
          params.diagnostics.metaSourceId !== params.diagnostics.requestedSourceId;
        return { source, meta };
      }
    } catch (error) {
      recordReadError(params.diagnostics, {
        sourceId: sourceIdOf(source),
        operation: 'meta',
        message: errorMessage(error)
      });
      const terminalError = asTerminalReadError(error, params.diagnostics, params.options);
      if (terminalError) {
        throw terminalError;
      }
    }
  }

  throw new ReconstructionContentError(
    'metadata-not-found',
    `Inscription meta not found for token ${params.tokenId.toString()}`,
    params.diagnostics
  );
};

const readFirstChunkFromSource = async (params: {
  source: ReconstructionSource;
  tokenId: bigint;
  diagnostics: ReconstructionDiagnostics;
  options?: ReconstructionFetchOptions;
}) => {
  const chunk = await readSingleChunk({
    source: params.source,
    tokenId: params.tokenId,
    index: 0n,
    diagnostics: params.diagnostics,
    options: params.options
  });
  return chunk && chunk.length > 0 ? chunk : null;
};

const selectChunkSource = async (params: {
  tokenId: bigint;
  metaSource: ReconstructionSource;
  sources: ReconstructionSource[];
  totalChunks: bigint;
  diagnostics: ReconstructionDiagnostics;
  options?: ReconstructionFetchOptions;
}) => {
  if (params.totalChunks === 0n) {
    params.diagnostics.chunkSourceId = sourceIdOf(params.metaSource);
    return {
      source: params.metaSource,
      preloadedChunks: new Map<string, Uint8Array>()
    };
  }

  const orderedSources = [
    params.metaSource,
    ...params.sources.filter((source) => source !== params.metaSource)
  ];

  for (const source of orderedSources) {
    const firstChunk = await readFirstChunkFromSource({
      source,
      tokenId: params.tokenId,
      diagnostics: params.diagnostics,
      options: params.options
    });
    if (firstChunk) {
      const chunkSourceId = sourceIdOf(source);
      params.diagnostics.chunkSourceId = chunkSourceId;
      params.diagnostics.fallbackUsed =
        params.diagnostics.fallbackUsed || chunkSourceId !== params.diagnostics.requestedSourceId;
      return {
        source,
        preloadedChunks: new Map<string, Uint8Array>([['0', firstChunk]])
      };
    }
  }

  params.diagnostics.missingChunks.push(0n);
  throw new ReconstructionContentError('missing-chunk', 'Missing chunk 0', params.diagnostics);
};

const readTokenUri = async (params: {
  tokenId: bigint;
  source: ReconstructionSource;
  diagnostics: ReconstructionDiagnostics;
  options?: ReconstructionFetchOptions;
}) => {
  if (!params.source.readers.getTokenUri) {
    return null;
  }
  try {
    return await params.source.readers.getTokenUri(params.tokenId);
  } catch (error) {
    recordReadError(params.diagnostics, {
      sourceId: sourceIdOf(params.source),
      operation: 'token-uri',
      message: errorMessage(error)
    });
    const terminalError = asTerminalReadError(error, params.diagnostics, params.options);
    if (terminalError) {
      throw terminalError;
    }
    return null;
  }
};

const createDependencyReaders = (
  source: ReconstructionSource,
  diagnostics: ReconstructionDiagnostics
): DependencyReaders => ({
  getDependencies: async (tokenId) => {
    try {
      return await source.readers.getDependencies(tokenId);
    } catch (error) {
      recordReadError(diagnostics, {
        sourceId: sourceIdOf(source),
        operation: 'dependencies',
        message: errorMessage(error)
      });
      throw error;
    }
  }
});

const verificationForPayload = (params: {
  bytes: Uint8Array;
  meta: ReconstructionMeta;
  expectedSize: number;
}) => {
  const verification = verifyPayload(params.bytes, params.meta.finalHash);
  if (params.bytes.length < params.expectedSize) {
    return {
      ...verification,
      ok: false,
      reason: 'short-content'
    };
  }
  return verification;
};

export type ReconstructXtrataInscriptionOptions = ResolveDependenciesOptions &
  ReconstructionFetchOptions & {
    tokenId: bigint;
    sources: ReconstructionSource[];
    strict?: boolean;
  };

export const reconstructXtrataInscription = async (
  options: ReconstructXtrataInscriptionOptions
): Promise<ReconstructionResult> => {
  if (options.sources.length === 0) {
    throw new ReconstructionContentError(
      'metadata-not-found',
      'At least one reconstruction source is required.'
    );
  }

  const diagnostics = createDiagnostics(sourceIdOf(options.sources[0]));
  const { source: metaSource, meta } = await readMetaFromSources({
    tokenId: options.tokenId,
    sources: options.sources,
    diagnostics,
    options
  });

  if (options.strict && meta.sealed === false) {
    throw new ReconstructionContentError(
      'unsealed',
      `Inscription ${options.tokenId.toString()} is not sealed.`,
      diagnostics
    );
  }

  const totalChunks = resolveTotalChunks(meta);
  const expectedSize = safeNumberFromBigInt(
    meta.totalSize,
    'unsafe-total-size',
    'Total size',
    diagnostics
  );
  const { source: chunkSource, preloadedChunks } = await selectChunkSource({
    tokenId: options.tokenId,
    metaSource,
    sources: options.sources,
    totalChunks,
    diagnostics,
    options
  });

  const chunks = await readChunksFromSource({
    source: chunkSource,
    tokenId: options.tokenId,
    totalChunks,
    diagnostics,
    preloadedChunks,
    options
  });
  const bytes = assembleChunks(chunks);
  const normalizedBytes = bytes.length > expectedSize ? bytes.slice(0, expectedSize) : bytes;

  const verification = verificationForPayload({
    bytes: normalizedBytes,
    meta,
    expectedSize
  });
  if (options.strict && !verification.ok) {
    throw new ReconstructionVerificationError(verification, diagnostics);
  }
  const dependencies = await resolveDependencies(
    options.tokenId,
    createDependencyReaders(metaSource, diagnostics),
    options
  );
  const tokenUri = await readTokenUri({
    tokenId: options.tokenId,
    source: metaSource,
    diagnostics,
    options
  });

  return {
    tokenId: options.tokenId,
    mimeType: meta.mimeType ?? null,
    tokenUri,
    bytes: normalizedBytes,
    chunkCount: totalChunks,
    dependencies,
    verification,
    diagnostics
  };
};

export const reconstructInscription = async (
  tokenId: bigint,
  readers: ReconstructionReaders,
  options?: ReconstructInscriptionOptions
): Promise<ReconstructionResult> =>
  reconstructXtrataInscription({
    tokenId,
    sources: [
      {
        sourceId: options?.sourceId ?? null,
        readers
      }
    ],
    strict: options?.strict,
    maxNodes: options?.maxNodes,
    batchSize: options?.batchSize,
    concurrency: options?.concurrency,
    preferBatch: options?.preferBatch,
    isTerminalReadError: options?.isTerminalReadError
  });
