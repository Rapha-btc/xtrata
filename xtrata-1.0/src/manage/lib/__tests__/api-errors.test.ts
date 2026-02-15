import { describe, expect, it } from 'vitest';
import { parseManageJsonResponse, toManageApiErrorMessage } from '../api-errors';

describe('manage api error helpers', () => {
  it('returns parsed JSON payload for successful responses', async () => {
    const response = new Response(JSON.stringify({ ok: true, value: 7 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });

    const payload = await parseManageJsonResponse<{ ok: boolean; value: number }>(
      response,
      'Health'
    );

    expect(payload).toEqual({ ok: true, value: 7 });
  });

  it('appends request id from payload for failed responses', async () => {
    const response = new Response(
      JSON.stringify({ error: 'Missing binding', requestId: 'req-123' }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );

    await expect(parseManageJsonResponse(response, 'Upload URL')).rejects.toThrow(
      'Missing binding [request req-123]'
    );
  });

  it('appends request id from response headers when payload has no request id', async () => {
    const response = new Response(JSON.stringify({ error: 'Bad request' }), {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'x-xtrata-request-id': 'hdr-456'
      }
    });

    await expect(parseManageJsonResponse(response, 'Upload URL')).rejects.toThrow(
      'Bad request [request hdr-456]'
    );
  });

  it('returns function-unavailable hint for html responses', async () => {
    const response = new Response('<!doctype html><html><head></head><body></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });

    await expect(parseManageJsonResponse(response, 'Collections')).rejects.toThrow(
      'Collections API is unavailable'
    );
  });

  it('maps fetch-style errors to setup guidance', () => {
    const message = toManageApiErrorMessage(
      new Error('Failed to fetch'),
      'fallback'
    );

    expect(message).toContain('Collections API is unavailable');
    expect(message).toContain('Functions are deployed');
  });
});
