// ═══════════════════════════════════════════════════════════════════
// Types — must match what export_basketball() writes to JSON
// ═══════════════════════════════════════════════════════════════════

export interface BasketballTeam {
  rank: number;
  team: string;
  conference: string | null;

  // Record (0-0 for projections after the front-end null guard fix)
  wins: number | null;
  losses: number | null;

  // Raw absolute ratings (points per 100 possessions)
  adj_off: number;
  adj_def: number;
  adj_net: number;
  net: number;                 // alias of adj_net
  eff_off: number;             // alias of adj_off
  eff_def: number;             // alias of adj_def
  eff_net: number;             // alias of adj_net

  // Direct-fit team ratings (as-of, used as a margin-model feature and for synergy)
  direct_net: number;          // raw (GT-included) — matches the margin model's training data
  direct_net_f: number;        // GT-filtered — matches adj_net, use THIS for synergy

  // Display ratings (relative scale, centered on season intercept)
  o_rate: number;
  d_rate: number;
  relative_rating: number;

  // Features
  tempo: number;
  rot_level: number;
  play_types: unknown[];

  // Injury overlay (projections only; undefined on finished seasons)
  inj_adj_off?: number;
  inj_adj_def?: number;
  inj_net?: number;
  inj_rank?: number;
  inj_relative_rating?: number;

  primaryColor?: string | null;
  secondaryColor?: string | null;
  logo?: string | null;
  logo_dark?: string | null; // ADD THIS
  mascot?: string | null;
  abbreviation?: string | null;
}

export interface BasketballPlayer {
  rank: number;
  player_id: string;
  name: string;
  team: string;
  conference: string | null;

  // Bio
  height?: string | null;
  weight?: string | null;
  position?: string | null;
  jersey?: string | null;
  class?: string | null;

  // Ratings
  offensive_rating: number;
  defensive_rating: number;
  net_rating: number;
  minutes_share: number;
  possessions: number | null;
  prev_net_rating: number | null;
  status: string;

  // Box score (finished seasons; null on projections)
  gp?: number | null;
  min_pg?: number | null;
  pts_pg?: number | null;
  reb_pg?: number | null;
  ast_pg?: number | null;
  stl_pg?: number | null;
  blk_pg?: number | null;
  tov_pg?: number | null;
  ts_pct?: number | null;
  usage?: number | null;
  porpag?: number | null;
  ftm?: number | null;
  fta?: number | null;

  // Ranks (finished only)
  pts_pg_rank?: number | null;
  reb_pg_rank?: number | null;
  ast_pg_rank?: number | null;
  stl_pg_rank?: number | null;
  blk_pg_rank?: number | null;
  ts_pct_rank?: number | null;
  usage_rank?: number | null;
  porpag_rank?: number | null;

  // Advanced profiles
  shot_profile?: Record<string, unknown>;
  play_types?: Record<string, unknown>;
  clutch_stats?: Record<string, unknown>;
}

export interface MarginModel {
  features: string[];
  betas: number[];
  sigma: number;
  eff_mu: number;
}

export interface RankingsDoc {
  generated_at: string;
  year: number;
  projected: boolean;
  teams: BasketballTeam[];
  // Empty object {} when MODEL_ACTIVE wasn't trained — but the field is always present.
  model: Partial<MarginModel>;
}

export interface PlayersDoc {
  generated_at: string;
  year: number;
  projected: boolean;
  players: BasketballPlayer[];
}

export interface ScheduleGame {
  game_id: string;
  date: string;               // YYYY-MM-DD
  opponent: string;
  is_home: boolean;
  neutral: boolean;
  team_score: number | null;
  opp_score: number | null;
  result: 'W' | 'L' | '';
}

export type ScheduleDoc = Record<string, ScheduleGame[]>;

// ═══════════════════════════════════════════════════════════════════
// Fetch helpers
// ═══════════════════════════════════════════════════════════════════

export async function fetchJson(ctx: any, urlPath: string): Promise<any | null> {
  // 1. Try standard fetch (works in production SSR on Cloudflare)
  try {
    const url = new URL(urlPath, ctx.url);
    const env = ctx.locals?.runtime?.env;
    const res = env?.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
    if (res.ok) return await res.json();
  } catch (e) {
    // Ignore fetch errors
  }

  // 2. Fallback: Read from local filesystem ONLY if running in local dev
  if (import.meta.env.DEV) {
    try {
      // Dynamic import prevents Cloudflare Workers from crashing
      const fs = await import('node:fs');
      const path = await import('node:path');
      
      const filePath = path.join(process.cwd(), 'public', urlPath);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      // Ignore fs errors
    }
  }

  return null;
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

export async function loadBasketballSchedule(
  year: number,
  ctx: any
): Promise<ScheduleDoc | null> {
  return fetchJson(ctx, `/data/basketball/${year}/schedule.json`);
}

export async function listBasketballYears(ctx: any): Promise<number[]> {
  const idx = await fetchJson(ctx, '/data/basketball/index.json');
  if (!idx || !Array.isArray(idx.years)) return [];
  return [...idx.years].sort((a, b) => a - b);
}