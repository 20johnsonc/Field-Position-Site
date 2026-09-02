import { renderVisibleTopPlays, bindTopPlaysToggle } from './pbpTopPlaysClient';
import { renderMatchupWeek, type ClientGame } from './matchupRenderer';
import type { BacktestResult } from '../lib/betting';
import type { DisplayPlay } from '../lib/pbp';

let initialized = false;
let teamConfMap: Record<string, string> = {};
let seasonRecords: Record<string, { su: { correct: number; total: number }; ats: { correct: number; total: number } }> = {};
let seasonRecordsLoaded = false;
let weeksByYear: Record<string, number[]> = {};

type SortDirection = Record<string, boolean>;
const sortDirection: SortDirection = {};

function readEmbeddedJson<T>(id: string, fallback: T): T {
  const el = document.getElementById(id);
  if (!el?.textContent) return fallback;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return fallback;
  }
}

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getSelectValue(id: string): string {
  const element = document.getElementById(id) as HTMLSelectElement | null;
  return element?.value ?? 'ALL';
}

function setSelectOptions(id: string, values: string[], allLabel: string): void {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = `<option value="ALL">${allLabel}</option>`;

  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  if (values.includes(currentValue)) {
    select.value = currentValue;
  }
}

function switchTab(tab: 'matchups' | 'rankings'): void {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-tab') === tab);
  });
  document.getElementById('matchupsPanel')?.classList.toggle('active', tab === 'matchups');
  document.getElementById('rankingsPanel')?.classList.toggle('active', tab === 'rankings');
}

// --- MATCHUPS: year/week changes fetch a new slice; conference changes just toggle DOM ---

async function loadWeekAndRender(): Promise<void> {
  const year = getSelectValue('matchupYearFilter');
  const week = getSelectValue('weekFilter');
  if (year === 'ALL' || week === 'ALL') return;

  const [matchupsRaw, topPlaysByGame, backtestRaw] = await Promise.all([
    fetchJson<any>(`/data/matchups/${year}/week-${week}.json`, []),
    fetchJson<Record<string, DisplayPlay[]>>(`/data/pbp-top-plays/${year}/week-${week}.json`, {}),
    fetchJson<Record<string, BacktestResult>>(`/data/backtest/${year}/week-${week}.json`, {}),
  ]);

  // Handles both a bare array and a { games: [...] } wrapper, same as the
  // build script's loadWeekFile() does server-side.
  const matchups: ClientGame[] = Array.isArray(matchupsRaw) ? matchupsRaw : (matchupsRaw?.games ?? []);

  const backtestByGame = new Map<number, BacktestResult>(
    Object.entries(backtestRaw).map(([id, row]) => [Number(id), row])
  );

  renderMatchupWeek(matchups, teamConfMap, backtestByGame, topPlaysByGame);

  const pbpDataScript = document.getElementById('pbp-week-data');
  if (pbpDataScript) {
    pbpDataScript.textContent = JSON.stringify(topPlaysByGame);
  }

  applyMatchupConferenceFilter();
  await updateMatchupSeasonStats();
}

function applyMatchupConferenceFilter(): void {
  const selectedConf = getSelectValue('confFilter');
  const cards = document.querySelectorAll<HTMLElement>('.matchup-card');
  let visibleCount = 0;

  cards.forEach((card) => {
    const homeConf = card.dataset.homeConf ?? '';
    const awayConf = card.dataset.awayConf ?? '';
    const visible = selectedConf === 'ALL' || homeConf === selectedConf || awayConf === selectedConf;
    card.classList.toggle('is-hidden', !visible);
    if (visible) visibleCount += 1;
  });

  document.getElementById('matchupEmptyState')?.classList.toggle('visible', visibleCount === 0);
  updateMatchupRecordStats();
  renderVisibleTopPlays();
}

// Unchanged logic — still correct now, because only one week's cards ever
// exist in the DOM, so "all cards" and "this week's cards" are the same set.
function updateMatchupRecordStats(): void {
  const cards = document.querySelectorAll<HTMLElement>('.matchup-card:not(.is-hidden)');

  let suTotal = 0, suCorrect = 0, atsTotal = 0, atsCorrect = 0;

  cards.forEach((card) => {
    if (card.dataset.hasBacktest !== 'true') return;
    if (card.dataset.suCorrect !== undefined) {
      suTotal += 1;
      if (card.dataset.suCorrect === 'true') suCorrect += 1;
    }
    if (card.dataset.atsCorrect !== undefined) {
      atsTotal += 1;
      if (card.dataset.atsCorrect === 'true') atsCorrect += 1;
    }
  });

  setStatPill('suStatValue', 'suStatPill', suCorrect, suTotal);
  setStatPill('atsStatValue', 'atsStatPill', atsCorrect, atsTotal);
}

// Now reads a pre-aggregated file instead of scanning the DOM (the DOM only
// ever holds one week's games post-refactor, so it can't answer a season total).
async function updateMatchupSeasonStats(): Promise<void> {
  if (!seasonRecordsLoaded) {
    seasonRecords = await fetchJson('/data/season-records.json', {});
    seasonRecordsLoaded = true;
  }
  const year = getSelectValue('matchupYearFilter');
  const record = seasonRecords[year];

  if (record) {
    setStatPill('suSeasonValue', 'suSeasonPill', record.su.correct, record.su.total);
    setStatPill('atsSeasonValue', 'atsSeasonPill', record.ats.correct, record.ats.total);
  } else {
    setStatPill('suSeasonValue', 'suSeasonPill', 0, 0);
    setStatPill('atsSeasonValue', 'atsSeasonPill', 0, 0);
  }
}

function setStatPill(valueId: string, pillId: string, correct: number, total: number): void {
  const valueEl = document.getElementById(valueId);
  const pillEl = document.getElementById(pillId);
  if (!valueEl || !pillEl) return;

  if (total > 0) {
    const pct = Math.round((correct / total) * 100);
    valueEl.textContent = `${pct}% (${correct}-${total - correct})`;
    pillEl.classList.remove('no-data');
  } else {
    valueEl.textContent = '—';
    pillEl.classList.add('no-data');
  }
}

// --- RANKINGS: unchanged — still one full-year table, toggled client-side ---

function populateTeamDropdown(): void {
  const confSelect = document.getElementById('rankingsConfFilter') as HTMLSelectElement | null;
  const teamSelect = document.getElementById('rankingsTeamFilter') as HTMLSelectElement | null;
  if (!confSelect || !teamSelect) return;

  const selectedConf = confSelect.value;
  const currentTeam = teamSelect.value;
  const teams = new Set<string>();

  document.querySelectorAll<HTMLElement>('#rankingsBody tr').forEach((row) => {
    const conference = row.dataset.conference ?? '';
    const team = row.dataset.team ?? '';
    if (team && (selectedConf === 'ALL' || conference === selectedConf)) {
      teams.add(team);
    }
  });

  const sortedTeams = [...teams].sort();
  setSelectOptions('rankingsTeamFilter', sortedTeams, 'All Teams');

  if (sortedTeams.includes(currentTeam)) {
    teamSelect.value = currentTeam;
  }
}

function populateWeekDropdown(year: string, preferredWeek?: string): void {
  const select = document.getElementById('weekFilter') as HTMLSelectElement | null;
  if (!select) return;

  const weeks = weeksByYear[year] ?? [];
  const previousValue = preferredWeek ?? select.value;

  select.innerHTML = '';
  weeks.forEach((week) => {
    const option = document.createElement('option');
    option.value = String(week);
    option.textContent = `Week ${week}`;
    select.appendChild(option);
  });

  if (weeks.map(String).includes(previousValue)) {
    select.value = previousValue;
  } else if (weeks.length > 0) {
    // No matching week in the new year (e.g. 2026 doesn't have a week 17
    // yet) — default to the most recent week instead of silently landing
    // on whatever the browser picks.
    select.value = String(Math.max(...weeks));
  }
}

async function handleMatchupYearChange(): Promise<void> {
  const year = getSelectValue('matchupYearFilter');
  populateWeekDropdown(year);
  await loadWeekAndRender();
}

function applyRankingsFilters(): void {
  const selectedYear = getSelectValue('rankingsYearFilter');
  const selectedConf = getSelectValue('rankingsConfFilter');
  const selectedTeam = getSelectValue('rankingsTeamFilter');

  const rows = document.querySelectorAll<HTMLElement>('#rankingsBody tr');
  let visibleCount = 0;

  rows.forEach((row) => {
    const year = row.dataset.year ?? '';
    const conference = row.dataset.conference ?? '';
    const team = row.dataset.team ?? '';

    const matchesYear = selectedYear === 'ALL' || year === selectedYear;
    const matchesConf = selectedConf === 'ALL' || conference === selectedConf;
    const matchesTeam = selectedTeam === 'ALL' || team === selectedTeam;

    const visible = matchesYear && matchesConf && matchesTeam;
    row.classList.toggle('is-hidden', !visible);
    if (visible) visibleCount += 1;
  });

  document.getElementById('rankingsEmptyState')?.classList.toggle('visible', visibleCount === 0);
}

const sortKeyToDataset: Record<string, keyof DOMStringMap> = {
  rank: 'rank',
  team: 'team',
  conference: 'conference',
  record: 'record',
  year: 'year',
  netRating: 'netRating',
  sos: 'sos',
  sor: 'sor',
};

function sortRankingsTable(key: string): void {
  const tbody = document.getElementById('rankingsBody');
  const datasetKey = sortKeyToDataset[key];
  if (!tbody || !datasetKey) return;

  sortDirection[key] = !sortDirection[key];
  const ascending = sortDirection[key];

  const rows = [...tbody.querySelectorAll<HTMLElement>('tr')];
  rows.sort((rowA, rowB) => {
    const valueA = rowA.dataset[datasetKey] ?? '';
    const valueB = rowB.dataset[datasetKey] ?? '';

    const numericA = Number(valueA);
    const numericB = Number(valueB);

    if (!Number.isNaN(numericA) && !Number.isNaN(numericB) && valueA !== '' && valueB !== '') {
      return ascending ? numericA - numericB : numericB - numericA;
    }

    return ascending ? String(valueA).localeCompare(String(valueB)) : String(valueB).localeCompare(String(valueA));
  });

  rows.forEach((row) => tbody.appendChild(row));
  applyRankingsFilters();
}

function bindSortHeaders(): void {
  document.querySelectorAll<HTMLElement>('.rank-table th.sortable').forEach((header) => {
    header.addEventListener('click', () => {
      const key = header.dataset.sortKey;
      if (key) sortRankingsTable(key);
    });
  });
}

function bindFilters(): void {
  document.getElementById('matchupYearFilter')?.addEventListener('change', handleMatchupYearChange);
  document.getElementById('weekFilter')?.addEventListener('change', loadWeekAndRender);
  document.getElementById('confFilter')?.addEventListener('change', applyMatchupConferenceFilter);

  document.getElementById('rankingsYearFilter')?.addEventListener('change', applyRankingsFilters);
  document.getElementById('rankingsConfFilter')?.addEventListener('change', () => {
    populateTeamDropdown();
    applyRankingsFilters();
  });
  document.getElementById('rankingsTeamFilter')?.addEventListener('change', applyRankingsFilters);
}

function bindTabs(): void {
  document.querySelectorAll<HTMLElement>('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab as 'matchups' | 'rankings' | undefined;
      if (tab) switchTab(tab);
    });
  });
}

export function initDashboardControls(): void {
  if (initialized) return;
  initialized = true;

  teamConfMap = readEmbeddedJson('team-conf-map', {});
  const manifest = readEmbeddedJson<{ years: number[]; weeks_by_year: Record<string, number[]> }>(
    'matchups-manifest',
    { years: [], weeks_by_year: {} }
  );
  weeksByYear = manifest.weeks_by_year;

  bindTabs();
  bindFilters();
  bindSortHeaders();
  bindTopPlaysToggle();
  populateTeamDropdown();
  switchTab('rankings');

  applyMatchupConferenceFilter();
  applyRankingsFilters();
  updateMatchupSeasonStats();
}

export function openPbpModal(gameId: string, year: string, homeTeam: string, awayTeam: string): void {
  window.dispatchEvent(
    new CustomEvent('open-pbp-modal', { detail: { gameId, year, homeTeam, awayTeam } })
  );
}

function bindPbpTriggers(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('[data-pbp-trigger]');
    if (!button) return;

    const gameId = button.dataset.gameId;
    const year = button.dataset.year;
    const homeTeam = button.dataset.homeTeam;
    const awayTeam = button.dataset.awayTeam;

    if (gameId && homeTeam && awayTeam) {
      openPbpModal(gameId, year ?? '', homeTeam, awayTeam);
    }
  });
}

function bindRowExpansion(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const trigger = target?.closest<HTMLElement>('[data-row-trigger]');
    if (!trigger) return;

    const wrap = trigger.closest('.row-wrap');
    if (!wrap) return;

    const isExpanded = wrap.classList.toggle('expanded');
    trigger.setAttribute('aria-expanded', String(isExpanded));
  });
}

bindPbpTriggers();
bindRowExpansion();

declare global {
  interface Window {
    openPbpModal?: typeof openPbpModal;
  }
}
window.openPbpModal = openPbpModal;