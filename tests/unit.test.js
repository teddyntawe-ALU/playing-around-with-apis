import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../src/services/cache.js';
import { buildLabelQuery, buildRecallQuery } from '../src/services/queries.js';
import { stripHeading, toIsoDate, toLabelSummary, toRecall, truncate } from '../src/services/transform.js';
import { parseSearchTerm, parseRoute } from '../src/utils/validate.js';
import { loadConfig } from '../src/config.js';

describe('validation', () => {
  test('normalises whitespace and accepts common drug-name punctuation', () => {
    assert.equal(parseSearchTerm('  tylenol   extra strength '), 'tylenol extra strength');
    assert.equal(parseSearchTerm("co-amoxiclav 5/325 O'Neil, & Co."), "co-amoxiclav 5/325 O'Neil, & Co.");
    assert.equal(parseSearchTerm('paracétamol'), 'paracétamol');
    assert.equal(parseSearchTerm(undefined), '');
    assert.equal(parseSearchTerm('   '), '');
  });

  test('rejects characters that would break openFDA query syntax', () => {
    for (const bad of ['ibu"profen', 'a:b', 'x OR (y)', 'brand*', 'a\\b', 'a+b']) {
      assert.throws(() => parseSearchTerm(bad), /can only contain/, bad);
    }
  });

  test('upper-cases routes and allows parentheses', () => {
    assert.equal(parseRoute('respiratory (inhalation)'), 'RESPIRATORY (INHALATION)');
    assert.throws(() => parseRoute('oral"'));
  });
});

describe('query builders', () => {
  test('label query ORs name fields and ANDs filters', () => {
    const { search, sort } = buildLabelQuery({ q: 'metformin', route: 'ORAL', productType: 'rx' });
    assert.equal(
      search,
      '(openfda.brand_name:"metformin" openfda.generic_name:"metformin" openfda.substance_name:"metformin") AND openfda.route:"ORAL" AND openfda.product_type:"HUMAN PRESCRIPTION DRUG"',
    );
    assert.equal(sort, undefined);
  });

  test('recall query without filters has no search clause', () => {
    assert.deepEqual(buildRecallQuery({}), { search: undefined, sort: 'report_date:desc' });
  });
});

describe('transformers', () => {
  test('truncate cuts on a word boundary and adds an ellipsis', () => {
    assert.equal(truncate('one two three four five', 13), 'one two three…');
    assert.equal(truncate('short', 50), 'short');
    assert.equal(truncate(null, 10), null);
  });

  test('toIsoDate converts YYYYMMDD and rejects garbage', () => {
    assert.equal(toIsoDate('20261118'), '2026-11-18');
    assert.equal(toIsoDate('2026-11-18'), null);
    assert.equal(toIsoDate(undefined), null);
  });

  test('stripHeading removes repeated section headings only', () => {
    assert.equal(stripHeading('1 INDICATIONS AND USAGE Metformin is indicated'), 'Metformin is indicated');
    assert.equal(stripHeading('Active ingredient (in each tablet) Ibuprofen 200 mg'), 'Ibuprofen 200 mg');
    assert.equal(stripHeading('Use only as directed'), 'Use only as directed');
  });

  test('label summary tolerates records with almost no fields', () => {
    const summary = toLabelSummary({ id: 'abc', openfda: {} });
    assert.equal(summary.brandName, 'Unnamed product');
    assert.deepEqual(summary.routes, []);
    assert.equal(summary.indications, null);
    assert.equal(summary.hasBoxedWarning, false);
  });

  test('recall severity ranks Class I as most severe and unknown last', () => {
    assert.equal(toRecall({ classification: 'Class I' }).severityRank, 1);
    assert.equal(toRecall({ classification: 'Class III' }).severityRank, 3);
    assert.equal(toRecall({}).severityRank, 4);
  });
});

describe('cache', () => {
  test('expires entries after the TTL', () => {
    let now = 0;
    const cache = createCache({ ttlMs: 1000, maxEntries: 10, now: () => now });
    cache.set('a', 1);
    assert.equal(cache.get('a'), 1);
    now = 1001;
    assert.equal(cache.get('a'), undefined);
  });

  test('evicts the least recently used entry when full', () => {
    const cache = createCache({ ttlMs: 10_000, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now most recent
    cache.set('c', 3);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('c'), 3);
  });
});

describe('config', () => {
  test('parses environment values with safe fallbacks', () => {
    const config = loadConfig({ PORT: 'abc', TRUST_PROXY: '1', CACHE_TTL_SECONDS: '60' });
    assert.equal(config.port, 3000);
    assert.equal(config.trustProxy, 1);
    assert.equal(config.cache.ttlMs, 60_000);
    assert.equal(config.openFda.apiKey, '');
  });
});
