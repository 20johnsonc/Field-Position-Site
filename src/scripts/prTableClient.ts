// src/scripts/prTableClient.ts
import {
  buildRows, sortRows, filterRows, tableHtml, tableFields, views, PRIMARY_FIELD,
  viewsApply, hasAdjustedData,
  type Kind, type Side, type TableRow,
} from '../lib/prTable';
import {
  axisFieldOptions, axisViewOptions, axisLabel, buildCrossPoints, scatterSvgHtml, isStatInverted,
  type AxisSpec,
} from '../lib/prScatter';

interface YearPayload { year: number; teams: Record<string, any> }
type Mode = 'table' | 'scatter';

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

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Tracks every document/window-level listener this module has added, so a
// re-run (this page's site uses Astro's ClientRouter -- soft navigations
// reuse the same document/window across page swaps, so listeners bound to
// them outlive the DOM elements they were meant to work with) can remove
// its own previous listeners before adding fresh ones, instead of either
// leaking duplicates or refusing to ever run again.
let globalCleanups: Array<() => void> = [];
function addPageListener(
  target: Document | Window, type: string, handler: (e: any) => void, options?: AddEventListenerOptions,
) {
  target.addEventListener(type, handler, options);
  globalCleanups.push(() => target.removeEventListener(type, handler, options));
}

export function initPrTable(): void {
  // Tear down whatever a previous run of this function attached, whether
  // that was on this exact page (revisited via a soft navigation) or a
  // different page entirely (navigated away from this one) -- either way,
  // stale document/window listeners referencing a torn-down DOM must go
  // before anything else happens.
  globalCleanups.forEach((fn) => fn());
  globalCleanups = [];

  const root = document.getElementById('pr-table-root');
  if (!root) return; // this page doesn't have the table/scatter component -- nothing else to do

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const yearSelect = $<HTMLSelectElement>('pt-year');
  const viewSelect = $<HTMLSelectElement>('pt-view');
  const confSelect = $<HTMLSelectElement>('pt-conf');
  const searchInput = $<HTMLInputElement>('pt-search');
  const minInput = $<HTMLInputElement>('pt-min');
  const tabPassing = $<HTMLButtonElement>('pt-tab-passing');
  const tabRushing = $<HTMLButtonElement>('pt-tab-rushing');
  const tabOverall = $<HTMLButtonElement>('pt-tab-overall');
  const basisRaw = $<HTMLButtonElement>('pt-basis-raw');
  const basisAdj = $<HTMLButtonElement>('pt-basis-adj');
  const basisNote = $<HTMLElement>('pt-basis-note');
  const viewField = $<HTMLElement>('pt-view-field');
  const btnOffense = $<HTMLButtonElement>('pt-offense');
  const btnDefense = $<HTMLButtonElement>('pt-defense');
  const modeTable = $<HTMLButtonElement>('pt-mode-table');
  const modeScatter = $<HTMLButtonElement>('pt-mode-scatter');
  const themeBtn = $<HTMLButtonElement>('scatter-theme-btn');
  const tableControls = $<HTMLElement>('pt-table-controls');
  const axisRow = $<HTMLElement>('pt-axis-row');
  const tableWrap = $<HTMLElement>('pt-table-wrap');
  const scatterWrap = $<HTMLElement>('pt-scatter-wrap');
  const table = $<HTMLTableElement>('pt-table');
  const scatterEl = $<HTMLElement>('pt-scatter');
  const tooltip = $<HTMLElement>('pr-scatter-tooltip');
  const emptyState = $<HTMLElement>('pt-empty');
  const baseUrl = root.dataset.base || '';

  if (scatterWrap) {
    const isLight = localStorage.getItem('pr-chart-theme') === 'light';
    if (isLight) {
      scatterWrap.classList.add('theme-light');
    }
    if (themeBtn) {
      themeBtn.classList.toggle('is-light', isLight);
      themeBtn.innerHTML = isLight
        ? '<span class="theme-icon"></span> Theme: Light'
        : '<span class="theme-icon"></span> Theme: Dark';
    }
  }
  themeBtn?.addEventListener('click', () => {
    if (!scatterWrap) return;
    scatterWrap.classList.toggle('theme-light');
    const isLight = scatterWrap.classList.contains('theme-light');
    localStorage.setItem('pr-chart-theme', isLight ? 'light' : 'dark');

    themeBtn.classList.toggle('is-light', isLight);
    themeBtn.innerHTML = isLight ? '<span class="theme-icon"></span> Theme: Light' : '<span class="theme-icon"></span> Theme: Dark';
  });

  const xKindSel = $<HTMLSelectElement>('pt-x-kind');
  const xViewSel = $<HTMLSelectElement>('pt-x-view');
  const xFieldSel = $<HTMLSelectElement>('pt-x-field');
  const yKindSel = $<HTMLSelectElement>('pt-y-kind');
  const yViewSel = $<HTMLSelectElement>('pt-y-view');
  const yFieldSel = $<HTMLSelectElement>('pt-y-field');

  const cache = new Map<number, YearPayload>();
  const seed = readEmbeddedJson<YearPayload | null>('pt-seed-year', null);
  if (seed) cache.set(seed.year, seed);

  const params = new URLSearchParams(location.search);
  const KINDS: Kind[] = ['passing', 'rushing', 'overall'];
  const asKind = (v: string | null, fb: Kind): Kind => (KINDS.includes(v as Kind) ? (v as Kind) : fb);
  const adjustedFromUrl = params.get('adj') === '1';
  const parseAxis = (prefix: 'x' | 'y', fallback: AxisSpec): AxisSpec => {
    const kind = params.get(`${prefix}k`) as Kind | null;
    if (!kind || !KINDS.includes(kind)) return { ...fallback, adj: adjustedFromUrl };
    return {
      kind, view: params.get(`${prefix}v`) || 'total',
      field: params.get(`${prefix}f`) || fallback.field, adj: adjustedFromUrl,
    };
  };

  const state = {
    mode: (params.get('mode') as Mode) || 'table',
    year: Number(params.get('year')) || seed?.year || Number(yearSelect?.value) || new Date().getFullYear(),
    kind: asKind(params.get('kind'), 'passing'),
    adjusted: adjustedFromUrl,
    side: (params.get('side') as Side) || 'offense',
    view: params.get('view') || 'total',
    conf: params.get('conf') || 'ALL',
    search: params.get('q') || '',
    min: Number(params.get('min')) || 0,
    sortKey: params.get('sort') || 'success_rate',
    ascending: params.get('dir') === 'asc',
    x: parseAxis('x', { kind: 'passing', view: 'total', field: 'ppa' }),
    y: parseAxis('y', { kind: 'rushing', view: 'total', field: 'ppa' }),
  };
  const pinned = new Set<string>((params.get('pin') || '').split(',').filter(Boolean));

  const teamHref = (team: string) =>
    `${baseUrl}/teams/${state.year}/${slugify(team)}/`.replace(/\/{2,}/g, '/');

  function syncUrl() {
    const p = new URLSearchParams();
    p.set('mode', state.mode);
    p.set('year', String(state.year));
    p.set('side', state.side);
    if (state.adjusted) p.set('adj', '1');
    if (state.conf !== 'ALL') p.set('conf', state.conf);
    if (state.search) p.set('q', state.search);
    if (state.min) p.set('min', String(state.min));
    if (state.mode === 'table') {
      p.set('kind', state.kind);
      if (state.view !== 'total') p.set('view', state.view);
      p.set('sort', state.sortKey);
      if (state.ascending) p.set('dir', 'asc');
    } else {
      p.set('xk', state.x.kind); p.set('xv', state.x.view); p.set('xf', state.x.field);
      p.set('yk', state.y.kind); p.set('yv', state.y.view); p.set('yf', state.y.field);
    }
    if (pinned.size) p.set('pin', [...pinned].join(','));
    history.replaceState(null, '', `?${p.toString()}`);
  }

  // ---- Table-mode option lists --------------------------------------------------
  function populateViewOptions() {
    if (!viewSelect) return;
    const opts = views(state.kind, state.adjusted);
    const prev = state.view;
    viewSelect.innerHTML = opts.map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
    viewSelect.value = opts.some((o) => o.key === prev) ? prev : 'total';
    state.view = viewSelect.value;
    // Zones/directions only exist for raw passing/rushing, so the picker is hidden
    // (inline style, not [hidden]: .pt-field's display:flex would override it).
    if (viewField) viewField.style.display = viewsApply(state.kind, state.adjusted) ? '' : 'none';
  }

  // Columns differ per kind/basis (adjusted has no yardage, etc.), so a sort key that
  // doesn't exist in the new column set falls back to the primary stat.
  function ensureSortKey() {
    const valid = new Set(['team', 'conference', 'volume', 'share',
      ...tableFields(state.kind, state.adjusted).map((f) => f.key)]);
    if (!valid.has(state.sortKey)) { state.sortKey = PRIMARY_FIELD[state.kind]; state.ascending = false; }
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

  // ---- Scatter-mode axis pickers (each fully independent) -----------------------
  function populateAxisSide(kindSel: HTMLSelectElement | null, viewSel: HTMLSelectElement | null, fieldSel: HTMLSelectElement | null, spec: AxisSpec) {
    if (!kindSel || !viewSel || !fieldSel) return;
    kindSel.value = spec.kind;
    const vOpts = axisViewOptions(spec.kind, !!spec.adj);
    viewSel.innerHTML = vOpts.map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
    viewSel.value = vOpts.some((o) => o.key === spec.view) ? spec.view : 'total';
    spec.view = viewSel.value;
    viewSel.disabled = vOpts.length < 2; // Overall / adjusted have no zone split
    const fOpts = axisFieldOptions(spec.kind, !!spec.adj);
    fieldSel.innerHTML = fOpts.map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
    fieldSel.value = fOpts.some((o) => o.key === spec.field) ? spec.field : 'success_rate';
    spec.field = fieldSel.value;
  }
  function populateAxisOptions() {
    populateAxisSide(xKindSel, xViewSel, xFieldSel, state.x);
    populateAxisSide(yKindSel, yViewSel, yFieldSel, state.y);
  }

  async function getYear(year: number): Promise<YearPayload> {
    if (cache.has(year)) return cache.get(year)!;
    const url = `${baseUrl}/data/passing-rushing/${year}.json`.replace(/\/{2,}/g, '/');
    const data = await fetchJson<YearPayload>(url, { year, teams: {} });
    cache.set(year, data);
    return data;
  }

  // ---- Table mode -------------------------------------------------------------------
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

  function renderTable(payload: YearPayload) {
    const rows = filterRows(buildRows(payload.teams, state.kind, state.side, state.view, state.adjusted),
      { conf: state.conf, search: state.search, min: state.min, pinned });
    let sorted = sortRows(rows, state.sortKey, tableFields(state.kind, state.adjusted), state.ascending);
    const pinnedRows = sorted.filter((r) => pinned.has(r.team));
    const restRows = sorted.filter((r) => !pinned.has(r.team));
    sorted = [...pinnedRows, ...restRows];
    if (table) table.innerHTML = tableHtml({ rows: sorted, kind: state.kind, view: state.view, pinned, teamHref, adjusted: state.adjusted });
    bindSortHeaders();
    bindPinCheckboxes();
    updateSortIndicators();
    return sorted.length;
  }

  // ---- Scatter mode: tooltip -----------------------------------------------------
  // A single set of document-level listeners, registered once (not re-added on
  // every chart re-render), so the tooltip can't get stuck no matter how the
  // hover state got out of sync -- a re-render mid-hover destroys the old dot
  // without ever firing its mouseleave, which is the classic way this breaks.
  let hoveredDot: SVGCircleElement | null = null;

  function hideTooltip() {
    hoveredDot = null;
    if (tooltip) tooltip.hidden = true;
  }

  function showTooltip(dot: SVGCircleElement, clientX: number, clientY: number) {
    if (!tooltip) return;
    hoveredDot = dot;
    tooltip.innerHTML = `
      <strong>${dot.dataset.team}</strong>
      <span class="tt-conf">${dot.dataset.conf}</span>
      <span>${axisLabel(state.x)}: <b>${dot.dataset.x}</b></span>
      <span>${axisLabel(state.y)}: <b>${dot.dataset.y}</b></span>`;
    tooltip.hidden = false;
    const pad = 14;
    const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    let left = clientX + pad, top = clientY + pad;
    if (left + w > window.innerWidth - 8) left = clientX - w - pad;
    if (top + h > window.innerHeight - 8) top = clientY - h - pad;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  // Registered once, outside bindScatterInteractions, so it isn't re-added
  // (and left orphaned) on every filter/search/year re-render.
  addPageListener(document, 'mousemove', (e: MouseEvent) => {
    if (!hoveredDot) return;
    // The tooltip itself has pointer-events:none, so this always reflects
    // what's really under the cursor -- if it's not our tracked dot (or any
    // dot at all, e.g. the chart just re-rendered), the hover is stale.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (!under || !under.classList.contains('dot')) hideTooltip();
  });
  addPageListener(document, 'mouseleave', hideTooltip); // cursor leaves the whole window
  addPageListener(window, 'blur', hideTooltip); // switching tabs/apps mid-hover
  addPageListener(document, 'click', (e: MouseEvent) => {
    const target = e.target as Element;
    if (!target || !target.classList.contains('dot')) hideTooltip();
  }, { capture: true });

  function bindScatterInteractions() {
    if (!scatterEl) return;
    hideTooltip();
    scatterEl.querySelectorAll<SVGElement>('.dot').forEach((dot) => {
      dot.addEventListener('mouseenter', (e) =>
        showTooltip(dot as SVGCircleElement, (e as MouseEvent).clientX, (e as MouseEvent).clientY)
      );
      dot.addEventListener('mousemove', (e) =>
        showTooltip(dot as SVGCircleElement, (e as MouseEvent).clientX, (e as MouseEvent).clientY)
      );
      dot.addEventListener('mouseleave', hideTooltip);
      dot.addEventListener('focus', () => {
        const r = dot.getBoundingClientRect();
        showTooltip(dot as SVGCircleElement, r.left + r.width / 2, r.top);
      });
      dot.addEventListener('blur', hideTooltip);
      const go = () => {
        hideTooltip();
        const team = dot.dataset.team;
        if (team) window.location.href = teamHref(team);
      };
      dot.addEventListener('click', go);
      dot.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') go();
      });
    });
  }

  function renderScatter(payload: YearPayload) {
    if (!scatterEl) return 0;
    try {
      const points = buildCrossPoints({
        teams: payload.teams, side: state.side, x: state.x, y: state.y,
        conf: state.conf, search: state.search, min: state.min, pinned,
      });
      scatterEl.innerHTML = scatterSvgHtml({
        points, x: state.x, y: state.y, xLabel: axisLabel(state.x), yLabel: axisLabel(state.y),
        invertX: isStatInverted(state.side, state.x.field), invertY: isStatInverted(state.side, state.y.field), pinned,
      });
      bindScatterInteractions();
      return points.length;
    } catch (err) {
      console.error('[passing-rushing scatter] render failed:', err);
      scatterEl.innerHTML = `<p class="scatter-empty">Couldn't draw the chart: ${err instanceof Error ? err.message : String(err)}</p>`;
      return 1;
    }
  }

  // ---- Shared render ----------------------------------------------------------------
  async function render() {
    const payload = await getYear(state.year);
    populateConfOptions(payload.teams);

    // Belt-and-suspenders alongside the explicit call in setMode(): whatever
    // path got us here, a non-scatter render should never leave the tooltip
    // showing.
    if (state.mode !== 'scatter') hideTooltip();

    // Asking for adjusted numbers from a season exported before the adjusted block
    // existed: say so instead of showing a bare "no teams match" message.
    const missingAdj = state.adjusted && !hasAdjustedData(payload.teams);
    if (emptyState) {
      emptyState.textContent = missingAdj
        ? 'No opponent-adjusted data for this season yet -- re-run the passing/rushing export.'
        : 'No teams match these filters.';
    }
    const count = state.mode === 'table' ? renderTable(payload) : renderScatter(payload);

    if (tableControls) tableControls.hidden = state.mode !== 'table';
    if (tableWrap) tableWrap.hidden = state.mode !== 'table';
    if (axisRow) axisRow.hidden = state.mode !== 'scatter';
    if (scatterWrap) scatterWrap.hidden = state.mode !== 'scatter';
    if (themeBtn) themeBtn.style.display = state.mode === 'scatter' ? 'inline-flex' : 'none';
    emptyState?.classList.toggle('visible', count === 0);
    syncUrl();
  }

  // ---- Controls -----------------------------------------------------------------
  if (yearSelect) yearSelect.value = String(state.year);
  tabPassing?.classList.toggle('active', state.kind === 'passing');
  tabRushing?.classList.toggle('active', state.kind === 'rushing');
  tabOverall?.classList.toggle('active', state.kind === 'overall');
  btnOffense?.classList.toggle('active', state.side === 'offense');
  btnDefense?.classList.toggle('active', state.side === 'defense');
  modeTable?.classList.toggle('active', state.mode === 'table');
  modeScatter?.classList.toggle('active', state.mode === 'scatter');
  if (searchInput) searchInput.value = state.search;
  if (minInput) minInput.value = state.min ? String(state.min) : '';

  const BASIS_NOTES = {
    raw: 'Raw team production by target zone and rush direction. Not opponent-adjusted — a team’s schedule strength isn’t reflected here.',
    adj: 'Opponent-adjusted using each team’s latest rating. Offense = what the team would produce against an average FBS defense; Defense Allowed = what an average FBS offense would produce against it. Att/Carries/Plays are still raw volume.',
  };
  function syncBasisUi() {
    basisRaw?.classList.toggle('active', !state.adjusted);
    basisAdj?.classList.toggle('active', state.adjusted);
    if (basisNote) basisNote.textContent = state.adjusted ? BASIS_NOTES.adj : BASIS_NOTES.raw;
  }

  ensureSortKey();
  populateViewOptions();
  populateAxisOptions();
  syncBasisUi();

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
    tabOverall?.classList.toggle('active', kind === 'overall');
    populateViewOptions();
    render();
  };
  tabPassing?.addEventListener('click', () => setKind('passing'));
  tabRushing?.addEventListener('click', () => setKind('rushing'));
  tabOverall?.addEventListener('click', () => setKind('overall'));

  // The single Raw / Adjusted switch. It applies to table AND scatter: the scatter's
  // axes each carry their own `adj` flag, so both are flipped together here and their
  // view/stat pickers are rebuilt (adjusted has fewer stats and no zone views).
  const setAdjusted = (adjusted: boolean) => {
    if (state.adjusted === adjusted) return;
    state.adjusted = adjusted;
    state.x.adj = adjusted;
    state.y.adj = adjusted;
    ensureSortKey();
    populateViewOptions();
    populateAxisOptions();
    syncBasisUi();
    render();
  };
  basisRaw?.addEventListener('click', () => setAdjusted(false));
  basisAdj?.addEventListener('click', () => setAdjusted(true));

  const setSide = (side: Side) => {
    state.side = side;
    btnOffense?.classList.toggle('active', side === 'offense');
    btnDefense?.classList.toggle('active', side === 'defense');
    render();
  };
  btnOffense?.addEventListener('click', () => setSide('offense'));
  btnDefense?.addEventListener('click', () => setSide('defense'));

  const setMode = (mode: Mode) => {
    state.mode = mode;
    modeTable?.classList.toggle('active', mode === 'table');
    modeScatter?.classList.toggle('active', mode === 'scatter');
    // The tooltip is a position:fixed element that lives outside
    // #pt-scatter-wrap, so hiding that wrapper does nothing to it -- it has
    // its own independent hidden state that only showTooltip/hideTooltip
    // touch. Leaving Scatter mode has to hide it explicitly, immediately,
    // rather than waiting on some future mousemove to notice.
    if (mode !== 'scatter') hideTooltip();
    render();
  };
  modeTable?.addEventListener('click', () => setMode('table'));
  modeScatter?.addEventListener('click', () => setMode('scatter'));

  xKindSel?.addEventListener('change', () => { state.x.kind = xKindSel.value as Kind; populateAxisSide(xKindSel, xViewSel, xFieldSel, state.x); render(); });
  xViewSel?.addEventListener('change', () => { state.x.view = xViewSel.value; render(); });
  xFieldSel?.addEventListener('change', () => { state.x.field = xFieldSel.value; render(); });
  yKindSel?.addEventListener('change', () => { state.y.kind = yKindSel.value as Kind; populateAxisSide(yKindSel, yViewSel, yFieldSel, state.y); render(); });
  yViewSel?.addEventListener('change', () => { state.y.view = yViewSel.value; render(); });
  yFieldSel?.addEventListener('change', () => { state.y.field = yFieldSel.value; render(); });

  render();
}