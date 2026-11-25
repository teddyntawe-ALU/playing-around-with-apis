// End-to-end smoke test against a running instance (local, Web01, Web02 or Lb01).
// It calls the REAL openFDA API through the app, so it needs internet access.
// Usage: node scripts/smoke.mjs [baseUrl]   (default http://localhost:3000)
const base = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const checks = [
  ['health endpoint', '/api/health', (s, b) => s === 200 && b.status === 'ok'],
  ['homepage HTML', '/', (s, b) => s === 200 && typeof b === 'string' && b.includes('RxLens')],
  ['drug search returns live results', '/api/drugs?q=ibuprofen&limit=5', (s, b) => s === 200 && b.results.length > 0 && b.meta.total > 0],
  ['route + type filters', '/api/drugs?q=ibuprofen&route=ORAL&type=otc&limit=5', (s, b) => s === 200 && b.results.every((d) => d.routes.includes('Oral'))],
  ['recall search returns live results', '/api/recalls?q=metformin&limit=5', (s, b) => s === 200 && b.results.length > 0],
  ['recall class filter', '/api/recalls?classification=Class%20I&limit=5', (s, b) => s === 200 && b.results.every((r) => r.classification === 'Class I')],
  ['no-match search is empty, not an error', '/api/drugs?q=xqzzvbntq', (s, b) => s === 200 && b.meta.total === 0],
  ['invalid input is rejected', '/api/drugs?q=%22%3A*', (s, b) => s === 400 && b.error.code === 'INVALID_INPUT'],
  ['unknown endpoint is a JSON 404', '/api/nope', (s, b) => s === 404 && b.error.code === 'NOT_FOUND'],
];

let failed = 0;
console.log(`Smoke testing ${base}\n`);
for (const [name, path, ok] of checks) {
  const started = Date.now();
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(15000) });
    const type = res.headers.get('content-type') || '';
    const body = type.includes('json') ? await res.json() : await res.text();
    const pass = ok(res.status, body);
    if (!pass) failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (${res.status}, ${Date.now() - started}ms, served by ${res.headers.get('x-served-by') ?? '?'})`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}  (${err.message})`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
