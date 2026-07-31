import type {
  FilterOptions,
  Matchup,
  MatchupsFile,
  Ranking,
  RankingsFile,
} from './types';

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'string') {
    // Strip % signs, commas, and whitespace
    value = value.replace(/[%,\s]/g, '');
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback = ''): string {
  return value != null && value !== '' ? String(value) : fallback;
}

export function normalizeRankings(raw: RankingsFile | Record<string, unknown>[]): Ranking[] {
  let rows: Record<string, unknown>[] = [];

  if (Array.isArray(raw)) {
    rows = raw;
  } else if (Array.isArray(raw.all_rankings)) {
    rows = raw.all_rankings;
  } else if (Array.isArray(raw.teams)) {
    rows = raw.teams;
  }

  return rows.map((row) => ({
    rank: row.Rank ?? row.rank ?? '—',
    team: str(row.Team ?? row.team, 'Unknown'),
    conference: str(row.Conference ?? row.conference ?? row.Conference_Name, '—'),
    year: num(row.Year ?? row.year ?? row.Season ?? row.season),
    netRating: num(row['Net Rating'] ?? row['Net rating'] ?? row.net_rating ?? row.power_rating),
    offRating: num(row['Offense Rating'] ?? row['Offense rating'] ?? row.adj_off),
    defRating: num(row['Defense Rating'] ?? row['Defense rating'] ?? row.adj_def),
  }));
}

export function normalizeMatchups(raw: MatchupsFile | Record<string, unknown>[]): Matchup[] {
  const games = Array.isArray(raw) ? raw : raw.games ?? [];

  return games.map((game) => {
    const homeTeam = str(game.home_team ?? game.homeTeam, 'Home');
    const awayTeam = str(game.away_team ?? game.awayTeam, 'Away');
    const startDate = str(game.start_date ?? game.startDate);
    const yearFromDate = startDate ? new Date(startDate).getFullYear() : NaN;

    return {
      gameId: game.game_id ?? game.gameId ?? '',
      week: game.week ?? '—',
      year: num(game.season ?? game.year, Number.isFinite(yearFromDate) ? yearFromDate : 0),
      homeTeam,
      awayTeam,
      homeConference: str(game.home_conference),
      awayConference: str(game.away_conference),
      homePoints: game.home_points != null ? num(game.home_points) : undefined,
      awayPoints: game.away_points != null ? num(game.away_points) : undefined,
      startDate: startDate || undefined,
      homeWinProb: game.home_win_prob != null ? num(game.home_win_prob) : game.win_prob != null ? num(game.win_prob) : undefined,
      predictedScore: game.predicted_score ? str(game.predicted_score) : undefined,
      predictedMargin: game.predicted_margin != null ? num(game.predicted_margin) : undefined,
      predictedTotal: game.predicted_total != null ? num(game.predicted_total) : undefined,
      marketSpread: game.market_spread != null ? num(game.market_spread) : null,
      marketTotal: game.market_total != null ? num(game.market_total) : null,
    };
  });
}

export function getSeasonLabel(rankings: Ranking[]): string {
  const years = rankings.map((row) => row.year).filter(Boolean);
  if (!years.length) return 'Analytics Dashboard';

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  return minYear === maxYear ? `${maxYear} Season` : `${minYear}–${maxYear} Seasons`;
}

export function buildTeamConferenceMap(rankings: Ranking[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rankings) {
    if (row.team && row.conference) {
      map[row.team] = row.conference;
    }
  }
  return map;
}

export function resolveMatchupConferences(
  matchup: Matchup,
  teamConfMap: Record<string, string>,
): { homeConf: string; awayConf: string } {
  return {
    homeConf: matchup.homeConference || teamConfMap[matchup.homeTeam] || '',
    awayConf: matchup.awayConference || teamConfMap[matchup.awayTeam] || '',
  };
}

export function buildFilterOptions(rankings: Ranking[], matchups: Matchup[]): FilterOptions {
  const teamConfMap = buildTeamConferenceMap(rankings);

  const rankingYears = [...new Set(rankings.map((row) => row.year).filter(Boolean))].sort((a, b) => b - a);
  const rankingConferences = [...new Set(rankings.map((row) => row.conference).filter(Boolean))].sort();
  const rankingTeams = [...new Set(rankings.map((row) => row.team).filter(Boolean))].sort();

  const matchupYears = new Set<number>();
  const matchupConferences = new Set<string>();
  const matchupWeeks = new Set<number>();

  for (const game of matchups) {
    if (game.year) matchupYears.add(game.year);

    const { homeConf, awayConf } = resolveMatchupConferences(game, teamConfMap);
    if (homeConf) matchupConferences.add(homeConf);
    if (awayConf) matchupConferences.add(awayConf);
    if (typeof game.week === 'number') matchupWeeks.add(game.week);
  }

  return {
    rankingYears,
    rankingConferences,
    rankingTeams,
    matchupYears: [...matchupYears].sort((a, b) => b - a),
    matchupConferences: [...matchupConferences].sort(),
    matchupWeeks: [...matchupWeeks].sort((a, b) => a - b),
  };
}

export function fmtDate(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime())
    ? dateStr
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatRating(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}
