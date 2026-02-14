import { jsonResponse, serverError } from '../lib/utils';
import { queryAll } from '../lib/db';

const countRows = async (env: Record<string, unknown>, table: string) => {
  const result = await queryAll(
    env as any,
    `SELECT COUNT(*) AS total FROM ${table}`
  );
  return Number(result.results?.[0]?.total ?? 0);
};

export const onRequest: PagesFunction = async ({ env }) => {
  try {
    const collectionsCount = await countRows(env, 'collections');
    const assetsCount = await countRows(env, 'assets');
    const reservationsCount = await countRows(env, 'reservations');
    return jsonResponse({
      collectionsCount,
      assetsCount,
      reservationsCount,
      timestamp: Date.now()
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Health check failed');
  }
};
