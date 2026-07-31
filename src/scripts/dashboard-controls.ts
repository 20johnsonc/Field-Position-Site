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
  year: 'year',
  netRating: 'netRating',
  offRating: 'offRating',
  defRating: 'defRating',
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
  document.getElementById('matchupYearFilter')?.addEventListener('change', applyMatchupFilters);
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
  populateTeamDropdown();
  switchTab('rankings');
  applyMatchupFilters();
  applyRankingsFilters();
}

export function openPbpModal(gameId: string, homeTeam: string, awayTeam: string): void {
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
    const homeTeam = button.dataset.homeTeam;
    const awayTeam = button.dataset.awayTeam;

    if (gameId && homeTeam && awayTeam) {
      openPbpModal(gameId, homeTeam, awayTeam);
    }
  });
}

bindPbpTriggers();

declare global {
  interface Window {
    openPbpModal?: typeof openPbpModal;
  }
}

window.openPbpModal = openPbpModal;
