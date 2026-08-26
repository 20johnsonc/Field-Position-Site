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
    conference: str(row.Conference ?? row.conference ?? row.Conference_Name ?? row.conf, '—'),
    year: num(row.Year ?? row.year ?? row.Season ?? row.season, 2026),
    netRating: num(row['Net Rating'] ?? row.net_rating ?? row.power_rating ?? row.net_ppa),
    record: str(row.Record ?? row.record ?? row.w_l, '0-0'),
    sos: num(row.SOS ?? row.sos ?? row.strength_of_schedule),
    sor: num(row.SOR ?? row.sor ?? row.strength_of_record),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    
    trajectory: Array.isArray(row.trajectory) ? (row.trajectory as any[]) : [],
    gameLog: Array.isArray(row.game_log) ? (row.game_log as any[]) : [],
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

export function formatRating(val: number | null | undefined): string {
  if (val === undefined || val === null || Number.isNaN(val)) {
    return 'N/A';
  }
  return val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1);
}

export function slugifyTeam(team: string): string {
  return team
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function computeRanks(
  rankings: Ranking[],
  year: number,
): Map<string, { overallRank: number; confRank: number }> {
  const seasonRows = rankings.filter((row) => row.year === year);
  const byNet = [...seasonRows].sort((a, b) => b.netRating - a.netRating);
  const map = new Map<string, { overallRank: number; confRank: number }>();

  byNet.forEach((row, i) => {
    map.set(row.team, { overallRank: i + 1, confRank: 0 });
  });

  const byConference = new Map<string, Ranking[]>();
  for (const row of seasonRows) {
    if (!byConference.has(row.conference)) byConference.set(row.conference, []);
    byConference.get(row.conference)!.push(row);
  }
  for (const teams of byConference.values()) {
    teams.sort((a, b) => b.netRating - a.netRating).forEach((row, i) => {
      const entry = map.get(row.team);
      if (entry) entry.confRank = i + 1;
    });
  }

  return map;
}

export function computeEfficiencyRange(
  trajectories: {
    teams: Record<string, Record<string, { adj_off_ppa: number; adj_def_value: number }[]>>;
  }
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const teamData of Object.values(trajectories.teams)) {
    for (const yearData of Object.values(teamData)) {
      for (const entry of yearData) {
        const eff = entry.adj_off_ppa + entry.adj_def_value;
        if (eff < min) min = eff;
        if (eff > max) max = eff;
      }
    }
  }
  return { min, max };
}

export function normalizeGameMargins<
  T extends {
    location: 'Home' | 'Away';
    actual_margin: number;
    predicted_margin: number;
    beat_expectation_by: number;
  },
>(entries: T[]): T[] {
  return entries.map((g) =>
    g.location === 'Home'
      ? {
          ...g,
          actual_margin: g.actual_margin,
          predicted_margin: g.predicted_margin,
          beat_expectation_by: g.beat_expectation_by,
        }
      : g
  );
}