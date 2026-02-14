const HTML_RESPONSE_PATTERN = /<!doctype html|<html|<head|<script\s+type=\"module\">/i;

const FUNCTIONS_UNAVAILABLE_HINT =
  'Collections API is unavailable. This usually means local dev is running Vite without Cloudflare Pages Functions for `/collections`.';

const API_SETUP_HINT =
  'Use a Pages environment (or local Pages Functions with DB/R2 bindings) to access artist manager data APIs.';

const isLikelyHtmlResponse = (text: string) => HTML_RESPONSE_PATTERN.test(text);

const formatEndpointLabel = (endpointLabel: string) => endpointLabel.trim() || 'API';

const parseJsonText = (text: string) => {
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text) as unknown;
};

const extractErrorMessage = (payload: unknown) => {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

export const parseManageJsonResponse = async <T>(
  response: Response,
  endpointLabel: string
): Promise<T> => {
  const label = formatEndpointLabel(endpointLabel);
  const text = await response.text();

  if (isLikelyHtmlResponse(text)) {
    throw new Error(`${label}: ${FUNCTIONS_UNAVAILABLE_HINT} ${API_SETUP_HINT}`);
  }

  let payload: unknown = null;
  try {
    payload = parseJsonText(text);
  } catch {
    const snippet = text.slice(0, 140).replace(/\s+/g, ' ').trim();
    throw new Error(
      `${label}: response was not valid JSON.${snippet ? ` Received: ${snippet}` : ''}`
    );
  }

  if (!response.ok) {
    const message = extractErrorMessage(payload);
    throw new Error(message ?? `${label} request failed (${response.status}).`);
  }

  return payload as T;
};

export const toManageApiErrorMessage = (
  error: unknown,
  fallback: string
) => {
  if (error instanceof Error) {
    if (/Failed to fetch|NetworkError/i.test(error.message)) {
      return `${FUNCTIONS_UNAVAILABLE_HINT} ${API_SETUP_HINT}`;
    }
    return error.message;
  }
  return fallback;
};
