import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface BasketballTeam {
  rank: number; team: string; conference: string | null;
  wins: number | null; losses: number | null;
  adj_off: number; adj_def: number; adj_net: number;
}
export interface BasketballPlayer {
  rank: number; player_id: string; name: string; team: string;
  conference: string | null;
  offensive_rating: number; defensive_rating: number; net_rating: number;
  minutes_share: number; possessions: number | null;
  prev_net_rating: number | null; status: string;
}
export interface RankingsDoc {
  generated_at: string; year: number; projected: boolean; teams: BasketballTeam[];
}
export interface PlayersDoc {
  generated_at: string; year: number; projected: boolean; players: BasketballPlayer[];
}

export function listBasketballYears(): number[] {
  try {
    return readdirSync(join(process.cwd(), 'public', 'data', 'basketball'), { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
      .map(d => Number(d.name))
      .sort((a, b) => a - b);
  } catch { return []; }
}

export function loadBasketballYear(year: number): { rankings: RankingsDoc; players: PlayersDoc } | null {
  try {
    const base = join(process.cwd(), 'public', 'data', 'basketball', String(year));
    return {
      rankings: JSON.parse(readFileSync(join(base, 'rankings.json'), 'utf-8')),
      players:  JSON.parse(readFileSync(join(base, 'players.json'),  'utf-8')),
    };
  } catch { return null; }
}