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

// Minimal shape needed to rank/display a play. PbpPoint and TaggedPlay
// both satisfy this structurally, so functions built against PlayLike
// work with full server-side objects AND with the trimmed JSON blob sent
// to the client — no separate code paths needed.
export interface PlayLike {
  home: string;
  away: string;
  offense: string;
  ppa?: number;
  net_ppa?: number;
}

// The subset of a TaggedPlay actually needed to render + rank a play in
// the browser. Kept small since this gets serialized into the page as
// JSON for every completed game, every page load.
export interface DisplayPlay extends PlayLike {
  id: string;
  gameId: string;
  year: string | number;
  playNumber: number;
  playText: string;
}

export function toDisplayPlay(play: TaggedPlay): DisplayPlay {
  return {
    id: play.id,
    gameId: play.gameId,
    year: play.year,
    home: play.home,
    away: play.away,
    offense: play.offense,
    playNumber: play.playNumber,
    playText: play.playText,
    ppa: play.ppa,
    net_ppa: play.net_ppa,
  };
}

// Rows that aren't real "plays" for ranking purposes.
const NON_PLAY_TYPES = new Set(['Kickoff', 'Timeout', 'End Period', 'End of Game']);

export function isCountablePlay(point: PbpPoint): boolean {
  if (NON_PLAY_TYPES.has(point.playType)) return false;
  if (point.playText?.includes('NO PLAY')) return false;
  return true;
}

export function playImpactMagnitude(point: PlayLike): number {
  return Math.abs(Number(point.net_ppa ?? point.ppa ?? 0));
}

export interface PlayImpact {
  team: string;
  role: 'offense' | 'defense';
  icon: '🔥' | '🛡️';
  value: number;
}

// net_ppa is expressed from the home team's perspective regardless of who
// has the ball. This figures out which team actually benefited and
// whether they were on offense or defense when it happened (a pick-six
// favors the defense).
export function getPlayImpact(point: PlayLike): PlayImpact | null {
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

// Filters to real plays, then ranks. Requires full PbpPoint (needs
// playType/playText for the filter) — used server-side only, where the
// raw per-game arrays haven't been filtered yet.
export function getTopPlays<T extends PbpPoint>(points: T[], limit = 10): T[] {
  return points
    .filter(isCountablePlay)
    .slice()
    .sort((a, b) => playImpactMagnitude(b) - playImpactMagnitude(a))
    .slice(0, limit);
}

// Ranks an already-filtered set by magnitude, no PbpPoint-specific fields
// required. Used client-side, where each game's plays were already
// filtered+capped server-side before being embedded as DisplayPlay JSON.
export function getTopByMagnitude<T extends PlayLike>(points: T[], limit = 10): T[] {
  return points
    .slice()
    .sort((a, b) => playImpactMagnitude(b) - playImpactMagnitude(a))
    .slice(0, limit);
}

export function formatEpa(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}