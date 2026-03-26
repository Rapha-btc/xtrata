import {
  getRuntimeApiBases,
  parseRuntimeContractRef,
  parseRuntimeNetwork,
  parseRuntimeTokenId,
  resolveRuntimeContent,
  type RuntimeEnv
} from './lib';

const asJsonError = (status: number, message: string, detail?: string) =>
  new Response(
    JSON.stringify({
      error: message,
      detail: detail || null
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    }
  );

export const onRequest = async (context: {
  request: Request;
  env: RuntimeEnv;
}) => {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return asJsonError(405, 'Method not allowed.');
  }

  const url = new URL(request.url);
  const contractId = parseRuntimeContractRef(url.searchParams.get('contractId'));
  const fallbackContractId = parseRuntimeContractRef(
    url.searchParams.get('fallbackContractId')
  );
  const tokenId = parseRuntimeTokenId(url.searchParams.get('tokenId'));
  const network = parseRuntimeNetwork(url.searchParams.get('network'));

  if (!contractId) {
    return asJsonError(400, 'Invalid contractId parameter.');
  }
  if (tokenId === null || tokenId < 0n) {
    return asJsonError(400, 'Invalid tokenId parameter.');
  }

  const apiBases = getRuntimeApiBases(network, env);
  if (apiBases.length === 0) {
    return asJsonError(500, 'No API base URLs configured for runtime content.');
  }

  try {
    const resolved = await resolveRuntimeContent({
      env,
      apiBases,
      tokenId,
      primaryContract: contractId,
      fallbackContract: fallbackContractId
    });

    return new Response(resolved.bytes, {
      status: 200,
      headers: {
        'Content-Type': resolved.meta.mimeType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=60',
        'X-Content-Type-Options': 'nosniff',
        'X-Xtrata-Runtime-Contract': `${resolved.contract.address}.${resolved.contract.contractName}`,
        'X-Xtrata-Runtime-Network': network
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return asJsonError(502, 'Failed to reconstruct runtime content.', detail);
  }
};
