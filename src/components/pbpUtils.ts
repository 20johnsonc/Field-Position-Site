export interface PbpPoint {
  id: string;
  driveId: string;
  driveNumber: number;
  playNumber: number;
  home: string;
  away: string;
  offense: string;
  offenseConference?: string;
  defense: string;
  defenseConference?: string;
  offenseScore: number;
  defenseScore: number;
  score_diff: number;
  period: number;
  clock: string | { displayValue?: string };
  clock_seconds?: number;
  wallclock?: string;
  down: number;
  distance: number;
  yardline: number;
  yardsToGoal: number;
  yardsGained: number;
  scoring: boolean;
  playType: string;
  playText: string;
  ppa?: number;
  net_ppa?: number;
  cum_net_ppa: number;
}

export interface GameMeta {
  gameId: string;
  year: string | number;
  homeTeam: string;
  awayTeam: string;
  week?: number;
}

export interface TaggedPlay extends PbpPoint {
  gameId: string;
  year: string | number;
}

// Shared in-memory cache — reused by the chart modal AND the weekly
// leaderboard, so a game fetched once for one never triggers a redundant
// fetch for the other.
const pbpCache = new Map<string, PbpPoint[]>();

export async function loadPbpData(gameId: string, year: string | number = '2025'): Promise<PbpPoint[]> {
  const isInvalidYear = typeof year === 'string' && /[a-zA-Z]/.test(year);
  const cleanYear = isInvalidYear || !year ? '2025' : String(year).trim();
  const cacheKey = `${cleanYear}_${gameId}`;

  if (pbpCache.has(cacheKey)) {
    return pbpCache.get(cacheKey)!;
  }

  const candidates = [
    `/pbp/${year}/${gameId}.json`,
    `/pbp/${cleanYear}/pbp_${gameId}.json`,
    `/pbp/${gameId}.json`,
  ];

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data: PbpPoint[] = await response.json();
        pbpCache.set(cacheKey, data);
        return data;
      }
    } catch {
      // Try next candidate path
    }
  }

  throw new Error(`Play-by-play data not found for game ${gameId} (${cleanYear})`);
}

export interface WeekPbpResult {
  allPlays: TaggedPlay[];
  byGame: Map<string, TaggedPlay[]>;
  errors: { gameId: string; error: unknown }[];
}

// Fetches every game for a week in parallel and tags each play with the
// gameId/year it came from. Uses allSettled so one missing/broken game
// file doesn't take down the whole week's leaderboard — failures are
// reported back in `errors` instead of throwing.
export async function loadWeekPbpData(games: GameMeta[]): Promise<WeekPbpResult> {
  const results = await Promise.allSettled(
    games.map(async (game) => {
      const points = await loadPbpData(game.gameId, game.year);
      const tagged: TaggedPlay[] = points.map((point) => ({
        ...point,
        gameId: game.gameId,
        year: game.year,
      }));
      return { game, tagged };
    })
  );

  const allPlays: TaggedPlay[] = [];
  const byGame = new Map<string, TaggedPlay[]>();
  const errors: { gameId: string; error: unknown }[] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const { game, tagged } = result.value;
      allPlays.push(...tagged);
      byGame.set(game.gameId, tagged);
    } else {
      errors.push({ gameId: games[i].gameId, error: result.reason });
    }
  });

  return { allPlays, byGame, errors };
}

// Rows that aren't real "plays" for ranking purposes — see file header
// comment for why each one is excluded.
const NON_PLAY_TYPES = new Set(['Kickoff', 'Timeout', 'End Period', 'End of Game']);

export function isCountablePlay(point: PbpPoint): boolean {
  if (NON_PLAY_TYPES.has(point.playType)) return false;
  if (point.playText?.includes('NO PLAY')) return false;
  return true;
}

export function playImpactMagnitude(point: PbpPoint): number {
  return Math.abs(Number(point.net_ppa ?? point.ppa ?? 0));
}

export interface PlayImpact {
  team: string;
  role: 'offense' | 'defense';
  icon: '🔥' | '🛡️';
  value: number;
}

// Which team the play actually favored, and whether that team was on
// offense or defense when it happened (a pick-six favors the defense; a
// long completion favors the offense). Generalizes the inline badge logic
// from the chart modal (minus its 1.5 magnitude threshold) so it can be
// reused for any play list, not just "big" plays.
export function getPlayImpact(point: PbpPoint): PlayImpact | null {
  const homeGain = Number(point.net_ppa ?? point.ppa ?? 0);
  if (homeGain === 0) return null;

  const benefitingTeam = homeGain > 0 ? point.home : point.away;
  const role: 'offense' | 'defense' = benefitingTeam === point.offense ? 'offense' : 'defense';

  return {
    team: benefitingTeam,
    role,
    icon: role === 'offense' ? '🔥' : '🛡️',
    value: homeGain,
  };
}

export function getTopPlays<T extends PbpPoint>(points: T[], limit = 10): T[] {
  return points
    .filter(isCountablePlay)
    .slice()
    .sort((a, b) => playImpactMagnitude(b) - playImpactMagnitude(a))
    .slice(0, limit);
}