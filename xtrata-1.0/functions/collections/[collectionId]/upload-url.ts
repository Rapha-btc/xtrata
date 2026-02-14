export const onRequest: PagesFunction = async ({ env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return new Response(JSON.stringify({ error: 'collection id required' }), { status: 400 });
  }
  try {
    const bucket =
      (env as Record<string, unknown>).COLLECTION_ASSETS ??
      (env as Record<string, unknown>).ASSETS ??
      (env as Record<string, unknown>).R2;
    if (!bucket || typeof (bucket as R2Bucket).getUploadUrl !== 'function') {
      return new Response(
        JSON.stringify({
          error:
            'Missing R2 binding. Configure bucket binding `COLLECTION_ASSETS` (or legacy `ASSETS`/`R2`) for this Pages environment.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const key = `${collectionId}/${crypto.randomUUID()}`;
    const uploadUrl = await (bucket as R2Bucket).getUploadUrl({
      method: 'PUT',
      key,
      expires: 60 * 5
    });
    return new Response(JSON.stringify({ uploadUrl, key }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to create upload URL'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
