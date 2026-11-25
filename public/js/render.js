// View components: medication cards, recall cards and the loading / empty / error states.
import { formatDate, h, icon, productTypeLabel } from './dom.js';

function field(label, value, className = '') {
  if (!value) return null;
  return h('div', { class: `field ${className}`.trim() }, h('dt', { text: label }), h('dd', { text: value }));
}

export function drugCard(drug, { onOpen }) {
  const type = productTypeLabel(drug.productType);
  const updated = formatDate(drug.effectiveDate);
  return h(
    'article',
    { class: 'card drug-card' },
    h(
      'div',
      { class: 'card-badges' },
      type && h('span', { class: `badge badge-type badge-${type.short.toLowerCase()}`, title: type.long, text: type.short }),
      drug.hasBoxedWarning && h('span', { class: 'badge badge-boxed', title: 'This label carries an FDA boxed warning' }, icon('alert', 'icon icon-xs'), 'Boxed warning'),
      drug.routes.slice(0, 3).map((route) => h('span', { class: 'badge badge-route', text: route })),
    ),
    h('h2', { class: 'card-title', text: drug.brandName }),
    drug.genericName && drug.genericName.toLowerCase() !== drug.brandName.toLowerCase()
      ? h('p', { class: 'card-subtitle', text: drug.genericName })
      : null,
    drug.manufacturer && h('p', { class: 'card-meta', text: drug.manufacturer }),
    h(
      'dl',
      { class: 'fields' },
      field('Used for', drug.indications ?? drug.purpose),
      field('Dosage', drug.dosage),
      field('Warnings', drug.warnings, 'field-warning'),
    ),
    h(
      'div',
      { class: 'card-footer' },
      h('span', { class: 'card-date', text: updated ? `Label updated ${updated}` : 'Update date not listed' }),
      h('button', { type: 'button', class: 'btn btn-link', onClick: () => onOpen(drug), 'aria-label': `View full label for ${drug.brandName}` }, 'Full label →'),
    ),
  );
}

const CLASS_HELP = {
  1: 'Class I: use may cause serious health problems or death',
  2: 'Class II: may cause temporary or reversible health problems',
  3: 'Class III: unlikely to cause adverse health consequences',
};

export function recallCard(recall) {
  const severity = `sev-${recall.severityRank}`;
  const initiated = formatDate(recall.initiatedOn);
  const reported = formatDate(recall.reportedOn);
  return h(
    'article',
    { class: `card recall-card ${severity}` },
    h(
      'div',
      { class: 'card-badges' },
      h('span', { class: `badge badge-class ${severity}`, title: CLASS_HELP[recall.severityRank] ?? 'Not yet classified', text: recall.classification }),
      h('span', { class: `badge badge-status status-${recall.status.toLowerCase()}`, text: recall.status }),
      recall.recallNumber && h('span', { class: 'recall-number', text: recall.recallNumber }),
    ),
    h('h2', { class: 'card-title card-title-sm clamp-3', title: recall.product, text: recall.product }),
    recall.firm && h('p', { class: 'card-meta', text: recall.firm }),
    h(
      'dl',
      { class: 'fields' },
      field('Reason', recall.reason, 'field-warning'),
      field('Quantity', recall.quantity),
      field('Distribution', recall.distribution),
    ),
    h(
      'div',
      { class: 'card-footer' },
      h('span', { class: 'card-date', text: initiated ? `Initiated ${initiated}` : 'Initiation date not listed' }),
      reported && h('span', { class: 'card-date', text: `Reported ${reported}` }),
    ),
  );
}

export function skeletons(count = 6) {
  return Array.from({ length: count }, () =>
    h(
      'div',
      { class: 'card skeleton', 'aria-hidden': 'true' },
      h('span', { class: 'sk sk-badge' }),
      h('span', { class: 'sk sk-title' }),
      h('span', { class: 'sk sk-line' }),
      h('span', { class: 'sk sk-line' }),
      h('span', { class: 'sk sk-line short' }),
    ),
  );
}

export function stateBlock({ tone = 'neutral', iconName = 'search', title, message, actions = [] }) {
  return h(
    'div',
    { class: `state state-${tone}`, role: tone === 'error' ? 'alert' : null },
    h('div', { class: 'state-icon' }, icon(iconName, 'icon icon-lg')),
    h('h2', { class: 'state-title', text: title }),
    message && h('p', { class: 'state-message', text: message }),
    actions.length > 0 &&
      h(
        'div',
        { class: 'state-actions' },
        actions.map(({ label, onClick, primary }) =>
          h('button', { type: 'button', class: `btn ${primary ? 'btn-primary' : 'btn-secondary'}`, onClick, text: label }),
        ),
      ),
  );
}

const ERROR_TITLES = {
  RATE_LIMITED: 'The FDA is busy right now',
  UPSTREAM_TIMEOUT: 'The FDA took too long to answer',
  UPSTREAM_UNREACHABLE: 'Could not reach the FDA',
  UPSTREAM_ERROR: 'The FDA service is having problems',
  UPSTREAM_MALFORMED: 'Unexpected response from the FDA',
  NETWORK: 'You appear to be offline',
  INVALID_INPUT: 'Please check your search',
};

export function errorBlock(error, onRetry) {
  return stateBlock({
    tone: 'error',
    iconName: error.code === 'NETWORK' ? 'offline' : 'alert',
    title: ERROR_TITLES[error.code] ?? 'Something went wrong',
    message: error.message,
    actions: error.code === 'INVALID_INPUT' ? [] : [{ label: 'Try again', onClick: onRetry, primary: true }],
  });
}
