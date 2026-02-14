const asTrimmedString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const onRequest: PagesFunction = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const runtimeEnv = env as Record<string, unknown>;
  const candidates: Array<{ key: string; value: string }> = [
    {
      key: 'ARTIST_ALLOWLIST',
      value: asTrimmedString(runtimeEnv.ARTIST_ALLOWLIST)
    },
    {
      key: 'VITE_ARTIST_ALLOWLIST',
      value: asTrimmedString(runtimeEnv.VITE_ARTIST_ALLOWLIST)
    },
    {
      key: 'MANAGE_ALLOWLIST',
      value: asTrimmedString(runtimeEnv.MANAGE_ALLOWLIST)
    }
  ];

  const active = candidates.find((candidate) => candidate.value.length > 0) ?? null;

  return new Response(
    JSON.stringify({
      source: active?.key ?? null,
      raw: active?.value ?? '',
      hasValue: !!active
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );
};
