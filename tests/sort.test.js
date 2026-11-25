// Tests for the browser's pure sort / filter / validation helpers (public/js/sort.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRUG_SORTS,
  RECALL_SORTS,
  refineItems,
  sortItems,
  toSafeTerm,
  validateTerm,
} from '../public/js/sort.js';

const drugs = [
  { brandName: 'Motrin', manufacturer: 'Kenvue', routes: ['Oral'], effectiveDate: '2024-01-10' },
  { brandName: 'advil', manufacturer: 'Haleon', routes: ['Oral'], effectiveDate: '2025-06-01' },
  { brandName: 'Caldolor', manufacturer: null, routes: ['Intravenous'], effectiveDate: null },
];

const names = (items) => items.map((d) => d.brandName);

describe('drug sorting', () => {
  test('relevance keeps API order and does not mutate input', () => {
    const sorted = sortItems(drugs, 'relevance', DRUG_SORTS);
    assert.deepEqual(names(sorted), ['Motrin', 'advil', 'Caldolor']);
    assert.notEqual(sorted, drugs);
  });

  test('name sorting is case-insensitive in both directions', () => {
    assert.deepEqual(names(sortItems(drugs, 'name-asc', DRUG_SORTS)), ['advil', 'Caldolor', 'Motrin']);
    assert.deepEqual(names(sortItems(drugs, 'name-desc', DRUG_SORTS)), ['Motrin', 'Caldolor', 'advil']);
  });

  test('missing manufacturers and dates sort last', () => {
    assert.deepEqual(names(sortItems(drugs, 'manufacturer-asc', DRUG_SORTS)), ['advil', 'Motrin', 'Caldolor']);
    assert.deepEqual(names(sortItems(drugs, 'updated-desc', DRUG_SORTS)), ['advil', 'Motrin', 'Caldolor']);
  });

  test('route sorting groups by route then name', () => {
    assert.deepEqual(names(sortItems(drugs, 'route-asc', DRUG_SORTS)), ['Caldolor', 'advil', 'Motrin']);
  });
});

describe('recall sorting', () => {
  const recalls = [
    { id: 'a', severityRank: 2, initiatedOn: '2026-03-01' },
    { id: 'b', severityRank: 1, initiatedOn: '2025-01-01' },
    { id: 'c', severityRank: 3, initiatedOn: '2026-09-01' },
    { id: 'd', severityRank: 1, initiatedOn: null, reportedOn: '2026-10-01' },
  ];
  const ids = (items) => items.map((r) => r.id).join('');

  test('date sorting uses initiation date, falling back to report date', () => {
    assert.equal(ids(sortItems(recalls, 'newest', RECALL_SORTS)), 'dcab');
    assert.equal(ids(sortItems(recalls, 'oldest', RECALL_SORTS)), 'bacd');
  });

  test('severity sorting puts Class I first (newest first within a class)', () => {
    assert.equal(ids(sortItems(recalls, 'severity-desc', RECALL_SORTS)), 'dbac');
    assert.equal(ids(sortItems(recalls, 'severity-asc', RECALL_SORTS)), 'cadb');
  });
});

describe('refine filter', () => {
  test('matches every word across the chosen fields, including arrays', () => {
    const fields = ['brandName', 'manufacturer', 'routes'];
    assert.deepEqual(names(refineItems(drugs, 'oral HALEON', fields)), ['advil']);
    assert.deepEqual(names(refineItems(drugs, 'intravenous', fields)), ['Caldolor']);
    assert.equal(refineItems(drugs, '   ', fields), drugs);
    assert.deepEqual(refineItems(drugs, 'nothing-matches', fields), []);
  });
});

describe('client-side validation', () => {
  test('mirrors the server rules', () => {
    assert.deepEqual(validateTerm('  ibuprofen  '), { term: 'ibuprofen', error: null });
    assert.equal(validateTerm('').error, null);
    assert.match(validateTerm('a').error, /at least 2/);
    assert.match(validateTerm('ibu"profen').error, /Use only/);
    assert.match(validateTerm('x'.repeat(101)).error, /under 100/);
  });

  test('toSafeTerm strips characters the API would reject', () => {
    assert.equal(toSafeTerm('Ibuprofen (IB) [200 mg]'), 'Ibuprofen IB 200 mg');
    assert.equal(validateTerm(toSafeTerm('a:b*"c')).error, null);
  });
});
