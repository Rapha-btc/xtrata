import { badRequest, jsonResponse, serverError } from '../../lib/utils';
import { getCollectionDeployReadiness } from '../../lib/collection-deploy';

export const onRequest: PagesFunction = async ({ request, env, params }) => {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const collectionId = params?.collectionId?.trim();
  if (!collectionId) {
    return badRequest('Collection id missing.');
  }

  try {
    const readiness = await getCollectionDeployReadiness({
      env,
      collectionId
    });

    const collectionState = String(readiness.collection?.state ?? 'draft')
      .trim()
      .toLowerCase();
    const uploadsLocked =
      collectionState === 'published' || collectionState === 'archived';
    const lockReason = uploadsLocked
      ? `Uploads are locked while collection state is "${collectionState}".`
      : null;

    return jsonResponse({
      collectionId,
      ready: readiness.ready,
      reason: readiness.reason,
      deployTxId: readiness.deployTxId,
      deployTxStatus: readiness.deployTxStatus,
      network: readiness.network,
      collectionState,
      uploadsLocked,
      lockReason
    });
  } catch (error) {
    return serverError(
      error instanceof Error ? error.message : 'Failed to evaluate readiness'
    );
  }
};
