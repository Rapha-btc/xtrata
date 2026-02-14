import { jsonResponse, badRequest, serverError } from '../../lib/utils';
import { queryAll, run } from '../../lib/db';

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest('Collection id missing.');
  }

  if (request.method === 'GET') {
    try {
      const result = await queryAll(
        env,
        'SELECT * FROM reservations WHERE collection_id = ? ORDER BY created_at DESC',
        [collectionId]
      );
      return jsonResponse(result.results ?? []);
    } catch (error) {
      return serverError(
        error instanceof Error ? error.message : 'Failed to load reservations'
      );
    }
  }

  if (request.method === 'POST') {
    try {
      const payload = (await request.json()) as Record<string, unknown>;
      if (!payload.assetId || !payload.buyerAddress || !payload.hashHex) {
        return badRequest('assetId, buyerAddress, and hashHex are required.');
      }
      const reservationId = crypto.randomUUID();
      const now = Date.now();
      const expiresAt = now + (payload.durationMs ? Number(payload.durationMs) : 1200000);
      await run(env,
        `INSERT INTO reservations (reservation_id, collection_id, asset_id, buyer_address, hash_hex, status, tx_id, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [reservationId, collectionId, payload.assetId, payload.buyerAddress, payload.hashHex, 'created', payload.txId ?? null, expiresAt, now, now]
      );
      const inserted = await queryAll(
        env,
        'SELECT * FROM reservations WHERE reservation_id = ?',
        [reservationId]
      );
      return jsonResponse(inserted.results?.[0]);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'Failed to create reservation');
    }
  }

  if (request.method === 'PATCH') {
    try {
      const payload = (await request.json()) as Record<string, unknown>;
      if (!payload.reservationId || !payload.action) {
        return badRequest('reservationId and action are required.');
      }
      let status = 'created';
      if (payload.action === 'confirm') {
        status = 'confirmed';
      } else if (payload.action === 'release') {
        status = 'released';
      } else if (payload.action === 'cancel') {
        status = 'cancelled';
      }
      await run(env,
        'UPDATE reservations SET status = ?, tx_id = ?, updated_at = ? WHERE reservation_id = ?',
        [status, payload.txId ?? null, Date.now(), payload.reservationId]
      );
      const select = await queryAll(
        env,
        'SELECT * FROM reservations WHERE reservation_id = ?',
        [payload.reservationId]
      );
      return jsonResponse(select.results?.[0]);
    } catch (error) {
      return serverError(error instanceof Error ? error.message : 'Failed to update reservation');
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
};
