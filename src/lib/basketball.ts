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

// Fetch a static JSON asset. Uses Cloudflare's ASSETS binding when available
// (Worker self-fetch to its own origin is blocked/looped), falls back to
// plain fetch for local dev where Astro's runtime is undefined.
async function fetchJson(ctx: any, path: string): Promise<any | null> {
  try {
    const url = new URL(path, ctx.url);
    const env = ctx.locals?.runtime?.env;
    const res = env?.ASSETS
      ? await env.ASSETS.fetch(url)
      : await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadBasketballYear(
  year: number,
  ctx: any
): Promise<{ rankings: RankingsDoc; players: PlayersDoc } | null> {
  const [rankings, players] = await Promise.all([
    fetchJson(ctx, `/data/basketball/${year}/rankings.json`),
    fetchJson(ctx, `/data/basketball/${year}/players.json`),
  ]);
  if (!rankings || !players) return null;
  return { rankings, players };
}

export async function listBasketballYears(ctx: any): Promise<number[]> {
  const idx = await fetchJson(ctx, '/data/basketball/index.json');
  if (!idx || !Array.isArray(idx.years)) return [];
  return [...idx.years].sort((a, b) => a - b);
}
