// Test double for globalThis.fetch. It records every URL requested and replies with queued
// responses, so tests can check exactly what is sent to openFDA without touching the network.
// The canned bodies below copy the real openFDA response structure (meta.results + results[]).

export function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('Unexpected token');
      return body;
    },
  };
}

export function openFdaPage(results, { total = results.length, skip = 0, limit = results.length } = {}) {
  return jsonResponse(200, {
    meta: { last_updated: '2026-11-25', results: { skip, limit, total } },
    results,
  });
}

export const NOT_FOUND = jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No matches found!' } });

export function createFakeFetch(...responses) {
  const calls = [];
  const queue = [...responses];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: new URL(url), options });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (typeof next === 'function') return next(url, options);
    return next;
  };
  fakeFetch.calls = calls;
  return fakeFetch;
}

// A fetch that never answers until the request is aborted (simulates a hung upstream).
export function hangingFetch(url, { signal }) {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}

export const sampleLabel = (overrides = {}) => ({
  id: '4bd1345d-d116-426e-825f-bbf29381746a',
  set_id: '00653b7c-7099-487e-9a01-e89781c21323',
  effective_time: '20250412',
  purpose: ['Purpose Pain reliever/fever reducer'],
  indications_and_usage: ['Uses temporarily relieves minor aches and pains'],
  dosage_and_administration: ['Directions take 1 tablet every 4 to 6 hours'],
  warnings: ['Warnings Allergy alert: ibuprofen may cause a severe allergic reaction'],
  openfda: {
    brand_name: ['Ibuprofen Dye Free'],
    generic_name: ['IBUPROFEN'],
    manufacturer_name: ['CVS Pharmacy'],
    route: ['ORAL'],
    product_type: ['HUMAN OTC DRUG'],
    substance_name: ['IBUPROFEN'],
  },
  ...overrides,
});

export const sampleRecall = (overrides = {}) => ({
  recall_number: 'D-0657-2026',
  event_id: '99233',
  classification: 'Class II',
  status: 'Ongoing',
  product_description: 'Metformin Hydrochloride Extended-Release Tablets, 500 mg',
  recalling_firm: 'Example Pharma Inc.',
  reason_for_recall: 'CGMP Deviations',
  product_quantity: '560 bottles',
  distribution_pattern: 'Nationwide',
  city: 'Ridgefield',
  state: 'CT',
  country: 'United States',
  recall_initiation_date: '20260310',
  center_classification_date: '20260401',
  report_date: '20260408',
  voluntary_mandated: 'Voluntary: Firm initiated',
  openfda: {},
  ...overrides,
});
