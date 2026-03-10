import { badRequest, jsonResponse, notFound, serverError } from '../../lib/utils';
import { getX402PremiumRoute } from '../../lib/x402-config';
import {
  isValidX402Address,
  normalizeX402TxId,
  resolveX402Access
} from '../../lib/x402-access';

export const onRequest: PagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug')?.trim() ?? '';
  const address = url.searchParams.get('address')?.trim() ?? '';
  const txIdParam = url.searchParams.get('txId');

  if (!slug) {
    return badRequest('Missing slug query parameter.');
  }
  if (!isValidX402Address(address)) {
    return badRequest('Missing or invalid address query parameter.');
  }
  if (txIdParam && !normalizeX402TxId(txIdParam)) {
    return badRequest('Invalid txId query parameter.');
  }

  const lookup = getX402PremiumRoute(env as Record<string, string | undefined>, slug);
  if (lookup.error) {
    return serverError(lookup.error);
  }
  if (!lookup.route) {
    return notFound('Premium route not found.');
  }

  try {
    const result = await resolveX402Access({
      env: env as Record<string, string | undefined>,
      route: lookup.route,
      address,
      txId: txIdParam
    });
    return jsonResponse(
      {
        slug: lookup.route.slug,
        address,
        unlocked: result.unlocked,
        mode: result.mode,
        verifiedAt: result.verifiedAt,
        txStatus: result.txState?.rawStatus ?? null
      },
      200,
      {
        'Cache-Control': 'no-store'
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify access state.';
    return serverError(message);
  }
};
