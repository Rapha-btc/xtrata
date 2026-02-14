import { jsonResponse, serverError } from '../lib/utils';

const countRows = async (db: any, table: string) => {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error(
      'Missing DB binding. Configure D1 as binding `DB` for this Pages environment.'
    );
  }
  const statement = await db.prepare(`SELECT COUNT(*) AS total FROM ${table}`);
  const result = await statement.all();
  return Number(result.results?.[0]?.total ?? 0);
};

export const onRequest: PagesFunction = async ({ env }) => {
  try {
    const collectionsCount = await countRows(env.DB, 'collections');
    const assetsCount = await countRows(env.DB, 'assets');
    const reservationsCount = await countRows(env.DB, 'reservations');
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
