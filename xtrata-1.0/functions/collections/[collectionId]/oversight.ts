import { badRequest, jsonResponse, notFound, serverError } from '../../lib/utils';
import { queryAll, type Env } from '../../lib/db';

type DbRow = Record<string, unknown>;

type StateCount = {
  state: string;
  total: number;
};

type R2ListObject = {
  key: string;
  size: number;
};

type R2ListResult = {
  objects: R2ListObject[];
  truncated: boolean;
  cursor?: string;
};

type R2BucketWithList = R2Bucket & {
  list: (options: { prefix: string; cursor?: string }) => Promise<R2ListResult>;
};

type BucketStats = {
  available: boolean;
  binding: string | null;
  prefix: string;
  objectCount: number;
  totalBytes: number;
  scannedAll: boolean;
  sampleKeys: string[];
  keys: string[];
  error: string | null;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableString = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseMetadata = (value: unknown) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toStateMap = (rows: DbRow[]) =>
  rows.reduce<Record<string, number>>((accumulator, row) => {
    const state = toNullableString(row.state) ?? 'unknown';
    const total = toNumber(row.total);
    accumulator[state] = total;
    return accumulator;
  }, {});

const resolveAssetsBucket = (env: Env) => {
  const candidates: Array<{ key: string; bucket: unknown }> = [
    { key: 'COLLECTION_ASSETS', bucket: env.COLLECTION_ASSETS },
    { key: 'ASSETS', bucket: env.ASSETS },
    { key: 'R2', bucket: env.R2 }
  ];
  const active =
    candidates.find(
      (candidate) =>
        candidate.bucket &&
        typeof (candidate.bucket as { list?: unknown }).list === 'function'
    ) ?? null;

  return {
    binding: active?.key ?? null,
    bucket: (active?.bucket as R2BucketWithList | undefined) ?? null
  };
};

const listBucketStats = async (
  bucket: R2BucketWithList,
  prefix: string
): Promise<BucketStats> => {
  const MAX_PAGES = 24;
  const MAX_SAMPLE_KEYS = 8;

  const keys: string[] = [];
  const sampleKeys: string[] = [];
  let objectCount = 0;
  let totalBytes = 0;
  let scannedPages = 0;
  let cursor: string | undefined;
  let truncated = false;

  do {
    scannedPages += 1;
    const page = await bucket.list(
      cursor ? { prefix, cursor } : { prefix }
    );

    for (const object of page.objects) {
      objectCount += 1;
      totalBytes += object.size ?? 0;
      keys.push(object.key);
      if (sampleKeys.length < MAX_SAMPLE_KEYS) {
        sampleKeys.push(object.key);
      }
    }

    cursor = page.cursor || undefined;
    truncated = Boolean(page.truncated);
  } while (truncated && cursor && scannedPages < MAX_PAGES);

  return {
    available: true,
    binding: null,
    prefix,
    objectCount,
    totalBytes,
    scannedAll: !truncated,
    sampleKeys,
    keys,
    error: null
  };
};

const emptyBucketStats = (prefix: string): BucketStats => ({
  available: false,
  binding: null,
  prefix,
  objectCount: 0,
  totalBytes: 0,
  scannedAll: true,
  sampleKeys: [],
  keys: [],
  error: null
});

const mapStateCounts = (rows: DbRow[]) =>
  rows.map<StateCount>((row) => ({
    state: toNullableString(row.state) ?? 'unknown',
    total: toNumber(row.total)
  }));

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const collectionId = toNullableString(params?.collectionId);
  if (!collectionId) {
    return badRequest('Collection id missing.');
  }

  try {
    const collectionResult = await queryAll(
      env,
      'SELECT * FROM collections WHERE id = ?',
      [collectionId]
    );
    const collection = (collectionResult.results?.[0] as DbRow | undefined) ?? null;
    if (!collection) {
      return notFound('Collection not found.');
    }

    const metadata = parseMetadata(collection.metadata);
    const deployTxId = toNullableString(metadata?.deployTxId);
    const deployAt = toNullableString(metadata?.deployedAt);

    const assetTotalsResult = await queryAll(
      env,
      `SELECT
         COUNT(*) as total,
         COALESCE(SUM(total_bytes), 0) as total_bytes,
         COALESCE(SUM(total_chunks), 0) as total_chunks,
         COALESCE(SUM(CASE WHEN state NOT IN ('expired', 'sold-out') THEN total_bytes ELSE 0 END), 0) as active_bytes,
         COALESCE(SUM(CASE WHEN state NOT IN ('expired', 'sold-out') THEN 1 ELSE 0 END), 0) as active_assets
       FROM assets
       WHERE collection_id = ?`,
      [collectionId]
    );
    const assetStateRows = await queryAll(
      env,
      'SELECT state, COUNT(*) as total FROM assets WHERE collection_id = ? GROUP BY state',
      [collectionId]
    );
    const assetKeysRows = await queryAll(
      env,
      `SELECT storage_key
       FROM assets
       WHERE collection_id = ?
         AND storage_key IS NOT NULL
         AND TRIM(storage_key) != ''`,
      [collectionId]
    );

    const reservationTotalsResult = await queryAll(
      env,
      'SELECT COUNT(*) as total FROM reservations WHERE collection_id = ?',
      [collectionId]
    );
    const reservationStateRows = await queryAll(
      env,
      'SELECT status as state, COUNT(*) as total FROM reservations WHERE collection_id = ? GROUP BY status',
      [collectionId]
    );

    const bucketPrefix = `${collectionId}/`;
    const { bucket, binding } = resolveAssetsBucket(env);
    let bucketStats = emptyBucketStats(bucketPrefix);
    bucketStats.binding = binding;

    if (bucket) {
      try {
        const listed = await listBucketStats(bucket, bucketPrefix);
        bucketStats = {
          ...listed,
          binding
        };
      } catch (error) {
        bucketStats = {
          ...bucketStats,
          available: true,
          error: error instanceof Error ? error.message : 'Bucket list failed'
        };
      }
    }

    const dbStorageKeys = new Set(
      (assetKeysRows.results ?? [])
        .map((row) => toNullableString((row as DbRow).storage_key))
        .filter((value): value is string => value !== null)
    );
    const bucketKeys = new Set(bucketStats.keys);

    const dbKeysMissingInBucket = Array.from(dbStorageKeys).filter(
      (key) => !bucketKeys.has(key)
    );
    const bucketKeysMissingInDb = Array.from(bucketKeys).filter(
      (key) => !dbStorageKeys.has(key)
    );

    return jsonResponse({
      collection: {
        id: collection.id,
        slug: collection.slug,
        artistAddress: collection.artist_address,
        contractAddress: collection.contract_address,
        displayName: collection.display_name,
        state: collection.state,
        createdAt: toNumber(collection.created_at),
        updatedAt: toNumber(collection.updated_at)
      },
      deploy: {
        txId: deployTxId,
        deployedAt: deployAt,
        contractName: toNullableString(metadata?.contractName),
        coreContractId: toNullableString(metadata?.coreContractId)
      },
      settingsPreview: {
        mintType: toNullableString(metadata?.mintType),
        templateVersion: toNullableString(metadata?.templateVersion),
        collection: metadata?.collection ?? null,
        hardcodedDefaults: metadata?.hardcodedDefaults ?? null
      },
      db: {
        assets: {
          total: toNumber(assetTotalsResult.results?.[0]?.total),
          active: toNumber(assetTotalsResult.results?.[0]?.active_assets),
          totalBytes: toNumber(assetTotalsResult.results?.[0]?.total_bytes),
          activeBytes: toNumber(assetTotalsResult.results?.[0]?.active_bytes),
          totalChunks: toNumber(assetTotalsResult.results?.[0]?.total_chunks),
          byState: toStateMap((assetStateRows.results ?? []) as DbRow[]),
          states: mapStateCounts((assetStateRows.results ?? []) as DbRow[])
        },
        reservations: {
          total: toNumber(reservationTotalsResult.results?.[0]?.total),
          byState: toStateMap((reservationStateRows.results ?? []) as DbRow[]),
          states: mapStateCounts((reservationStateRows.results ?? []) as DbRow[])
        },
        storageKeysTracked: dbStorageKeys.size
      },
      bucket: {
        available: bucketStats.available,
        binding: bucketStats.binding,
        prefix: bucketStats.prefix,
        objectCount: bucketStats.objectCount,
        totalBytes: bucketStats.totalBytes,
        scannedAll: bucketStats.scannedAll,
        sampleKeys: bucketStats.sampleKeys,
        error: bucketStats.error
      },
      consistency: {
        dbKeysMissingInBucket: dbKeysMissingInBucket.length,
        bucketKeysMissingInDb: bucketKeysMissingInDb.length,
        sampleDbKeysMissingInBucket: dbKeysMissingInBucket.slice(0, 5),
        sampleBucketKeysMissingInDb: bucketKeysMissingInDb.slice(0, 5)
      }
    });
  } catch (error) {
    return serverError(
      error instanceof Error ? error.message : 'Failed to build collection oversight'
    );
  }
};
