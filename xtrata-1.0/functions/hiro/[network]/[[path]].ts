import { proxyHiroRequest } from '../../lib/hiro-proxy';

export const onRequest = async (context: {
  request: Request;
  params: { network?: string; path?: string | string[] };
  env: Record<string, string | undefined>;
}) => {
  const { request, params, env } = context;
  return proxyHiroRequest({
    request,
    env,
    network: params.network || '',
    path: params.path
  });
};
