import type { Matchup } from './types';

export interface BacktestResult {
  game_id: number;
  predicted_margin: number;
  actual_margin: number;
  abs_error: number;
  su_pick: 'home' | 'away';
  su_correct: boolean;
  market_spread: number;
  ats_pick: 'home' | 'away';
  ats_correct: boolean;
}

export function fmtSpread(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  return num > 0 ? `+${num.toFixed(1)}` : num.toFixed(1);
}

export function pickTeamName(game: Matchup, pick: 'home' | 'away'): string {
  return pick === 'home' ? game.homeTeam : game.awayTeam;
}