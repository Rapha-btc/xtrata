import { jsonResponse, serverError } from '../lib/utils';
import { queryAll } from '../lib/db';

const countRows = async (env: Record<string, unknown>, table: string) => {
  const result = await queryAll(
    env as any,
    `SELECT COUNT(*) AS total FROM ${table}`
  );
  return Number(result.results?.[0]?.total ?? 0);
};

type StorageBindingCapability = {
  key: 'COLLECTION_ASSETS' | 'ASSETS' | 'R2';
  present: boolean;
  supportsPut: boolean;
  supportsList: boolean;
  supportsSignedUrl: boolean;
};

type StorageHealth = {
  selectedBinding: string | null;
  capabilities: StorageBindingCapability[];
  availableBindings: string[];
};

const inspectStorageBindings = (env: Record<string, unknown>): StorageHealth => {
  const keys: Array<'COLLECTION_ASSETS' | 'ASSETS' | 'R2'> = [
    'COLLECTION_ASSETS',
    'ASSETS',
    'R2'
  ];

  const capabilities = keys.map<StorageBindingCapability>((key) => {
    const candidate = env[key] as
      | {
          put?: unknown;
          list?: unknown;
          getUploadUrl?: unknown;
        }
      | undefined;
    return {
      key,
      present: Boolean(candidate && typeof candidate === 'object'),
      supportsPut: Boolean(candidate && typeof candidate.put === 'function'),
      supportsList: Boolean(candidate && typeof candidate.list === 'function'),
      supportsSignedUrl: Boolean(
        candidate && typeof candidate.getUploadUrl === 'function'
      )
    };
  });

  const selected =
    capabilities.find((entry) => entry.supportsSignedUrl || entry.supportsPut) ?? null;

  return {
    selectedBinding: selected?.key ?? null,
    capabilities,
    availableBindings: Object.keys(env).sort()
  };
};

export const onRequest: PagesFunction = async ({ env }) => {
  const requestId = crypto.randomUUID();
  try {
    const collectionsCount = await countRows(env, 'collections');
    const assetsCount = await countRows(env, 'assets');
    const reservationsCount = await countRows(env, 'reservations');
    const storage = inspectStorageBindings(env as Record<string, unknown>);
    console.log(`[collections/health][${requestId}] ok`, {
      collectionsCount,
      assetsCount,
      reservationsCount,
      selectedBinding: storage.selectedBinding
    });
    return jsonResponse({
      collectionsCount,
      assetsCount,
      reservationsCount,
      timestamp: Date.now(),
      requestId,
      storage
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Health check failed';
    console.error(`[collections/health][${requestId}] error`, {
      message,
      stack: error instanceof Error ? error.stack ?? null : null
    });
    return serverError(`${message} (Request ID: ${requestId})`);
  }
};
