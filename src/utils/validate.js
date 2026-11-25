// Input validation for query-string parameters.
// openFDA returns a 500 for malformed search syntax, so user input is restricted to a
// conservative character set before it is ever placed inside a quoted openFDA search term.
import { badRequest } from './errors.js';

const MAX_TERM_LENGTH = 100;
// Letters (any language), digits, spaces and a few punctuation marks common in drug names
// such as "5/325", "O'Neil", "co-amoxiclav", "Tylenol, Extra Strength".
const TERM_PATTERN = /^[\p{L}\p{N} .,'\/&-]+$/u;
// Route names look like "ORAL", "RESPIRATORY (INHALATION)", "INTRA-ARTICULAR".
const ROUTE_PATTERN = /^[A-Z][A-Z ,()\-]{1,49}$/;
// openFDA label ids are UUIDs.
const ID_PATTERN = /^[a-f0-9-]{8,64}$/i;

function single(value, name) {
  if (Array.isArray(value)) throw badRequest(`"${name}" must be provided only once.`);
  return value;
}

export function parseSearchTerm(raw, name = 'q') {
  const value = single(raw, name);
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw badRequest(`"${name}" must be text.`);
  const term = value.trim().replace(/\s+/g, ' ');
  if (term === '') return '';
  if (term.length > MAX_TERM_LENGTH) {
    throw badRequest(`Search text must be ${MAX_TERM_LENGTH} characters or fewer.`);
  }
  if (term.length < 2) throw badRequest('Search text must be at least 2 characters.');
  if (!TERM_PATTERN.test(term)) {
    throw badRequest(
      "Search text can only contain letters, numbers, spaces and . , ' / & -",
    );
  }
  return term;
}

export function parseRoute(raw) {
  const value = single(raw, 'route');
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') throw badRequest('"route" must be text.');
  const route = value.trim().toUpperCase();
  if (!ROUTE_PATTERN.test(route)) throw badRequest('"route" is not a valid route of administration.');
  return route;
}

export function parseEnum(raw, name, allowed) {
  const value = single(raw, name);
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') throw badRequest(`"${name}" must be text.`);
  const match = allowed.find((option) => option.toLowerCase() === value.trim().toLowerCase());
  if (!match) throw badRequest(`"${name}" must be one of: ${allowed.join(', ')}.`);
  return match;
}

export function parseInteger(raw, name, { min, max, fallback }) {
  const value = single(raw, name);
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw badRequest(`"${name}" must be a whole number.`);
  }
  const n = Number(value);
  if (n < min || n > max) throw badRequest(`"${name}" must be between ${min} and ${max}.`);
  return n;
}

export function parseBoolean(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true';
}

export function parseLabelId(raw) {
  if (typeof raw !== 'string' || !ID_PATTERN.test(raw)) {
    throw badRequest('That medication id is not valid.');
  }
  return raw.toLowerCase();
}
