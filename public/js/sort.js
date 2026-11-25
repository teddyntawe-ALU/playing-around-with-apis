// Pure sorting / filtering helpers (no DOM), shared by the UI and the test suite.

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

// Compare two optional strings; missing values always sort last regardless of direction.
function compareText(a, b, direction = 1) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return collator.compare(a, b) * direction;
}

const recallDate = (r) => r.initiatedOn || r.reportedOn || null;

export const DRUG_SORTS = Object.freeze({
  relevance: null, // keep openFDA's order
  'name-asc': (a, b) => compareText(a.brandName, b.brandName),
  'name-desc': (a, b) => compareText(a.brandName, b.brandName, -1),
  'manufacturer-asc': (a, b) => compareText(a.manufacturer, b.manufacturer) || compareText(a.brandName, b.brandName),
  'route-asc': (a, b) => compareText(a.routes[0], b.routes[0]) || compareText(a.brandName, b.brandName),
  'updated-desc': (a, b) => compareText(a.effectiveDate, b.effectiveDate, -1),
});

export const RECALL_SORTS = Object.freeze({
  newest: (a, b) => compareText(recallDate(a), recallDate(b), -1),
  oldest: (a, b) => compareText(recallDate(a), recallDate(b)),
  // severityRank: 1 = Class I (most serious) … 4 = unclassified.
  'severity-desc': (a, b) => a.severityRank - b.severityRank || compareText(recallDate(a), recallDate(b), -1),
  'severity-asc': (a, b) => b.severityRank - a.severityRank || compareText(recallDate(a), recallDate(b), -1),
});

export function sortItems(items, sortKey, table) {
  const compare = table[sortKey];
  return compare ? [...items].sort(compare) : [...items];
}

// Keep items whose chosen fields contain every word of `text` (case-insensitive).
export function refineItems(items, text, fields) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => {
    const haystack = fields
      .map((field) => item[field])
      .flat()
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export const DRUG_REFINE_FIELDS = ['brandName', 'genericName', 'manufacturer', 'routes', 'substances', 'purpose', 'indications'];
export const RECALL_REFINE_FIELDS = ['product', 'firm', 'reason', 'brandName', 'distribution', 'recallNumber', 'location'];

// Mirrors the server-side rule so obviously invalid input is caught before any request.
const TERM_PATTERN = /^[\p{L}\p{N} .,'\/&-]+$/u;

export function validateTerm(raw) {
  const term = raw.trim().replace(/\s+/g, ' ');
  if (term === '') return { term, error: null };
  if (term.length < 2) return { term, error: 'Please type at least 2 characters.' };
  if (term.length > 100) return { term, error: 'Please keep your search under 100 characters.' };
  if (!TERM_PATTERN.test(term)) {
    return { term, error: "Use only letters, numbers, spaces and . , ' / & -" };
  }
  return { term, error: null };
}

// Turn a drug name into something that passes validateTerm (used for "check recalls").
export function toSafeTerm(name) {
  return (name || '').replace(/[^\p{L}\p{N} .,'\/&-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}
