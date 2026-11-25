// Full-label detail dialog. Fetches the complete label text on demand so search results stay small.
import { api } from './api.js';
import { formatDate, h, icon, productTypeLabel } from './dom.js';
import { errorBlock, stateBlock } from './render.js';

const dialog = document.getElementById('detail-dialog');
const content = document.getElementById('detail-content');
let controller = null;

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close(); // click on the backdrop
});
dialog.addEventListener('close', () => controller?.abort());

function closeButton() {
  return h('button', { type: 'button', class: 'icon-btn detail-close', 'aria-label': 'Close', onClick: () => dialog.close() }, icon('close'));
}

function isDailyMedLink(url) {
  return typeof url === 'string' && url.startsWith('https://dailymed.nlm.nih.gov/');
}

function renderLabel(label, { onCheckRecalls }) {
  const type = productTypeLabel(label.productType);
  const updated = formatDate(label.effectiveDate);
  const recallName = label.genericName || label.brandName;

  content.replaceChildren(
    h(
      'header',
      { class: 'detail-header' },
      closeButton(),
      h(
        'div',
        { class: 'card-badges' },
        type && h('span', { class: `badge badge-type badge-${type.short.toLowerCase()}`, text: type.long }),
        label.routes.map((route) => h('span', { class: 'badge badge-route', text: route })),
      ),
      h('h2', { id: 'detail-title', class: 'detail-title', text: label.brandName }),
      label.genericName && h('p', { class: 'card-subtitle', text: label.genericName }),
      h('p', { class: 'card-meta' }, [label.manufacturer, updated && `Label updated ${updated}`].filter(Boolean).join(' · ')),
      h(
        'div',
        { class: 'detail-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { dialog.close(); onCheckRecalls(recallName); } }, icon('shield', 'icon icon-sm'), `Check recalls for ${recallName}`),
        isDailyMedLink(label.dailyMedUrl) &&
          h('a', { class: 'btn btn-secondary', href: label.dailyMedUrl, target: '_blank', rel: 'noopener' }, 'Open on DailyMed', icon('external', 'icon icon-sm')),
      ),
    ),
    label.sections.length
      ? h(
          'div',
          { class: 'detail-body' },
          label.sections.map((section) =>
            h(
              'section',
              { class: `detail-section ${section.key === 'boxed_warning' ? 'detail-boxed' : ''}`.trim() },
              h('h3', { text: section.title }),
              h('p', { text: section.text }),
            ),
          ),
        )
      : h('p', { class: 'detail-body', text: 'This label has no readable sections.' }),
    h('p', { class: 'detail-footnote', text: 'Source: FDA Structured Product Labeling via openFDA. Always follow the advice of a healthcare professional.' }),
  );
}

export async function openDetail(drug, { onCheckRecalls }) {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  content.replaceChildren(
    h('header', { class: 'detail-header' }, closeButton(), h('h2', { id: 'detail-title', class: 'detail-title', text: drug.brandName })),
    h('div', { class: 'detail-loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading the full FDA label…'),
  );
  if (!dialog.open) dialog.showModal();

  try {
    const { body } = await api.getDrug(drug.id, signal);
    renderLabel(body.result, { onCheckRecalls });
  } catch (err) {
    if (err.name === 'AbortError') return;
    content.replaceChildren(
      h('header', { class: 'detail-header' }, closeButton(), h('h2', { id: 'detail-title', class: 'detail-title', text: drug.brandName })),
      err.code === 'NOT_FOUND'
        ? stateBlock({ title: 'Label no longer available', message: 'The FDA may have replaced this label with a newer version. Try searching again.' })
        : errorBlock(err, () => openDetail(drug, { onCheckRecalls })),
    );
  }
}
