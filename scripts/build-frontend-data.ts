import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadWeekPbpDataServer } from '../src/lib/pbpServer';
import { getTopPlays, toDisplayPlay, type GameMeta } from '../src/lib/pbp';
import backtestData from '../src/data/betting_backtest.json';

const PUBLIC = join(process.cwd(), 'public');
const MATCHUPS_DIR = join(PUBLIC, 'data/matchups');
const TOP_PLAYS_DIR = join(PUBLIC, 'data/pbp-top-plays');
const BACKTEST_DIR = join(PUBLIC, 'data/backtest');

// game_id -> backtest row, built once
const backtestByGameId = new Map<number, any>(
  (backtestData.games as any[]).map((g) => [g.game_id, g])
);

function listYears(): string[] {
  return readdirSync(MATCHUPS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function listWeeks(year: string): number[] {
  return readdirSync(join(MATCHUPS_DIR, year))
    .filter((f) => /^week-\d+\.json$/.test(f))
    .map((f) => Number(f.match(/\d+/)![0]))
    .sort((a, b) => a - b);
}

function loadWeekFile(year: string, week: number): any[] {
  const raw = JSON.parse(readFileSync(join(MATCHUPS_DIR, year, `week-${week}.json`), 'utf-8'));
  return Array.isArray(raw) ? raw : raw.games ?? [];
}

function buildMatchupsIndex(years: string[]) {
  const weeksByYear: Record<string, number[]> = {};
  let defaultYear = years[0];
  let defaultWeek = 0;

  for (const year of years) {
    const weeks = listWeeks(year);
    weeksByYear[year] = weeks;

    const completedWeeks = weeks.filter((w) =>
      loadWeekFile(year, w).some((g) => g.home_points != null && g.away_points != null)
    );
    if (completedWeeks.length > 0 && Number(year) >= Number(defaultYear)) {
      defaultYear = year;
      defaultWeek = Math.max(...completedWeeks);
    }
  }

  const index = {
    years: years.map(Number).sort((a, b) => a - b),
    weeks_by_year: weeksByYear,
    default_year: Number(defaultYear),
    default_week: defaultWeek,
  };
  writeFileSync(join(PUBLIC, 'data/matchups-index.json'), JSON.stringify(index, null, 2));
  return index;
}

async function buildTopPlaysForWeek(year: string, week: number, completedGames: any[]) {
  if (completedGames.length === 0) return;

  const weekGames: GameMeta[] = completedGames.map((g) => ({
    gameId: String(g.game_id),
    year: g.year,
    homeTeam: g.home_team,
    awayTeam: g.away_team,
  }));

  const { byGame, errors } = await loadWeekPbpDataServer(weekGames);
  if (errors.length > 0) {
    //console.warn(`[pbp-top-plays] ${year} wk${week}: ${errors.length} game(s) failed`, errors.map((e) => e.gameId));
    console.warn(`[pbp-top-plays] ${year} wk${week}: ${errors.length} game(s) failed`, errors.map((e) => `${e.gameId}: ${e.error instanceof Error ? e.error.message : e.error}`));
  }

  const output: Record<string, ReturnType<typeof toDisplayPlay>[]> = {};
  byGame.forEach((plays, gameId) => {
    output[gameId] = getTopPlays(plays, 15).map(toDisplayPlay);
  });

  const outDir = join(TOP_PLAYS_DIR, year);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `week-${week}.json`), JSON.stringify(output));
}

// Joins backtest rows by game_id against this week's completed games,
// so the client can fetch one small file instead of the whole betting_backtest.json.
function buildBacktestForWeek(year: string, week: number, completedGames: any[]) {
  const output: Record<string, any> = {};
  for (const g of completedGames) {
    const row = backtestByGameId.get(g.game_id);
    if (row) output[String(g.game_id)] = row;
  }
  if (Object.keys(output).length === 0) return;

  const outDir = join(BACKTEST_DIR, year);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `week-${week}.json`), JSON.stringify(output));
}

type AtsRecord = { wins: number; losses: number; pushes: number };
type SuRecord = { correct: number; total: number };

function buildSeasonRecords(years: string[]) {
  const byYear: Record<string, { su: SuRecord; ats: AtsRecord }> = {};

  for (const year of years) {
    byYear[year] = {
      su: { correct: 0, total: 0 },
      ats: { wins: 0, losses: 0, pushes: 0 },
    };
    for (const week of listWeeks(year)) {
      const completed = loadWeekFile(year, week).filter(
        (g) => g.home_points != null && g.away_points != null
      );
      for (const g of completed) {
        const row = backtestByGameId.get(g.game_id);
        if (!row) continue;

        if (row.su_correct != null) {
          byYear[year].su.total++;
          if (row.su_correct) byYear[year].su.correct++;
        }

        // Prefer ats_result; fall back to ats_correct for older rows
        const result: 'win' | 'loss' | 'push' | null =
          row.ats_result ??
          (row.ats_correct == null ? null : row.ats_correct ? 'win' : 'loss');

        if (result === 'win') byYear[year].ats.wins++;
        else if (result === 'loss') byYear[year].ats.losses++;
        else if (result === 'push') byYear[year].ats.pushes++;
      }
    }
  }
  writeFileSync(join(PUBLIC, 'data/season-records.json'), JSON.stringify(byYear));
}

const BBALL_DIR = join(PUBLIC, 'data/basketball');

function buildBasketballIndex() {
  if (!existsSync(BBALL_DIR)) {
    console.log('[basketball] no data dir, skipping index');
    return;
  }
  const years = readdirSync(BBALL_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d+$/.test(d.name))
    .map(d => Number(d.name))
    .sort((a, b) => a - b);
  if (years.length === 0) {
    console.log('[basketball] empty data dir, skipping index');
    return;
  }
  writeFileSync(
    join(BBALL_DIR, 'index.json'),
    JSON.stringify({ years, default_year: years[years.length - 1] }, null, 2)
  );
  console.log(`[basketball] wrote index: ${years.length} years (${years.join(', ')})`);
}

async function main() {
  const years = listYears();
  const index = buildMatchupsIndex(years);

  for (const year of years) {
    for (const week of listWeeks(year)) {
      const completed = loadWeekFile(year, week).filter((g) => g.home_points != null && g.away_points != null);
      await buildTopPlaysForWeek(year, week, completed);
      buildBacktestForWeek(year, week, completed);
    }
  }
  buildSeasonRecords(years);
  buildBasketballIndex();
  console.log('pbp-top-plays/, backtest/, and season-records.json written');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});