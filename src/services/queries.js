// Builds openFDA search expressions (https://open.fda.gov/apis/query-syntax/).
// In openFDA syntax a space between clauses means OR, and "AND" must be written explicitly.
// Terms reach this module already validated, so wrapping them in quotes is safe.

export const PRODUCT_TYPES = Object.freeze({
  otc: 'HUMAN OTC DRUG',
  rx: 'HUMAN PRESCRIPTION DRUG',
});

export const RECALL_CLASSES = Object.freeze(['Class I', 'Class II', 'Class III']);
export const RECALL_STATUSES = Object.freeze(['Ongoing', 'Completed', 'Terminated']);

const quote = (term) => `"${term}"`;

export function buildLabelQuery({ q = '', route = '', productType = '' }) {
  const clauses = [];
  if (q) {
    clauses.push(
      `(openfda.brand_name:${quote(q)} openfda.generic_name:${quote(q)} openfda.substance_name:${quote(q)})`,
    );
  } else {
    // Default listing: labels that have a brand name, newest first.
    clauses.push('_exists_:openfda.brand_name');
  }
  if (route) clauses.push(`openfda.route:${quote(route)}`);
  if (productType) clauses.push(`openfda.product_type:${quote(PRODUCT_TYPES[productType])}`);

  return {
    search: clauses.join(' AND '),
    // With a search term openFDA's relevance order is most useful; without one, show recent labels.
    sort: q ? undefined : 'effective_time:desc',
  };
}

export function buildRecallQuery({ q = '', classification = '', status = '' }) {
  const clauses = [];
  if (q) {
    clauses.push(
      `(product_description:${quote(q)} openfda.brand_name:${quote(q)} openfda.generic_name:${quote(q)} recalling_firm:${quote(q)})`,
    );
  }
  if (classification) clauses.push(`classification:${quote(classification)}`);
  if (status) clauses.push(`status:${quote(status)}`);

  return {
    search: clauses.length ? clauses.join(' AND ') : undefined,
    sort: 'report_date:desc',
  };
}
