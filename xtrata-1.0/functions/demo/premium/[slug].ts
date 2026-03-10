import { jsonResponse, notFound, serverError } from '../../lib/utils';
import { buildX402PaymentRequiredPayload } from '../../lib/x402-access';
import { getX402AccessSecret, getX402PremiumRoute } from '../../lib/x402-config';
import { getX402CookieValue, verifyX402AccessToken } from '../../lib/x402-auth';
import { renderX402PremiumHtml } from '../../lib/x402-html';

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug.trim() : '';
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
    const token = getX402CookieValue(request);
    const payload = await verifyX402AccessToken(token, secret);
    const unlocked =
      payload &&
      payload.slug === lookup.route.slug &&
      payload.assetId === lookup.route.assetId.toString();

    if (!unlocked) {
      return jsonResponse(buildX402PaymentRequiredPayload(lookup.route), 402, {
        'Cache-Control': 'no-store'
      });
    }

    if (lookup.route.delivery === 'json') {
      return jsonResponse(
        {
          ok: true,
          slug: lookup.route.slug,
          title: lookup.route.title,
          assetId: lookup.route.assetId.toString(),
          accessMode: lookup.route.accessMode,
          message: 'Premium JSON payload unlocked through x402 session verification.'
        },
        200,
        {
          'Cache-Control': 'private, no-store'
        }
      );
    }

    return new Response(renderX402PremiumHtml(lookup.route), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to serve premium content.';
    return serverError(message);
  }
};
