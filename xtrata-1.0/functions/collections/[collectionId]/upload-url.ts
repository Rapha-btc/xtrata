export const onRequest: PagesFunction = async ({ env, params }) => {
  const collectionId = params?.collectionId;
  if (!collectionId) {
    return new Response(JSON.stringify({ error: 'collection id required' }), { status: 400 });
  }
  const key = `${collectionId}/${crypto.randomUUID()}`;
  const uploadUrl = await env.ASSETS.getUploadUrl({ method: 'PUT', key, expires: 60 * 5 });
  return new Response(JSON.stringify({ uploadUrl, key }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
