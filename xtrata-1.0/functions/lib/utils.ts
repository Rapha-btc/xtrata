export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
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
