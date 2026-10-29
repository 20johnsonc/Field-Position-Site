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

// Vite bundles these JSON files at build time (eager: true = synchronous)
const yearData = import.meta.glob('../data/basketball/*/*.json', { eager: true });

export function loadBasketballYear(year: number): { rankings: RankingsDoc; players: PlayersDoc } | null {
  try {
    const base = `../data/basketball/${year}`;
    const rankings = (yearData[`${base}/rankings.json`] as any)?.default;
    const players = (yearData[`${base}/players.json`] as any)?.default;
    
    if (!rankings || !players) return null;
    return { rankings, players };
  } catch (e) {
    console.error(`Failed to load year ${year}`, e);
    return null;
  }
}

export function listBasketballYears(): number[] {
  const years = new Set<number>();
  for (const key in yearData) {
    const match = key.match(/basketball\/(\d{4})\//);
    if (match) years.add(Number(match[1]));
  }
  return Array.from(years).sort((a, b) => a - b);
}