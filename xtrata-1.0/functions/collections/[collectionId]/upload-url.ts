import { badRequest, jsonResponse, serverError } from '../../lib/utils';
import { getCollectionDeployReadiness } from '../../lib/collection-deploy';

export const onRequest: PagesFunction = async ({ env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return badRequest('collection id required');
  }
  try {
    const readiness = await getCollectionDeployReadiness({
      env,
      collectionId
    });
    if (!readiness.ready) {
      return badRequest(readiness.reason);
    }

    const bucket =
      (env as Record<string, unknown>).COLLECTION_ASSETS ??
      (env as Record<string, unknown>).ASSETS ??
      (env as Record<string, unknown>).R2;
    if (!bucket || typeof (bucket as R2Bucket).getUploadUrl !== 'function') {
      return serverError(
        'Missing R2 binding. Configure bucket binding `COLLECTION_ASSETS` (or legacy `ASSETS`/`R2`) for this Pages environment.'
      );
    }
    const key = `${collectionId}/${crypto.randomUUID()}`;
    const uploadUrl = await (bucket as R2Bucket).getUploadUrl({
      method: 'PUT',
      key,
      expires: 60 * 5
    });
    return jsonResponse({ uploadUrl, key });
  } catch (error) {
    return serverError(
      error instanceof Error ? error.message : 'Failed to create upload URL'
    );
  }
};
