import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import {
  createFakeFetch,
  hangingFetch,
  jsonResponse,
  NOT_FOUND,
  openFdaPage,
  sampleLabel,
  sampleRecall,
} from './helpers/fakeFetch.js';

const silentLogger = { log() {}, warn() {}, error() {} };

function buildApp(fetchImpl, env = {}) {
  const config = loadConfig({ NODE_ENV: 'test', SERVER_NAME: 'test-server', OPENFDA_TIMEOUT_MS: '50', ...env });
  return createApp(config, { fetchImpl, logger: silentLogger });
}

describe('GET /api/health', () => {
  test('reports ok with the server name in body and X-Served-By header', async () => {
    const res = await request(buildApp(createFakeFetch())).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.server, 'test-server');
    assert.equal(res.headers['x-served-by'], 'test-server');
    assert.equal(res.headers['cache-control'], 'no-store');
  });
});

describe('GET /api/drugs', () => {
  test('searches brand, generic and substance names and normalises results', async () => {
    const fetch = createFakeFetch(openFdaPage([sampleLabel()], { total: 905, limit: 24 }));
    const res = await request(buildApp(fetch)).get('/api/drugs?q=ibuprofen');

    assert.equal(res.status, 200);
    const search = fetch.calls[0].url.searchParams.get('search');
    assert.match(search, /openfda\.brand_name:"ibuprofen"/);
    assert.match(search, /openfda\.generic_name:"ibuprofen"/);
    assert.equal(fetch.calls[0].url.pathname, '/drug/label.json');
    assert.equal(fetch.calls[0].url.searchParams.get('sort'), null);

    assert.equal(res.body.meta.total, 905);
    assert.equal(res.body.meta.count, 1);
    const [drug] = res.body.results;
    assert.equal(drug.brandName, 'Ibuprofen Dye Free');
    assert.equal(drug.genericName, 'Ibuprofen');
    assert.deepEqual(drug.routes, ['Oral']);
    assert.equal(drug.purpose, 'Pain reliever/fever reducer'); // section heading stripped
    assert.equal(drug.effectiveDate, '2025-04-12');
  });

  test('without a search term lists recent labels sorted by effective date', async () => {
    const fetch = createFakeFetch(openFdaPage([sampleLabel()]));
    await request(buildApp(fetch)).get('/api/drugs');
    assert.equal(fetch.calls[0].url.searchParams.get('search'), '_exists_:openfda.brand_name');
    assert.equal(fetch.calls[0].url.searchParams.get('sort'), 'effective_time:desc');
  });

  test('applies route and product-type filters with AND', async () => {
    const fetch = createFakeFetch(openFdaPage([sampleLabel()]));
    const res = await request(buildApp(fetch)).get('/api/drugs?q=ibuprofen&route=oral&type=otc&limit=10&skip=20');
    assert.equal(res.status, 200);
    const params = fetch.calls[0].url.searchParams;
    assert.match(params.get('search'), / AND openfda\.route:"ORAL" AND openfda\.product_type:"HUMAN OTC DRUG"$/);
    assert.equal(params.get('limit'), '10');
    assert.equal(params.get('skip'), '20');
    assert.deepEqual(res.body.meta.query, { q: 'ibuprofen', route: 'ORAL', type: 'otc' });
  });

  test('returns an empty result (not an error) when openFDA finds nothing', async () => {
    const res = await request(buildApp(createFakeFetch(NOT_FOUND))).get('/api/drugs?q=zzqxvv');
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.total, 0);
    assert.deepEqual(res.body.results, []);
  });

  for (const [label, query, pattern] of [
    ['openFDA syntax characters', '?q=%22%3A*', /can only contain/],
    ['too-long search text', `?q=${'a'.repeat(101)}`, /100 characters/],
    ['one-character search text', '?q=a', /at least 2/],
    ['a non-numeric limit', '?limit=ten', /whole number/],
    ['an out-of-range limit', '?limit=500', /between 1 and 100/],
    ['an invalid route', '?route=or%22al', /route/],
    ['an unknown product type', '?type=vitamin', /one of: otc, rx/],
    ['a repeated parameter', '?q=aa&q=bb', /only once/],
  ]) {
    test(`rejects ${label} with 400 and never calls openFDA`, async () => {
      const fetch = createFakeFetch(openFdaPage([]));
      const res = await request(buildApp(fetch)).get(`/api/drugs${query}`);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_INPUT');
      assert.match(res.body.error.message, pattern);
      assert.equal(fetch.calls.length, 0);
    });
  }
});

describe('upstream failure handling', () => {
  const cases = [
    ['rate limiting (429)', jsonResponse(429, { error: {} }), 429, 'RATE_LIMITED'],
    ['a server error (500)', jsonResponse(500, { error: {} }), 502, 'UPSTREAM_ERROR'],
    ['a rejected request (400)', jsonResponse(400, { error: {} }), 502, 'UPSTREAM_REJECTED'],
    ['a non-JSON body', jsonResponse(200, '<html>oops</html>'), 502, 'UPSTREAM_MALFORMED'],
    ['JSON missing results', jsonResponse(200, { meta: {} }), 502, 'UPSTREAM_MALFORMED'],
  ];
  for (const [label, response, status, code] of cases) {
    test(`maps ${label} to ${status} ${code}`, async () => {
      const res = await request(buildApp(createFakeFetch(response))).get('/api/drugs?q=aspirin');
      assert.equal(res.status, status);
      assert.equal(res.body.error.code, code);
      assert.ok(res.body.error.message.length > 10);
    });
  }

  test('maps a network failure to 502 UPSTREAM_UNREACHABLE', async () => {
    const failing = async () => {
      throw new TypeError('fetch failed');
    };
    const res = await request(buildApp(failing)).get('/api/recalls');
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'UPSTREAM_UNREACHABLE');
  });

  test('aborts slow requests and responds 504 UPSTREAM_TIMEOUT', async () => {
    const res = await request(buildApp(hangingFetch)).get('/api/drugs?q=aspirin');
    assert.equal(res.status, 504);
    assert.equal(res.body.error.code, 'UPSTREAM_TIMEOUT');
  });
});

describe('caching and API key handling', () => {
  test('serves repeated searches from cache and bypasses it on refresh=1', async () => {
    const fetch = createFakeFetch(openFdaPage([sampleLabel()]));
    const app = buildApp(fetch);

    const first = await request(app).get('/api/drugs?q=ibuprofen');
    const second = await request(app).get('/api/drugs?q=ibuprofen');
    assert.equal(first.body.meta.cached, false);
    assert.equal(second.body.meta.cached, true);
    assert.equal(fetch.calls.length, 1);

    const refreshed = await request(app).get('/api/drugs?q=ibuprofen&refresh=1');
    assert.equal(refreshed.body.meta.cached, false);
    assert.equal(fetch.calls.length, 2);
  });

  test('does not cache failures', async () => {
    const fetch = createFakeFetch(jsonResponse(500, {}), openFdaPage([sampleLabel()]));
    const app = buildApp(fetch);
    assert.equal((await request(app).get('/api/drugs?q=ibuprofen')).status, 502);
    assert.equal((await request(app).get('/api/drugs?q=ibuprofen')).status, 200);
  });

  test('sends the API key to openFDA but never returns it to the browser', async () => {
    const fetch = createFakeFetch(openFdaPage([sampleLabel()]));
    const res = await request(buildApp(fetch, { OPENFDA_API_KEY: 'secret-test-key' })).get('/api/drugs?q=ibuprofen');
    assert.equal(fetch.calls[0].url.searchParams.get('api_key'), 'secret-test-key');
    assert.ok(!JSON.stringify(res.body).includes('secret-test-key'));
    assert.ok(!JSON.stringify(res.headers).includes('secret-test-key'));
  });
});

describe('GET /api/drugs/:id', () => {
  test('returns full label sections and a DailyMed link', async () => {
    const fetch = createFakeFetch(
      openFdaPage([sampleLabel({ boxed_warning: ['WARNING: serious risk'], contraindications: ['Do not use with X'] })]),
    );
    const res = await request(buildApp(fetch)).get('/api/drugs/4bd1345d-d116-426e-825f-bbf29381746a');
    assert.equal(res.status, 200);
    assert.equal(fetch.calls[0].url.searchParams.get('search'), 'id:"4bd1345d-d116-426e-825f-bbf29381746a"');
    const titles = res.body.result.sections.map((s) => s.title);
    assert.equal(titles[0], 'Boxed warning');
    assert.ok(titles.includes('Contraindications'));
    assert.equal(res.body.result.hasBoxedWarning, true);
    assert.match(res.body.result.dailyMedUrl, /dailymed\.nlm\.nih\.gov.*setid=00653b7c/);
  });

  test('returns 404 when the label does not exist', async () => {
    const res = await request(buildApp(createFakeFetch(NOT_FOUND))).get('/api/drugs/00000000-0000-0000-0000-000000000000');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  test('rejects malformed ids', async () => {
    const res = await request(buildApp(createFakeFetch())).get('/api/drugs/not-an-id!');
    assert.equal(res.status, 400);
  });
});

describe('GET /api/recalls', () => {
  test('filters by classification and status, newest reports first', async () => {
    const fetch = createFakeFetch(openFdaPage([sampleRecall()], { total: 84 }));
    const res = await request(buildApp(fetch)).get('/api/recalls?q=metformin&classification=class%20ii&status=ongoing');
    assert.equal(res.status, 200);
    const params = fetch.calls[0].url.searchParams;
    assert.equal(fetch.calls[0].url.pathname, '/drug/enforcement.json');
    assert.match(params.get('search'), /product_description:"metformin"/);
    assert.match(params.get('search'), /AND classification:"Class II" AND status:"Ongoing"$/);
    assert.equal(params.get('sort'), 'report_date:desc');

    const [recall] = res.body.results;
    assert.equal(recall.severityRank, 2);
    assert.equal(recall.reportedOn, '2026-04-08');
    assert.equal(recall.location, 'Ridgefield, CT, United States');
  });

  test('lists latest recalls without a search parameter when no filters are given', async () => {
    const fetch = createFakeFetch(openFdaPage([sampleRecall()]));
    await request(buildApp(fetch)).get('/api/recalls');
    assert.equal(fetch.calls[0].url.searchParams.has('search'), false);
  });

  test('rejects an unknown classification', async () => {
    const res = await request(buildApp(createFakeFetch())).get('/api/recalls?classification=Class%20IV');
    assert.equal(res.status, 400);
  });
});

describe('static frontend and unknown routes', () => {
  test('serves index.html with a strict Content-Security-Policy', async () => {
    const res = await request(buildApp(createFakeFetch())).get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  test('unknown API endpoints return JSON 404', async () => {
    const res = await request(buildApp(createFakeFetch())).get('/api/unknown');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});
