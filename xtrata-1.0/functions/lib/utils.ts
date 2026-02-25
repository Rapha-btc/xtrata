export function jsonResponse(
  payload: unknown,
  status = 200,
  headers?: HeadersInit
) {
  const responseHeaders = new Headers({ 'Content-Type': 'application/json' });
  if (headers) {
    const extraHeaders = new Headers(headers);
    extraHeaders.forEach((value, key) => {
      responseHeaders.set(key, value);
    });
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders
  });
}

export function badRequest(message: string) {
  return jsonResponse({ error: message }, 400);
}

export function notFound(message = 'Not found') {
  return jsonResponse({ error: message }, 404);
}

export function serverError(message = 'Server error') {
  return jsonResponse({ error: message }, 500);
}
