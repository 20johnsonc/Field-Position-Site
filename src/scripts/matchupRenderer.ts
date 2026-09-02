import { fmtDate, slugifyTeam } from '../lib/data';
import { fmtSpread, pickTeamName, type BacktestResult } from '../lib/betting';
import { getPlayImpact, formatEpa, type DisplayPlay } from '../lib/pbp';

export interface ClientGame {
  game_id: number;
  year: number;
  week: number;
  home_team: string;
  away_team: string;
  home_points?: number;
  away_points?: number;
  start_date?: string | null;
  predicted_margin?: number | null;
  predicted_total?: number | null;
  predicted_score?: string;
  market_spread?: number | null;
  market_total?: number | null;
  home_win_prob?: number | null;
  away_win_prob?: number | null;
}

function conferenceFor(team: string, teamConfMap: Record<string, string>) {
  return teamConfMap[team] ?? 'Other';
}

function playsListHtml(topPlays: DisplayPlay[]): string {
  if (!topPlays.length) return '';
  const items = topPlays
    .map((play, i) => {
      const impact = getPlayImpact(play);
      const impactHtml = impact
        ? `<span class="play-impact ${impact.role}">${impact.icon} ${impact.team} ${formatEpa(impact.value)}</span>`
        : '';
      return `<li class="play-item"><span class="play-rank">${i + 1}</span><span class="play-text">${escapeHtml(play.playText)}</span>${impactHtml}</li>`;
    })
    .join('');
  return `<div class="plays-box"><span class="dl">Top Plays (EPA)</span><ol class="plays-list">${items}</ol></div>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function clampProb(raw: number | null | undefined): number | null {
  if (raw == null || isNaN(raw)) return null;
  const pct = raw <= 1.0 && raw > 0 ? raw * 100 : raw;
  return Math.min(Math.max(pct, 0), 100);
}

// --- Mirrors MatchupRow.astro (completed games) ---
export function renderMatchupRow(
  game: ClientGame,
  teamConfMap: Record<string, string>,
  backtest: BacktestResult | undefined,
  topPlays: DisplayPlay[]
): string {
  const homeConf = conferenceFor(game.home_team, teamConfMap);
  const awayConf = conferenceFor(game.away_team, teamConfMap);
  const hasBacktest = !!backtest;
  const suClass = backtest ? (backtest.su_correct ? 'win' : 'loss') : '';
  const atsClass = backtest ? (backtest.ats_correct ? 'win' : 'loss') : '';
  const isAwayWinner = (game.away_points ?? 0) > (game.home_points ?? 0);
  const isHomeWinner = (game.home_points ?? 0) > (game.away_points ?? 0);

  const backtestDetailHtml =
    hasBacktest && backtest
      ? `<div class="detail-grid">
        <div class="detail-box"><span class="dl">Straight up</span>
          <div>Pick: <strong>${pickTeamName(game as any, backtest.su_pick)}</strong> —
          <span class="${suClass === 'win' ? 'txt-win' : 'txt-loss'}">${backtest.su_correct ? 'Correct' : 'Wrong'}</span></div>
        </div>
        <div class="detail-box"><span class="dl">Spread (ATS)</span>
          <div>MKT ${fmtSpread(backtest.market_spread)} / MODEL ${fmtSpread(backtest.predicted_margin)}</div>
          <div>Actual ${fmtSpread(backtest.actual_margin)} — Pick: ${pickTeamName(game as any, backtest.ats_pick)}
          (<span class="${atsClass === 'win' ? 'txt-win' : 'txt-loss'}">${backtest.ats_correct ? '✓' : '✗'}</span>)</div>
        </div>
      </div>`
      : '';

  const resultsHtml =
    hasBacktest && backtest
      ? `<span class="tag ${suClass}"><small>SU</small> ${backtest.su_correct ? '✓' : '✗'}</span>
       <span class="tag ${atsClass}"><small>ATS</small> ${backtest.ats_correct ? '✓' : '✗'}</span>`
      : `<span class="pill-muted">—</span>`;

  return `
    <div class="matchup-card row-wrap"
      data-year="${game.year}" data-week="${game.week}"
      data-home-conf="${homeConf}" data-away-conf="${awayConf}"
      data-game-id="${game.game_id}" data-home-team="${game.home_team}" data-away-team="${game.away_team}"
      data-has-backtest="${hasBacktest}"
      ${hasBacktest ? `data-su-correct="${backtest!.su_correct}" data-ats-correct="${backtest!.ats_correct}"` : ''}>
      <button type="button" class="game-row" data-row-trigger aria-expanded="false">
        <div class="teams-stack">
          <div class="team-row">
            <a href="/teams/${game.year}/${slugifyTeam(game.away_team)}/" class="team-link ${isAwayWinner ? 'winner' : 'loser'}" onclick="event.stopPropagation()">${game.away_team}</a>
            <span class="score-num ${isAwayWinner ? 'winner' : 'loser'}">${game.away_points}</span>
          </div>
          <div class="team-row">
            <a href="/teams/${game.year}/${slugifyTeam(game.home_team)}/" class="team-link ${isHomeWinner ? 'winner' : 'loser'}" onclick="event.stopPropagation()">${game.home_team}</a>
            <span class="score-num ${isHomeWinner ? 'winner' : 'loser'}">${game.home_points}</span>
          </div>
        </div>
        <div class="right-col">
          <div class="results">${resultsHtml}</div>
          <span class="chev" aria-hidden="true">›</span>
        </div>
      </button>
      <div class="row-detail">
        ${backtestDetailHtml}
        ${playsListHtml(topPlays)}
        <button type="button" class="pbp-btn" data-pbp-trigger
          data-game-id="${game.game_id}" data-year="${game.year}"
          data-home-team="${game.home_team}" data-away-team="${game.away_team}">
          <svg class="btn-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span>View Play-by-Play Chart</span>
        </button>
      </div>
    </div>`;
}

// --- Mirrors MatchupCard.astro (upcoming games) ---
export function renderMatchupCard(game: ClientGame, teamConfMap: Record<string, string>): string {
  const homeConf = conferenceFor(game.home_team, teamConfMap);
  const awayConf = conferenceFor(game.away_team, teamConfMap);
  const dateTag = fmtDate(game.start_date ?? undefined);

  const homeWinProbNum = clampProb(game.home_win_prob);
  const awayWinProbNum = clampProb(game.away_win_prob);

  const modelSpread = game.predicted_margin ?? null;
  const predTotal = game.predicted_total ?? null;

  const awayGaugeHtml =
    awayWinProbNum !== null
      ? `<div class="prob-gauge" style="--prob: ${awayWinProbNum}%;" title="${game.away_team} Win Probability: ${awayWinProbNum.toFixed(1)}%">
          <div class="gauge-center"><span>${Math.round(awayWinProbNum)}%</span></div>
        </div>`
      : '';
  const homeGaugeHtml =
    homeWinProbNum !== null
      ? `<div class="prob-gauge" style="--prob: ${homeWinProbNum}%;" title="${game.home_team} Win Probability: ${homeWinProbNum.toFixed(1)}%">
          <div class="gauge-center"><span>${Math.round(homeWinProbNum)}%</span></div>
        </div>`
      : '';

  const analyticsHtml =
    game.predicted_margin !== undefined
      ? `<div class="analytics-grid">
          <div class="stat-box">
            <span class="stat-label">Spread</span>
            <div class="stat-comparison">
              <span class="mkt"><small>MKT</small> ${game.market_spread != null ? game.market_spread : '<span class="na">N/A</span>'}</span>
              <span class="divider">/</span>
              <span class="model"><small>MODEL</small> <strong>${fmtSpread(modelSpread)}</strong></span>
            </div>
          </div>
          <div class="stat-box">
            <span class="stat-label">Total</span>
            <div class="stat-comparison">
              <span class="mkt"><small>MKT</small> ${game.market_total != null ? game.market_total : '<span class="na">N/A</span>'}</span>
              <span class="divider">/</span>
              <span class="model"><small>MODEL</small> <strong>${predTotal != null ? Number(predTotal).toFixed(1) : 'N/A'}</strong></span>
            </div>
          </div>
        </div>`
      : '';

  return `
    <article class="card matchup-card"
      data-year="${game.year}" data-week="${game.week}"
      data-home-conf="${homeConf}" data-away-conf="${awayConf}"
      data-game-id="${game.game_id}" data-home-team="${game.home_team}" data-away-team="${game.away_team}"
      data-has-backtest="false">
      <header class="card-head">
        <div class="week-tag">
          <span>WK ${game.week}</span>
          ${dateTag ? `<span class="dot-sep">•</span><time>${dateTag}</time>` : ''}
        </div>
      </header>
      <div class="card-body">
        <div class="matchup-grid">
          <div class="team-col">
            <a href="/teams/${game.year}/${slugifyTeam(game.away_team)}/" class="team-link" title="${game.away_team}">
              <span class="away-team">${game.away_team}</span>
            </a>
            ${awayGaugeHtml}
          </div>
          <div class="vs-divider">@</div>
          <div class="team-col">
            <a href="/teams/${game.year}/${slugifyTeam(game.home_team)}/" class="team-link" title="${game.home_team}">
              <span class="home-team">${game.home_team}</span>
            </a>
            ${homeGaugeHtml}
          </div>
        </div>
        ${analyticsHtml}
      </div>
    </article>`;
}

export function renderMatchupWeek(
  games: ClientGame[],
  teamConfMap: Record<string, string>,
  backtestByGame: Map<number, BacktestResult>,
  topPlaysByGame: Record<string, DisplayPlay[]>
) {
  const completed = games.filter((g) => g.home_points != null && g.away_points != null);
  const upcoming = games.filter((g) => g.home_points == null || g.away_points == null);

  const rowList = document.getElementById('matchupRowList');
  const grid = document.getElementById('matchupGrid');

  if (rowList) {
    rowList.innerHTML = completed
      .map((g) => renderMatchupRow(g, teamConfMap, backtestByGame.get(g.game_id), topPlaysByGame[String(g.game_id)]?.slice(0, 5) ?? []))
      .join('');
  }
  if (grid) {
    grid.innerHTML = upcoming.map((g) => renderMatchupCard(g, teamConfMap)).join('');
  }
}