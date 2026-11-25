// Application controller: owns UI state, keeps it in sync with the URL, fetches data and renders.
import { api } from './api.js';
import { formatDate, formatNumber } from './dom.js';
import { drugCard, errorBlock, recallCard, skeletons, stateBlock } from './render.js';
import { openDetail } from './detail.js';
import {
  DRUG_REFINE_FIELDS,
  DRUG_SORTS,
  RECALL_REFINE_FIELDS,
  RECALL_SORTS,
  refineItems,
  sortItems,
  toSafeTerm,
  validateTerm,
} from './sort.js';

const PAGE_SIZE = 24;

const $ = (id) => document.getElementById(id);
const els = {
  tabs: [...document.querySelectorAll('[role="tab"]')],
  form: $('search-form'),
  input: $('search-input'),
  error: $('search-error'),
  chips: $('quick-chips'),
  title: $('page-title'),
  lede: $('page-lede'),
  filterGroups: [...document.querySelectorAll('.filters')],
  route: $('filter-route'),
  type: $('filter-type'),
  sortDrugs: $('sort-drugs'),
  klass: $('filter-class'),
  status: $('filter-status'),
  sortRecalls: $('sort-recalls'),
  refine: $('refine-input'),
  refresh: $('refresh-btn'),
  summary: $('summary'),
  results: $('results'),
  loadMore: $('load-more'),
  servedBy: $('served-by'),
};

const TAB_COPY = {
  drugs: {
    title: 'Look up a medication',
    lede: 'Official labelling from the U.S. Food and Drug Administration: uses, dosage and warnings.',
    placeholder: 'Search by brand or generic name, e.g. ibuprofen',
    noun: ['medication label', 'medication labels'],
  },
  recalls: {
    title: 'Check for drug recalls',
    lede: 'FDA enforcement reports: which products were recalled, why, and how serious it is.',
    placeholder: 'Search a medication or company, e.g. metformin',
    noun: ['recall report', 'recall reports'],
  },
};

const state = {
  tab: 'drugs',
  q: '',
  drugs: { route: '', type: '', sort: 'relevance' },
  recalls: { classification: '', status: '', sort: 'newest' },
  refine: '',
  items: [],
  meta: null,
  loading: false,
  appending: false,
  error: null,
};

let controller = null;

// ---------- URL <-> state ----------

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  state.tab = p.get('tab') === 'recalls' ? 'recalls' : 'drugs';
  const { term, error } = validateTerm(p.get('q') ?? '');
  state.q = error ? '' : term;
  state.drugs.route = p.get('route') ?? '';
  state.drugs.type = ['otc', 'rx'].includes(p.get('type')) ? p.get('type') : '';
  state.recalls.classification = p.get('class') ?? '';
  state.recalls.status = p.get('status') ?? '';
  const sort = p.get('sort');
  state.drugs.sort = state.tab === 'drugs' && sort in DRUG_SORTS ? sort : 'relevance';
  state.recalls.sort = state.tab === 'recalls' && sort in RECALL_SORTS ? sort : 'newest';
  state.refine = '';
}

function writeUrl({ push = true } = {}) {
  const p = new URLSearchParams();
  if (state.tab === 'recalls') p.set('tab', 'recalls');
  if (state.q) p.set('q', state.q);
  if (state.tab === 'drugs') {
    if (state.drugs.route) p.set('route', state.drugs.route);
    if (state.drugs.type) p.set('type', state.drugs.type);
    if (state.drugs.sort !== 'relevance') p.set('sort', state.drugs.sort);
  } else {
    if (state.recalls.classification) p.set('class', state.recalls.classification);
    if (state.recalls.status) p.set('status', state.recalls.status);
    if (state.recalls.sort !== 'newest') p.set('sort', state.recalls.sort);
  }
  const url = p.size ? `?${p}` : window.location.pathname;
  if (url === `${window.location.search}` || (url === window.location.pathname && !window.location.search)) return;
  window.history[push ? 'pushState' : 'replaceState'](null, '', url);
}

// ---------- Controls ----------

function setOption(select, value) {
  select.value = value;
  if (select.value !== value) select.value = ''; // unknown value from the URL → reset
  return select.value;
}

function syncControls() {
  const copy = TAB_COPY[state.tab];
  els.tabs.forEach((tab) => {
    const active = tab.dataset.tab === state.tab;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  els.filterGroups.forEach((group) => {
    group.hidden = group.dataset.for !== state.tab;
  });
  els.title.textContent = copy.title;
  els.lede.textContent = copy.lede;
  els.input.placeholder = copy.placeholder;
  els.input.value = state.q;
  els.refine.value = state.refine;
  state.drugs.route = setOption(els.route, state.drugs.route);
  state.drugs.type = setOption(els.type, state.drugs.type);
  els.sortDrugs.value = state.drugs.sort;
  state.recalls.classification = setOption(els.klass, state.recalls.classification);
  state.recalls.status = setOption(els.status, state.recalls.status);
  els.sortRecalls.value = state.recalls.sort;
  document.title = state.q ? `${state.q} · ${state.tab === 'drugs' ? 'Medications' : 'Recalls'} · RxLens` : 'RxLens — FDA medication labels & recalls';
}

function showFieldError(message) {
  els.error.textContent = message ?? '';
  els.error.hidden = !message;
  els.input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function hasActiveFilters() {
  return state.tab === 'drugs'
    ? Boolean(state.drugs.route || state.drugs.type)
    : Boolean(state.recalls.classification || state.recalls.status);
}

function clearFilters() {
  if (state.tab === 'drugs') Object.assign(state.drugs, { route: '', type: '' });
  else Object.assign(state.recalls, { classification: '', status: '' });
  syncControls();
  writeUrl();
  load();
}

// ---------- Data ----------

async function load({ append = false, refresh = false } = {}) {
  controller?.abort();
  const mine = new AbortController();
  controller = mine;

  const tab = state.tab;
  const params =
    tab === 'drugs'
      ? { q: state.q, route: state.drugs.route, type: state.drugs.type }
      : { q: state.q, classification: state.recalls.classification, status: state.recalls.status };
  params.limit = PAGE_SIZE;
  params.skip = append ? state.items.length : 0;
  if (refresh) params.refresh = 1;

  state.loading = true;
  state.appending = append;
  state.error = null;
  if (!append) {
    state.items = [];
    state.meta = null;
  }
  render();

  try {
    const request = tab === 'drugs' ? api.searchDrugs : api.searchRecalls;
    const { body, servedBy } = await request(params, mine.signal);
    if (controller !== mine) return;
    state.items = append ? [...state.items, ...body.results] : body.results;
    state.meta = body.meta;
    if (servedBy) els.servedBy.textContent = servedBy;
  } catch (err) {
    if (err.name === 'AbortError' || controller !== mine) return;
    state.error = err;
  }
  state.loading = false;
  state.appending = false;
  render();
}

// ---------- Rendering ----------

function visibleItems() {
  const isDrugs = state.tab === 'drugs';
  const refined = refineItems(state.items, state.refine, isDrugs ? DRUG_REFINE_FIELDS : RECALL_REFINE_FIELDS);
  return isDrugs ? sortItems(refined, state.drugs.sort, DRUG_SORTS) : sortItems(refined, state.recalls.sort, RECALL_SORTS);
}

function renderSummary(visibleCount) {
  const [one, many] = TAB_COPY[state.tab].noun;
  if (state.loading && !state.appending) {
    els.summary.textContent = state.q ? `Searching the FDA database for “${state.q}”…` : 'Loading the latest FDA data…';
    return;
  }
  if (!state.meta) {
    els.summary.textContent = '';
    return;
  }
  const { total, lastUpdated, cached } = state.meta;
  const parts = [];
  const subject = state.q ? ` for “${state.q}”` : state.tab === 'drugs' ? ' · most recently updated' : ' · most recent';
  if (total === 0) parts.push(`No ${many}${subject}`);
  else if (state.refine) parts.push(`${formatNumber(visibleCount)} of ${formatNumber(state.items.length)} loaded ${many} match “${state.refine}”`);
  else parts.push(`Showing ${formatNumber(state.items.length)} of ${formatNumber(total)} ${total === 1 ? one : many}${subject}`);
  if (lastUpdated) parts.push(`FDA data updated ${formatDate(lastUpdated)}`);
  if (cached) parts.push('cached');
  els.summary.textContent = parts.join(' · ');
}

function render() {
  const items = visibleItems();
  renderSummary(items.length);
  els.results.setAttribute('aria-busy', String(state.loading));
  els.refresh.disabled = state.loading;

  const onOpen = (drug) => openDetail(drug, { onCheckRecalls: checkRecalls });
  let nodes;
  if (state.loading && state.items.length === 0) {
    nodes = skeletons(6);
  } else if (state.error && state.items.length === 0) {
    nodes = [errorBlock(state.error, () => load())];
  } else if (state.items.length === 0) {
    nodes = [emptyState()];
  } else if (items.length === 0) {
    nodes = [
      stateBlock({
        title: 'No loaded results match your refinement',
        message: `None of the ${state.items.length} results on screen contain “${state.refine}”.`,
        actions: [{ label: 'Clear refinement', onClick: () => { state.refine = ''; els.refine.value = ''; render(); } }],
      }),
    ];
  } else {
    nodes = items.map((item) => (state.tab === 'drugs' ? drugCard(item, { onOpen }) : recallCard(item)));
  }
  els.results.className = `results ${nodes.length === 1 && !state.items.length ? 'results-single' : ''}`;
  if (state.appending && state.error) nodes.push(errorBlock(state.error, () => load({ append: true })));
  els.results.replaceChildren(...nodes);

  const more = state.meta && state.items.length < state.meta.total && !state.refine;
  els.loadMore.hidden = !more;
  els.loadMore.disabled = state.loading;
  els.loadMore.textContent = state.loading && state.appending ? 'Loading…' : 'Load more';
}

function emptyState() {
  const actions = [];
  if (hasActiveFilters()) actions.push({ label: 'Clear filters', onClick: clearFilters, primary: true });
  if (state.tab === 'recalls' && state.q) {
    return stateBlock({
      iconName: 'shield',
      title: `No recall reports found for “${state.q}”`,
      message: 'The FDA enforcement database has no matching reports. This is reassuring but not a guarantee — check the spelling or try the generic name.',
      actions,
    });
  }
  return stateBlock({
    title: state.q ? `No FDA labels match “${state.q}”` : 'Nothing to show',
    message: state.q
      ? 'Check the spelling, try the generic name (e.g. “acetaminophen” instead of a brand), or remove filters.'
      : 'Try a search above.',
    actions,
  });
}

// ---------- Actions ----------

function search(rawTerm) {
  const { term, error } = validateTerm(rawTerm);
  showFieldError(error);
  if (error) {
    els.input.focus();
    return;
  }
  state.q = term;
  state.refine = '';
  syncControls();
  writeUrl();
  load();
}

function switchTab(tab, { focus = false } = {}) {
  if (tab === state.tab) return;
  state.tab = tab;
  state.refine = '';
  showFieldError(null);
  syncControls();
  writeUrl();
  load();
  if (focus) els.tabs.find((t) => t.dataset.tab === tab)?.focus();
}

function checkRecalls(name) {
  state.q = toSafeTerm(name);
  state.recalls.classification = '';
  state.recalls.status = '';
  state.tab = 'recalls';
  state.refine = '';
  showFieldError(null);
  syncControls();
  writeUrl();
  load();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Events ----------

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  search(els.input.value);
});

els.input.addEventListener('input', () => {
  if (!els.error.hidden) showFieldError(validateTerm(els.input.value).error);
});

// Clearing the search box (✕ button or select-all + delete then Enter) shows the default listing.
els.input.addEventListener('search', () => {
  if (els.input.value === '' && state.q !== '') search('');
});

els.chips.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-q]');
  if (!chip) return;
  els.input.value = chip.dataset.q;
  search(chip.dataset.q);
});

els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    switchTab(state.tab === 'drugs' ? 'recalls' : 'drugs', { focus: true });
  });
});

function onFilterChange(apply) {
  return (event) => {
    apply(event.target.value);
    writeUrl();
    load();
  };
}
els.route.addEventListener('change', onFilterChange((v) => (state.drugs.route = v)));
els.type.addEventListener('change', onFilterChange((v) => (state.drugs.type = v)));
els.klass.addEventListener('change', onFilterChange((v) => (state.recalls.classification = v)));
els.status.addEventListener('change', onFilterChange((v) => (state.recalls.status = v)));

// Sorting reorders what is already loaded — no extra API call.
els.sortDrugs.addEventListener('change', () => {
  state.drugs.sort = els.sortDrugs.value;
  writeUrl({ push: false });
  render();
});
els.sortRecalls.addEventListener('change', () => {
  state.recalls.sort = els.sortRecalls.value;
  writeUrl({ push: false });
  render();
});

els.refine.addEventListener('input', () => {
  state.refine = els.refine.value.trim();
  render();
});

els.refresh.addEventListener('click', () => load({ refresh: true }));
els.loadMore.addEventListener('click', () => load({ append: true }));

window.addEventListener('popstate', () => {
  readUrl();
  showFieldError(null);
  syncControls();
  load();
});

document.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (event.key === '/' && !typing && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    els.input.focus();
    els.input.select();
  }
});

// ---------- Start ----------

readUrl();
syncControls();
load();
