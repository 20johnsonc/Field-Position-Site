import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PbpPoint, GameMeta, TaggedPlay } from './pbp';

const pbpServerCache = new Map<string, PbpPoint[]>();

// Adjust `publicDir` if your pbp files live somewhere other than /public.
const publicDir = path.join(process.cwd(), 'public');

export async function loadPbpDataServer(
  gameId: string,
  year: string | number = '2025'
): Promise<PbpPoint[]> {
  const isInvalidYear = typeof year === 'string' && /[a-zA-Z]/.test(year);
  const cleanYear = isInvalidYear || !year ? '2025' : String(year).trim();
  const cacheKey = `${cleanYear}_${gameId}`;

  if (pbpServerCache.has(cacheKey)) {
    return pbpServerCache.get(cacheKey)!;
  }

  const candidates = [
    path.join(publicDir, 'pbp', String(year), `${gameId}.json`),
    path.join(publicDir, 'pbp', cleanYear, `pbp_${gameId}.json`),
    path.join(publicDir, 'pbp', `${gameId}.json`),
  ];

  for (const filePath of candidates) {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const data: PbpPoint[] = JSON.parse(raw);
      pbpServerCache.set(cacheKey, data);
      return data;
    } catch {
      // Try next candidate path (covers ENOENT and any malformed-JSON file)
    }
  }

  throw new Error(`Play-by-play data not found for game ${gameId} (${cleanYear})`);
}

export interface WeekPbpResult {
  allPlays: TaggedPlay[];
  byGame: Map<string, TaggedPlay[]>;
  errors: { gameId: string; error: unknown }[];
}

export async function loadWeekPbpDataServer(games: GameMeta[]): Promise<WeekPbpResult> {
  const results = await Promise.allSettled(
    games.map(async (game) => {
      const points = await loadPbpDataServer(game.gameId, game.year);
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