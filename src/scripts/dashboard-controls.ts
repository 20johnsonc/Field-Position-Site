import { renderVisibleTopPlays, bindTopPlaysToggle } from './pbpTopPlaysClient';

let initialized = false;

type SortDirection = Record<string, boolean>;

const sortDirection: SortDirection = {};

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

function applyMatchupFilters(): void {
  const selectedYear = getSelectValue('matchupYearFilter');
  const selectedConf = getSelectValue('confFilter');
  const selectedWeek = getSelectValue('weekFilter');

  const cards = document.querySelectorAll<HTMLElement>('.matchup-card');
  let visibleCount = 0;

  cards.forEach((card) => {
    const year = card.dataset.year ?? '';
    const week = card.dataset.week ?? '';
    const homeConf = card.dataset.homeConf ?? '';
    const awayConf = card.dataset.awayConf ?? '';

    const matchesYear = selectedYear === 'ALL' || year === selectedYear;
    const matchesConf =
      selectedConf === 'ALL' || homeConf === selectedConf || awayConf === selectedConf;
    const matchesWeek = selectedWeek === 'ALL' || week === selectedWeek;

    const visible = matchesYear && matchesConf && matchesWeek;
    card.classList.toggle('is-hidden', !visible);
    if (visible) visibleCount += 1;
  });

  document.getElementById('matchupEmptyState')?.classList.toggle('visible', visibleCount === 0);
  updateMatchupRecordStats();
  renderVisibleTopPlays();
}

function updateMatchupRecordStats(): void {
  const cards = document.querySelectorAll<HTMLElement>('.matchup-card:not(.is-hidden)');

  let suTotal = 0;
  let suCorrect = 0;
  let atsTotal = 0;
  let atsCorrect = 0;

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

  const suValueEl = document.getElementById('suStatValue');
  const atsValueEl = document.getElementById('atsStatValue');
  const suPill = document.getElementById('suStatPill');
  const atsPill = document.getElementById('atsStatPill');

  if (suValueEl && suPill) {
    if (suTotal > 0) {
      const pct = Math.round((suCorrect / suTotal) * 100);
      suValueEl.textContent = `${pct}% (${suCorrect}-${suTotal - suCorrect})`;
      suPill.classList.remove('no-data');
    } else {
      suValueEl.textContent = '—';
      suPill.classList.add('no-data');
    }
  }

  if (atsValueEl && atsPill) {
    if (atsTotal > 0) {
      const pct = Math.round((atsCorrect / atsTotal) * 100);
      atsValueEl.textContent = `${pct}% (${atsCorrect}-${atsTotal - atsCorrect})`;
      atsPill.classList.remove('no-data');
    } else {
      atsValueEl.textContent = '—';
      atsPill.classList.add('no-data');
    }
  }
}

// Season total ignores week and conference — only year matters. Queries all
// .matchup-card elements (not just visible ones), since applyMatchupFilters()
// only toggles a .is-hidden class rather than removing games from the DOM.
function updateMatchupSeasonStats(): void {
  const selectedYear = getSelectValue('matchupYearFilter');

  const cards = document.querySelectorAll<HTMLElement>('.matchup-card');

  let suTotal = 0;
  let suCorrect = 0;
  let atsTotal = 0;
  let atsCorrect = 0;

  cards.forEach((card) => {
    if (card.dataset.hasBacktest !== 'true') return;
    if (selectedYear !== 'ALL' && card.dataset.year !== selectedYear) return;

    if (card.dataset.suCorrect !== undefined) {
      suTotal += 1;
      if (card.dataset.suCorrect === 'true') suCorrect += 1;
    }
    if (card.dataset.atsCorrect !== undefined) {
      atsTotal += 1;
      if (card.dataset.atsCorrect === 'true') atsCorrect += 1;
    }
  });

  const suValueEl = document.getElementById('suSeasonValue');
  const atsValueEl = document.getElementById('atsSeasonValue');
  const suPill = document.getElementById('suSeasonPill');
  const atsPill = document.getElementById('atsSeasonPill');

  if (suValueEl && suPill) {
    if (suTotal > 0) {
      const pct = Math.round((suCorrect / suTotal) * 100);
      suValueEl.textContent = `${pct}% (${suCorrect}-${suTotal - suCorrect})`;
      suPill.classList.remove('no-data');
    } else {
      suValueEl.textContent = '—';
      suPill.classList.add('no-data');
    }
  }

  if (atsValueEl && atsPill) {
    if (atsTotal > 0) {
      const pct = Math.round((atsCorrect / atsTotal) * 100);
      atsValueEl.textContent = `${pct}% (${atsCorrect}-${atsTotal - atsCorrect})`;
      atsPill.classList.remove('no-data');
    } else {
      atsValueEl.textContent = '—';
      atsPill.classList.add('no-data');
    }
  }
}

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
  sor: 'sor'
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

    return ascending
      ? String(valueA).localeCompare(String(valueB))
      : String(valueB).localeCompare(String(valueA));
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
  document.getElementById('matchupYearFilter')?.addEventListener('change', () => {
    applyMatchupFilters();
    updateMatchupSeasonStats();
  });
  document.getElementById('confFilter')?.addEventListener('change', applyMatchupFilters);
  document.getElementById('weekFilter')?.addEventListener('change', applyMatchupFilters);

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

  bindTabs();
  bindFilters();
  bindSortHeaders();
  bindTopPlaysToggle();
  populateTeamDropdown();
  switchTab('rankings');
  applyMatchupFilters();
  applyRankingsFilters();
  updateMatchupSeasonStats();
}

export function openPbpModal(gameId: string, year: string, homeTeam: string, awayTeam: string): void {
  window.dispatchEvent(
    new CustomEvent('open-pbp-modal', {
      detail: { gameId, year, homeTeam, awayTeam },
    }),
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
      openPbpModal(gameId, year, homeTeam, awayTeam);
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