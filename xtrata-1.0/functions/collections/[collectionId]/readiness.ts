import { badRequest, jsonResponse, serverError } from '../../lib/utils';
import { getCollectionDeployReadiness } from '../../lib/collection-deploy';
import {
  canStageUploadsBeforeDeploy,
  isCollectionUploadsLocked
} from '../../lib/collections';

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
    const contractAddress = String(readiness.collection?.contract_address ?? '')
      .trim();
    const uploadsLocked = isCollectionUploadsLocked(collectionState);
    const lockReason = uploadsLocked
      ? `Uploads are locked while collection state is "${collectionState}".`
      : null;
    const predeployUploadsReady = canStageUploadsBeforeDeploy({
      contractAddress,
      state: collectionState
    });
    const uploadReady =
      !uploadsLocked && (readiness.ready || predeployUploadsReady);
    const uploadReason = uploadsLocked
      ? lockReason
      : readiness.ready
        ? readiness.reason
        : predeployUploadsReady
          ? 'Draft staging enabled before deploy. Upload assets, then lock pricing before deploying.'
          : readiness.reason;

    return jsonResponse({
      collectionId,
      ready: uploadReady,
      reason: uploadReason,
      deployReady: readiness.ready,
      predeployUploadsReady,
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
