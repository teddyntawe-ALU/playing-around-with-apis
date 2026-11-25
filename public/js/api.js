// Browser-side client for the RxLens backend. The browser never talks to openFDA directly:
// all requests go through /api so the API key, caching and validation stay on the server.

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function getJson(path, params = {}, signal) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined && value !== null && value !== false) url.searchParams.set(key, value);
  }

  let response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(
      'NETWORK',
      'We could not reach the RxLens server. Check your internet connection and try again.',
      0,
    );
  }

  const servedBy = response.headers.get('X-Served-By');
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body, e.g. an Nginx 502 page when an app server is down.
  }

  if (!response.ok) {
    throw new ApiError(
      body?.error?.code || `HTTP_${response.status}`,
      body?.error?.message || `The server could not complete the request (HTTP ${response.status}). Please try again.`,
      response.status,
    );
  }
  if (!body) throw new ApiError('MALFORMED', 'The server sent a response we could not read. Please try again.', response.status);
  return { body, servedBy };
}

export const api = {
  searchDrugs: (params, signal) => getJson('/api/drugs', params, signal),
  getDrug: (id, signal) => getJson(`/api/drugs/${encodeURIComponent(id)}`, {}, signal),
  searchRecalls: (params, signal) => getJson('/api/recalls', params, signal),
};
