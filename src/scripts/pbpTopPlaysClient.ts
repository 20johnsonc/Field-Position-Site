import { getTopByMagnitude, getPlayImpact, formatEpa, type DisplayPlay } from '../lib/pbp';

const PLAYS_DATA_SCRIPT_ID = 'pbp-week-data';
const PANEL_ID = 'topPlaysPanel';
const WRAPPER_ID = 'topPlaysWrapper';
const TOGGLE_ID = 'topPlaysToggle';
const LIMIT = 10;

let playsByGame: Record<string, DisplayPlay[]> | null = null;

// Parsed once and cached — the embedded JSON doesn't change after page
// load, only which games are currently visible does.
function loadPlaysData(): Record<string, DisplayPlay[]> {
  if (playsByGame) return playsByGame;

  const scriptEl = document.getElementById(PLAYS_DATA_SCRIPT_ID);
  if (!scriptEl?.textContent) {
    playsByGame = {};
    return playsByGame;
  }

  try {
    playsByGame = JSON.parse(scriptEl.textContent) as Record<string, DisplayPlay[]>;
  } catch (err) {
    console.error('Failed to parse embedded weekly play data', err);
    playsByGame = {};
  }
  return playsByGame;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Recomputes and re-renders the "Top Plays" panel from whichever
// .matchup-card elements are currently visible (not .is-hidden). Call
// this any time the visible set changes — i.e. from inside
// applyMatchupFilters(), right after it toggles card visibility.
export function renderVisibleTopPlays(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return; // panel isn't on this page/tab — nothing to do

  const data = loadPlaysData();

  const visibleGameIds = new Set(
    Array.from(document.querySelectorAll<HTMLElement>('.matchup-card:not(.is-hidden)'))
      .map((card) => card.dataset.gameId)
      .filter((id): id is string => Boolean(id))
  );

  const candidatePlays: DisplayPlay[] = [];
  visibleGameIds.forEach((gameId) => {
    const plays = data[gameId];
    if (plays) candidatePlays.push(...plays);
  });

  const top = getTopByMagnitude(candidatePlays, LIMIT);

  const countEl = document.getElementById(`${TOGGLE_ID}Count`);
  if (countEl) countEl.textContent = String(top.length);

  if (top.length === 0) {
    panel.innerHTML = `<div class="empty">No notable plays yet.</div>`;
    return;
  }

  const itemsHtml = top
    .map((play, index) => {
      const impact = getPlayImpact(play);
      const impactHtml = impact
        ? `<span class="week-play-impact ${impact.role}">${impact.icon} ${escapeHtml(
            impact.team
          )} ${formatEpa(impact.value)}</span>`
        : '';

      return `
        <li class="week-play-item">
          <span class="week-play-rank">${index + 1}</span>
          <div class="week-play-body">
            <div class="week-play-matchup">${escapeHtml(play.away)} @ ${escapeHtml(
        play.home
      )} · Play #${play.playNumber}</div>
            <div class="week-play-text">${escapeHtml(play.playText)}</div>
          </div>
          ${impactHtml}
        </li>`;
    })
    .join('');

  panel.innerHTML = `<ol class="week-plays-list">${itemsHtml}</ol>`;
}

// Wires up the collapse/expand toggle. Closed by default — this only
// needs to run once, unlike renderVisibleTopPlays which reruns on every
// filter change. Safe to call even if the panel isn't on the page.
export function bindTopPlaysToggle(): void {
  const toggle = document.getElementById(TOGGLE_ID);
  const wrapper = document.getElementById(WRAPPER_ID);
  if (!toggle || !wrapper) return;

  toggle.addEventListener('click', () => {
    const isExpanded = wrapper.classList.toggle('expanded');
    toggle.setAttribute('aria-expanded', String(isExpanded));
  });
}