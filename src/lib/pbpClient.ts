import type { PbpPoint, GameMeta, TaggedPlay } from './pbp';

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