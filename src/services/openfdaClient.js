// HTTP client for the openFDA API (https://open.fda.gov/apis/).
// Responsibilities: build the request URL, attach the optional API key, enforce a timeout,
// cache successful responses, and translate every failure mode into a clean AppError.
import { AppError } from '../utils/errors.js';

export function createOpenFdaClient({ baseUrl, apiKey, timeoutMs, cache, fetchImpl = globalThis.fetch }) {
  async function request(path, params = {}, { bypassCache = false } = {}) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    // The cache key never contains the API key.
    const cacheKey = url.toString();
    if (!bypassCache) {
      const hit = cache.get(cacheKey);
      if (hit) return { ...hit, cached: true };
    }
    if (apiKey) url.searchParams.set('api_key', apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    let body;
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'RxLens/1.0 (student project)' },
      });
      body = await response.json().catch(() => null);
    } catch (err) {
      if (controller.signal.aborted) {
        throw new AppError(504, 'UPSTREAM_TIMEOUT', 'The FDA service took too long to respond. Please try again.');
      }
      throw new AppError(502, 'UPSTREAM_UNREACHABLE', 'Could not reach the FDA service. Please check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }

    const skip = Number(params.skip) || 0;
    const limit = Number(params.limit) || 0;

    // openFDA answers "no results" with HTTP 404 — for us that is a valid, empty result.
    if (response.status === 404 && body?.error?.code === 'NOT_FOUND') {
      const empty = { total: 0, skip, limit, lastUpdated: null, results: [] };
      cache.set(cacheKey, empty);
      return { ...empty, cached: false };
    }
    if (response.status === 429) {
      throw new AppError(429, 'RATE_LIMITED', 'The FDA service is receiving too many requests right now. Please wait a minute and try again.');
    }
    if (response.status >= 500) {
      throw new AppError(502, 'UPSTREAM_ERROR', 'The FDA service is temporarily unavailable. Please try again shortly.');
    }
    if (!response.ok) {
      throw new AppError(502, 'UPSTREAM_REJECTED', 'The FDA service could not process this search. Try different wording.');
    }
    if (!body || !Array.isArray(body.results) || typeof body.meta?.results?.total !== 'number') {
      throw new AppError(502, 'UPSTREAM_MALFORMED', 'The FDA service returned an unexpected response. Please try again.');
    }

    const data = {
      total: body.meta.results.total,
      skip: body.meta.results.skip ?? skip,
      limit: body.meta.results.limit ?? limit,
      lastUpdated: body.meta.last_updated ?? null,
      results: body.results,
    };
    cache.set(cacheKey, data);
    return { ...data, cached: false };
  }

  return {
    searchLabels: (params, options) => request('/drug/label.json', params, options),
    searchRecalls: (params, options) => request('/drug/enforcement.json', params, options),
  };
}
