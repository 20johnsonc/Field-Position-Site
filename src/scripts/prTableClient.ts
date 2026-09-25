// src/scripts/prTableClient.ts
import {
  buildRows, sortRows, tableHtml, tableFields, views, PRIMARY_FIELD,
  type Kind, type Side,
} from '../lib/prTable';

interface YearPayload { year: number; teams: Record<string, any> }

function readEmbeddedJson<T>(id: string, fallback: T): T {
  const el = document.getElementById(id);
  if (!el?.textContent) return fallback;
  try { return JSON.parse(el.textContent) as T; } catch { return fallback; }
}

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function initPrTable(): void {
  const root = document.getElementById('pr-table-root');
  if (!root) return;

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const yearSelect = $<HTMLSelectElement>('pt-year');
  const viewSelect = $<HTMLSelectElement>('pt-view');
  const confSelect = $<HTMLSelectElement>('pt-conf');
  const searchInput = $<HTMLInputElement>('pt-search');
  const minInput = $<HTMLInputElement>('pt-min');
  const tabPassing = $<HTMLButtonElement>('pt-tab-passing');
  const tabRushing = $<HTMLButtonElement>('pt-tab-rushing');
  const btnOffense = $<HTMLButtonElement>('pt-offense');
  const btnDefense = $<HTMLButtonElement>('pt-defense');
  const table = $<HTMLTableElement>('pt-table');
  const emptyState = $<HTMLElement>('pt-empty');
  const baseUrl = root.dataset.base || '';

  const cache = new Map<number, YearPayload>();
  const seed = readEmbeddedJson<YearPayload | null>('pt-seed-year', null);
  if (seed) cache.set(seed.year, seed);

  const params = new URLSearchParams(location.search);
  const state = {
    year: Number(params.get('year')) || seed?.year || Number(yearSelect?.value) || new Date().getFullYear(),
    kind: (params.get('kind') as Kind) || 'passing',
    side: (params.get('side') as Side) || 'offense',
    view: params.get('view') || 'total',
    conf: params.get('conf') || 'ALL',
    search: params.get('q') || '',
    min: Number(params.get('min')) || 0,
    sortKey: params.get('sort') || 'success_rate',
    ascending: params.get('dir') === 'asc',
  };
  const pinned = new Set<string>((params.get('pin') || '').split(',').filter(Boolean));

  const teamHref = (team: string) => {
    const slug = team.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${baseUrl}/teams/${state.year}/${slug}/`.replace(/\/{2,}/g, '/');
  };

  function syncUrl() {
    const p = new URLSearchParams();
    p.set('year', String(state.year));
    p.set('kind', state.kind);
    p.set('side', state.side);
    if (state.view !== 'total') p.set('view', state.view);
    if (state.conf !== 'ALL') p.set('conf', state.conf);
    if (state.search) p.set('q', state.search);
    if (state.min) p.set('min', String(state.min));
    p.set('sort', state.sortKey);
    if (state.ascending) p.set('dir', 'asc');
    if (pinned.size) p.set('pin', [...pinned].join(','));
    history.replaceState(null, '', `?${p.toString()}`);
  }

  function populateViewOptions() {
    if (!viewSelect) return;
    const opts = views(state.kind);
    const prev = state.view;
    viewSelect.innerHTML = opts.map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
    viewSelect.value = opts.some((o) => o.key === prev) ? prev : 'total';
    state.view = viewSelect.value;
  }

  function populateConfOptions(teams: Record<string, any>) {
    if (!confSelect) return;
    const prev = state.conf;
    const confs = [...new Set(Object.values(teams).map((t: any) => t.conference).filter(Boolean))].sort();
    confSelect.innerHTML = `<option value="ALL">All Conferences</option>` +
      confs.map((c) => `<option value="${c}">${c}</option>`).join('');
    confSelect.value = confs.includes(prev) ? prev : 'ALL';
    state.conf = confSelect.value;
  }

  async function getYear(year: number): Promise<YearPayload> {
    if (cache.has(year)) return cache.get(year)!;
    const url = `${baseUrl}/data/passing-rushing/${year}.json`.replace(/\/{2,}/g, '/');
    const data = await fetchJson<YearPayload>(url, { year, teams: {} });
    cache.set(year, data);
    return data;
  }

  function bindSortHeaders() {
    table?.querySelectorAll<HTMLElement>('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key!;
        state.ascending = state.sortKey === key ? !state.ascending : false;
        state.sortKey = key;
        render();
      });
    });
  }

  function bindPinCheckboxes() {
    table?.querySelectorAll<HTMLInputElement>('.pin-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        const team = cb.dataset.team!;
        if (cb.checked) pinned.add(team); else pinned.delete(team);
        render();
      });
    });
  }

  function updateSortIndicators() {
    table?.querySelectorAll<HTMLElement>('th.sortable').forEach((th) => {
      th.classList.toggle('active', th.dataset.key === state.sortKey);
      th.classList.toggle('asc', th.dataset.key === state.sortKey && state.ascending);
    });
  }

  async function render() {
    const payload = await getYear(state.year);
    populateConfOptions(payload.teams);

    let rows = buildRows(payload.teams, state.kind, state.side, state.view);

    if (state.conf !== 'ALL') rows = rows.filter((r) => r.conference === state.conf);
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      rows = rows.filter((r) => r.team.toLowerCase().includes(q));
    }
    if (state.min > 0) rows = rows.filter((r) => r.volume >= state.min || pinned.has(r.team));

    rows = sortRows(rows, state.sortKey, tableFields(state.kind), state.ascending);
    // Pinned rows float to the top, in their sorted relative order, and get a highlight class.
    const pinnedRows = rows.filter((r) => pinned.has(r.team));
    const restRows = rows.filter((r) => !pinned.has(r.team));
    rows = [...pinnedRows, ...restRows];

    if (table) table.innerHTML = tableHtml({ rows, kind: state.kind, view: state.view, pinned, teamHref });
    emptyState?.classList.toggle('visible', rows.length === 0);
    bindSortHeaders();
    bindPinCheckboxes();
    updateSortIndicators();
    syncUrl();
  }

  // ---- Controls -------------------------------------------------------------------
  if (yearSelect) yearSelect.value = String(state.year);
  tabPassing?.classList.toggle('active', state.kind === 'passing');
  tabRushing?.classList.toggle('active', state.kind === 'rushing');
  btnOffense?.classList.toggle('active', state.side === 'offense');
  btnDefense?.classList.toggle('active', state.side === 'defense');
  if (searchInput) searchInput.value = state.search;
  if (minInput) minInput.value = state.min ? String(state.min) : '';
  populateViewOptions();

  yearSelect?.addEventListener('change', () => { state.year = Number(yearSelect.value); render(); });
  viewSelect?.addEventListener('change', () => { state.view = viewSelect.value; render(); });
  confSelect?.addEventListener('change', () => { state.conf = confSelect.value; render(); });
  minInput?.addEventListener('input', () => { state.min = Number(minInput.value) || 0; render(); });
  let searchTimer: number | undefined;
  searchInput?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { state.search = searchInput.value; render(); }, 150);
  });

  const setKind = (kind: Kind) => {
    state.kind = kind;
    state.sortKey = PRIMARY_FIELD[kind];
    state.ascending = false;
    tabPassing?.classList.toggle('active', kind === 'passing');
    tabRushing?.classList.toggle('active', kind === 'rushing');
    populateViewOptions();
    render();
  };
  tabPassing?.addEventListener('click', () => setKind('passing'));
  tabRushing?.addEventListener('click', () => setKind('rushing'));

  const setSide = (side: Side) => {
    state.side = side;
    btnOffense?.classList.toggle('active', side === 'offense');
    btnDefense?.classList.toggle('active', side === 'defense');
    render();
  };
  btnOffense?.addEventListener('click', () => setSide('offense'));
  btnDefense?.addEventListener('click', () => setSide('defense'));

  render();
}