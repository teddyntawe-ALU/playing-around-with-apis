// Converts raw openFDA records into the compact, predictable shapes the frontend renders.
// openFDA fields are inconsistent: most are arrays, many are missing. Normalising here keeps
// the UI code simple and means the frontend never depends on openFDA's raw schema.

const first = (value) => (Array.isArray(value) ? value[0] : value) ?? null;
const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []);
// Label text usually repeats its own section heading ("Purpose Pain reliever", "1 INDICATIONS AND
// USAGE ..."). The UI already shows a heading, so drop the leading one.
const LEADING_HEADING =
  /^(?:\d+(?:\.\d+)*\s+)?(?:purposes?|uses|directions|warnings(?: and precautions)?|boxed warning|indications? (?:and|&) usage|dosage (?:and|&) administration|contraindications|adverse reactions|drug interactions|overdosage|storage and handling|(?:in)?active ingredients?(?: \([^)]*\))?)(?!\w)\s*[:.]?\s+/i;

export const stripHeading = (text) => text.replace(LEADING_HEADING, '');

const joined = (value) => {
  const text = list(value).map(stripHeading).join('\n\n').trim();
  return text || null;
};

export function truncate(text, max) {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).replace(/[\s,.;:]+$/, '')}…`;
}

// openFDA dates are "YYYYMMDD" strings; return ISO "YYYY-MM-DD" or null.
export function toIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return null;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const titleCase = (text) =>
  text ? text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : text;

// Label sections shown in the detail view, in reading order.
const LABEL_SECTIONS = [
  ['boxed_warning', 'Boxed warning'],
  ['indications_and_usage', 'Uses / indications'],
  ['purpose', 'Purpose'],
  ['active_ingredient', 'Active ingredient'],
  ['dosage_and_administration', 'Dosage and administration'],
  ['contraindications', 'Contraindications'],
  ['warnings', 'Warnings'],
  ['warnings_and_cautions', 'Warnings and precautions'],
  ['do_not_use', 'Do not use'],
  ['ask_doctor', 'Ask a doctor before use'],
  ['stop_use', 'Stop use and ask a doctor'],
  ['adverse_reactions', 'Adverse reactions'],
  ['drug_interactions', 'Drug interactions'],
  ['pregnancy_or_breast_feeding', 'Pregnancy or breast-feeding'],
  ['pregnancy', 'Pregnancy'],
  ['overdosage', 'Overdosage'],
  ['inactive_ingredient', 'Inactive ingredients'],
  ['storage_and_handling', 'Storage and handling'],
];

export function toLabelSummary(raw) {
  const fda = raw.openfda ?? {};
  const brandName = first(fda.brand_name);
  const genericName = first(fda.generic_name);
  return {
    id: raw.id,
    setId: raw.set_id ?? null,
    brandName: brandName ? brandName.trim() : genericName ? titleCase(genericName) : 'Unnamed product',
    genericName: genericName ? titleCase(genericName) : null,
    manufacturer: first(fda.manufacturer_name),
    routes: list(fda.route).map(titleCase),
    productType: first(fda.product_type),
    substances: list(fda.substance_name).map(titleCase),
    purpose: truncate(joined(raw.purpose), 160),
    indications: truncate(joined(raw.indications_and_usage), 260),
    dosage: truncate(joined(raw.dosage_and_administration), 200),
    warnings: truncate(joined(raw.warnings) ?? joined(raw.warnings_and_cautions), 200),
    hasBoxedWarning: Boolean(joined(raw.boxed_warning)),
    effectiveDate: toIsoDate(raw.effective_time),
  };
}

export function toLabelDetail(raw) {
  const summary = toLabelSummary(raw);
  const sections = LABEL_SECTIONS.map(([key, title]) => ({ key, title, text: joined(raw[key]) })).filter(
    (section) => section.text,
  );
  return {
    ...summary,
    sections,
    dailyMedUrl: summary.setId
      ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${encodeURIComponent(summary.setId)}`
      : null,
  };
}

const SEVERITY_RANK = { 'Class I': 1, 'Class II': 2, 'Class III': 3 };

export function toRecall(raw) {
  const fda = raw.openfda ?? {};
  const location = [raw.city, raw.state, raw.country].filter(Boolean).join(', ');
  return {
    recallNumber: raw.recall_number ?? null,
    eventId: raw.event_id ?? null,
    classification: raw.classification ?? 'Not yet classified',
    severityRank: SEVERITY_RANK[raw.classification] ?? 4,
    status: raw.status ?? 'Unknown',
    product: raw.product_description ? raw.product_description.trim() : 'No product description provided',
    brandName: first(fda.brand_name),
    firm: raw.recalling_firm ?? null,
    reason: raw.reason_for_recall ?? null,
    quantity: raw.product_quantity || null,
    distribution: raw.distribution_pattern || null,
    codeInfo: truncate(raw.code_info, 240),
    voluntary: raw.voluntary_mandated ?? null,
    location: location || null,
    initiatedOn: toIsoDate(raw.recall_initiation_date),
    classifiedOn: toIsoDate(raw.center_classification_date),
    reportedOn: toIsoDate(raw.report_date),
  };
}
