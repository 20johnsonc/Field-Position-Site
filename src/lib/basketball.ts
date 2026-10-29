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

// Fetch a JSON asset from /public. Returns null on any failure so callers
// can fall back gracefully (Workers has no fs; everything is HTTP).
async function fetchJson(base: URL | string, path: string): Promise<any | null> {
  try {
    const res = await fetch(new URL(path, base));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadBasketballYear(
  year: number,
  base: URL | string
): Promise<{ rankings: RankingsDoc; players: PlayersDoc } | null> {
  const [rankings, players] = await Promise.all([
    fetchJson(base, `/data/basketball/${year}/rankings.json`),
    fetchJson(base, `/data/basketball/${year}/players.json`),
  ]);
  if (!rankings || !players) return null;
  return { rankings, players };
}

export async function listBasketballYears(base: URL | string): Promise<number[]> {
  const idx = await fetchJson(base, '/data/basketball/index.json');
  if (!idx || !Array.isArray(idx.years)) return [];
  return [...idx.years].sort((a, b) => a - b);
}
