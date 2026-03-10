import { badRequest, jsonResponse, notFound, serverError } from '../../lib/utils';
import {
  buildX402PaymentRequiredPayload,
  isValidX402Address,
  normalizeX402TxId,
  resolveX402Access
} from '../../lib/x402-access';
import {
  X402_ACCESS_TTL_SECONDS,
  getX402AccessSecret,
  getX402PremiumRoute
} from '../../lib/x402-config';
import {
  buildX402AccessCookie,
  createX402AccessToken,
  shouldUseSecureCookie
} from '../../lib/x402-auth';

export const onRequest: PagesFunction = async ({ request, env }) => {
  if (request.method.toUpperCase() !== 'POST') {
    return badRequest('Use POST for x402 session issuance.');
  }

  let body: { slug?: unknown; address?: unknown; txId?: unknown };
  try {
    body = (await request.json()) as { slug?: unknown; address?: unknown; txId?: unknown };
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const txId =
    typeof body.txId === 'string' && body.txId.trim().length > 0 ? body.txId.trim() : null;

  if (!slug) {
    return badRequest('Missing slug in request body.');
  }
  if (!isValidX402Address(address)) {
    return badRequest('Missing or invalid address in request body.');
  }
  if (txId && !normalizeX402TxId(txId)) {
    return badRequest('Invalid txId in request body.');
  }

  const lookup = getX402PremiumRoute(env as Record<string, string | undefined>, slug);
  if (lookup.error) {
    return serverError(lookup.error);
  }
  if (!lookup.route) {
    return notFound('Premium route not found.');
  }

  const secret = getX402AccessSecret(env as Record<string, string | undefined>);
  if (!secret) {
    return serverError('Missing X402_ACCESS_SECRET.');
  }

  try {
    const result = await resolveX402Access({
      env: env as Record<string, string | undefined>,
      route: lookup.route,
      address,
      txId
    });

    if (result.txState?.status === 'pending') {
      return jsonResponse(
        {
          ok: false,
          slug: lookup.route.slug,
          status: 'pending',
          txStatus: result.txState.rawStatus
        },
        409,
        {
          'Cache-Control': 'no-store'
        }
      );
    }

    if (result.txState?.status === 'failed') {
      return jsonResponse(
        {
          ok: false,
          slug: lookup.route.slug,
          status: 'failed',
          txStatus: result.txState.rawStatus
        },
        409,
        {
          'Cache-Control': 'no-store'
        }
      );
    }

    if (!result.unlocked || !result.mode) {
      return jsonResponse(buildX402PaymentRequiredPayload(lookup.route), 402, {
        'Cache-Control': 'no-store'
      });
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + X402_ACCESS_TTL_SECONDS;
    const token = await createX402AccessToken(
      {
        sub: address,
        slug: lookup.route.slug,
        assetId: lookup.route.assetId.toString(),
        mode: result.mode,
        iat: issuedAt,
        exp: expiresAt
      },
      secret
    );

    return jsonResponse(
      {
        ok: true,
        slug: lookup.route.slug,
        expiresAt: expiresAt * 1000,
        unlockUrl: `/demo/premium/${encodeURIComponent(lookup.route.slug)}`
      },
      200,
      {
        'Cache-Control': 'no-store',
        'Set-Cookie': buildX402AccessCookie({
          token,
          maxAgeSeconds: X402_ACCESS_TTL_SECONDS,
          secure: shouldUseSecureCookie(request)
        })
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to issue x402 session.';
    return serverError(message);
  }
};
