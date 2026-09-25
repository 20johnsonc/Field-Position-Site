// src/lib/prFormat.ts
// Shared by PassingRushingTab.astro (server render) AND its client <script>
// (defense toggle, game filter, modal) so both draw tiles the same way.

export const MIN_ATT_SEASON = 10; // pass attempts / carries before a zone stops looking "thin"
export const MIN_ATT_GAME = 3;

export type Side = 'offense' | 'defense';
export type Kind = 'int' | 'num1' | 'num2' | 'rate' | 'pct';
export interface Field {
  key: string;
  label: string;
  kind: Kind;
  better?: 'high' | 'low'; // from the OFFENSE point of view; flipped automatically for defense
  hint?: string;
}

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Missing data shows an em dash, never a fake 0.
export const fmtInt = (v: unknown) => (isNum(v) ? Math.round(v).toLocaleString('en-US') : '—');
export const fmtNum = (v: unknown, d = 1) => (isNum(v) ? v.toFixed(d) : '—');
export const fmtRate = (v: unknown, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : '—'); // 0-1 -> %
export const fmtPct = (v: unknown, d = 1) => (isNum(v) ? `${v.toFixed(d)}%` : '—'); // already 0-100

export function fmtField(f: Field, v: unknown): string {
  switch (f.kind) {
    case 'int': return fmtInt(v);
    case 'num1': return fmtNum(v, 1);
    case 'num2': return fmtNum(v, 2);
    case 'rate': return fmtRate(v);
    case 'pct': return fmtPct(v);
  }
}

// Background overlay: green = better than the FBS average, red = worse.
// `span` is how far from average (in rate units, 0.10 = 10 pts) gives full color.
// For the defense view, "better" means LOWER than average.
export function tint(value: unknown, lg: unknown, side: Side = 'offense', span = 0.1): string {
  if (!isNum(value) || !isNum(lg)) return 'transparent';
  let d = value - lg;
  if (side === 'defense') d = -d;
  const a = (Math.min(Math.abs(d) / span, 1) * 0.28).toFixed(3);
  return d >= 0 ? `hsl(142 60% 40% / ${a})` : `hsl(0 70% 50% / ${a})`;
}

// "+3.2 pts" for 0-1 rates, "+0.8" for everything else. Null if either side is missing.
export function deltaLabel(f: Field, value: unknown, lg: unknown): string | null {
  if (!isNum(value) || !isNum(lg)) return null;
  const d = value - lg;
  const sign = d >= 0 ? '+' : '−';
  const abs = Math.abs(d);
  if (f.kind === 'rate') return `${sign}${(abs * 100).toFixed(1)} pts`;
  if (f.kind === 'pct') return `${sign}${abs.toFixed(1)} pts`;
  if (f.kind === 'int') return `${sign}${Math.round(abs)}`;
  return `${sign}${abs.toFixed(f.kind === 'num2' ? 2 : 1)}`;
}

// 'good' | 'bad' | 'even' -- for coloring the delta text in the modal.
export function judge(f: Field, value: unknown, lg: unknown, side: Side = 'offense') {
  if (!f.better || !isNum(value) || !isNum(lg) || value === lg) return 'even';
  let up = value > lg;
  if (f.better === 'low') up = !up;
  if (side === 'defense') up = !up;
  return up ? 'good' : 'bad';
}

// Rows for the deep-dive modal. Keys match the exported JSON exactly.
// Fields with no league value (air_yards, yac, ...) just skip the comparison column.
export const PASS_FIELDS: Field[] = [
  { key: 'attempts', label: 'Attempts', kind: 'int' },
  { key: 'completions', label: 'Completions', kind: 'int' },
  { key: 'completion_pct', label: 'Completion %', kind: 'pct', better: 'high' },
  { key: 'yards', label: 'Yards', kind: 'int' },
  { key: 'yards_per_attempt', label: 'Yards / attempt', kind: 'num1', better: 'high' },
  { key: 'yards_per_completion', label: 'Yards / completion', kind: 'num1', better: 'high' },
  { key: 'air_yards', label: 'Air yards', kind: 'int' },
  { key: 'adot', label: 'Avg depth of target', kind: 'num1', hint: 'Average air yards per attempt' },
  { key: 'yac', label: 'Yards after catch', kind: 'int' },
  { key: 'yac_per_completion', label: 'YAC / completion', kind: 'num1', better: 'high' },
  { key: 'interceptions', label: 'Interceptions', kind: 'int' },
  { key: 'int_rate', label: 'INT %', kind: 'pct', better: 'low' },
  { key: 'success_rate', label: 'Success rate', kind: 'rate', better: 'high' },
  { key: 'ppa', label: 'PPA / play', kind: 'num2', better: 'high', hint: 'Predicted points added per play' },
  { key: 'explosiveness', label: 'Explosiveness', kind: 'num2', better: 'high' },
];

export const RUSH_FIELDS: Field[] = [
  { key: 'carries', label: 'Carries', kind: 'int' },
  { key: 'yards', label: 'Yards', kind: 'int' },
  { key: 'yards_per_carry', label: 'Yards / carry', kind: 'num1', better: 'high' },
  { key: 'success_rate', label: 'Success rate', kind: 'rate', better: 'high' },
  { key: 'stuff_rate', label: 'Stuff rate', kind: 'rate', better: 'low', hint: 'Carries stopped at or behind the line' },
  { key: 'power_success', label: 'Power success', kind: 'rate', better: 'high', hint: 'Short-yardage conversions' },
  { key: 'line_yards', label: 'Line yards / carry', kind: 'num1', better: 'high' },
  { key: 'second_level_yards', label: 'Second-level yards / carry', kind: 'num1', better: 'high' },
  { key: 'open_field_yards', label: 'Open-field yards / carry', kind: 'num1', better: 'high' },
  { key: 'ppa', label: 'PPA / play', kind: 'num2', better: 'high' },
  { key: 'explosiveness', label: 'Explosiveness', kind: 'num2', better: 'high' },
];

export const gameLabel = (g: { season_type?: string; week?: number; opponent?: string }) =>
  `${g.season_type === 'postseason' ? 'Postseason' : `Wk ${g.week}`} vs ${g.opponent}`;

// Rank from the export: bucket.rank[field] = [rank, teamsRanked]; 1 = best for that side
// (already flipped for Defense Allowed). Only present in season data, so game views show none.
export function rankLabel(bucket: any, key: string, long = false): { text: string; cls: string } | null {
  const r = bucket?.rank?.[key];
  if (!Array.isArray(r) || r.length < 2 || !isNum(r[0]) || !isNum(r[1]) || r[1] <= 0) return null;
  const share = r[0] / r[1];
  return {
    text: long ? `#${r[0]} of ${r[1]}` : `#${r[0]}`,
    cls: share <= 0.25 ? 'top' : share >= 0.75 ? 'bot' : '',
  };
}