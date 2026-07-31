export interface Ranking {
  rank: number | string;
  team: string;
  conference: string;
  year: number;
  netRating: number;
  offRating: number;
  defRating: number;
}

export interface Matchup {
  gameId: number | string;
  week: number | string;
  year: number;
  homeTeam: string;
  awayTeam: string;
  homeConference: string;
  awayConference: string;
  homePoints?: number;
  awayPoints?: number;
  startDate?: string;
  homeWinProb?: number;
  predictedScore?: string;
  predictedMargin?: number;
  predictedTotal?: number;
  marketSpread?: number | null;
  marketTotal?: number | null;
}

export interface PbpPoint {
  play_number?: number;
  play_num?: number;
  cum_ppa?: number;
  cum_net_ppa?: number;
  net_ppa?: number;
  ppa?: number;
  score_diff?: number;
  margin?: number;
}

export interface RankingsFile {
  all_rankings?: Record<string, unknown>[];
  teams?: Record<string, unknown>[];
  generated_at?: string;
}

export interface MatchupsFile {
  games?: Record<string, unknown>[];
  generated_at?: string;
}

export interface FilterOptions {
  rankingYears: number[];
  rankingConferences: string[];
  rankingTeams: string[];
  matchupYears: number[];
  matchupConferences: string[];
  matchupWeeks: number[];
}
