// src/lib/prTable.ts
// Shared by the table page's SSR render and its client script, so the
// server-rendered rows and any client re-render (year change) always agree.
// Depends only on prFormat.ts -- no Node/browser APIs, so it bundles cleanly
// for both the Astro frontmatter and the client <script>.
import {
  isNum, fmtInt, fmtField,
  PASS_FIELDS, RUSH_FIELDS, type Field,
} from './prFormat';

export type Kind = 'passing' | 'rushing';
export type Side = 'offense' | 'defense';

// Keeps a curated, table-width-friendly subset of PASS_FIELDS/RUSH_FIELDS,
// in the order columns should appear. Not just "everything" -- ADOT/YAC/etc.
// stay in the per-team modal (PassingRushingTab), not this overview.
const PASS_TABLE_KEYS = ['completion_pct', 'yards', 'yards_per_attempt', 'interceptions', 'success_rate', 'ppa'];
const RUSH_TABLE_KEYS = ['yards', 'yards_per_carry', 'stuff_rate', 'line_yards', 'success_rate', 'ppa'];

export function tableFields(kind: Kind): Field[] {
  const all = kind === 'passing' ? PASS_FIELDS : RUSH_FIELDS;
  const keys = kind === 'passing' ? PASS_TABLE_KEYS : RUSH_TABLE_KEYS;
  return keys.map((k) => all.find((f) => f.key === k)).filter((f): f is Field => !!f);
}

// The stat ranks are computed against in the export cell -- drives the Rank column.
export const PRIMARY_FIELD: Record<Kind, string> = { passing: 'success_rate', rushing: 'success_rate' };

export interface ViewOption { key: string; label: string }
export const PASS_VIEWS: ViewOption[] = [
  { key: 'total', label: 'Overall' },
  { key: 'deep', label: 'Deep (L/M/R)' },
  { key: 'short', label: 'Short (L/M/R)' },
  { key: 'deep left', label: 'Deep Left' },
  { key: 'deep middle', label: 'Deep Middle' },
  { key: 'deep right', label: 'Deep Right' },
  { key: 'short left', label: 'Short Left' },
  { key: 'short middle', label: 'Short Middle' },
  { key: 'short right', label: 'Short Right' },
];
export const RUSH_VIEWS: ViewOption[] = [
  { key: 'total', label: 'Overall' },
  { key: 'left', label: 'Run Left' },
  { key: 'middle', label: 'Run Middle' },
  { key: 'right', label: 'Run Right' },
];
export const views = (kind: Kind) => (kind === 'passing' ? PASS_VIEWS : RUSH_VIEWS);

const volumeKey = (kind: Kind) => (kind === 'passing' ? 'attempts' : 'carries');
const shareKey = (kind: Kind) => (kind === 'passing' ? 'share_of_attempts' : 'share_of_carries');

// "Deep" and "Short" aren't buckets the export computes -- they're merged
// here, on the fly, from the three real zones at that depth. Volume stats
// (attempts, yards, ...) sum directly; rate stats (success_rate, ppa,
// explosiveness) are attempt-weighted averages, not naive averages, so a
// zone with 40 attempts counts for more than one with 3 -- the same approach
// the export cell uses for its league-wide averages. completion_pct, ADOT,
// and the other per-attempt/per-completion stats are recomputed from the
// summed totals rather than averaged, since those are ratios, not counts.
const DEEP_ZONES = ['deep left', 'deep middle', 'deep right'];
const SHORT_ZONES = ['short left', 'short middle', 'short right'];
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function combinePassZones(zones: Record<string, any> | undefined, keys: string[], teamAttempts: number | undefined): any | null {
  const buckets = keys.map((k) => zones?.[k]).filter((b) => b && b.attempts);
  if (!buckets.length) return null;

  const sum = (k: string) => buckets.reduce((a, b) => a + (b[k] ?? 0), 0);
  const weightedAvg = (k: string): number | null => {
    const pairs = buckets.filter((b) => isNum(b[k])).map((b): [number, number] => [b[k], b.attempts]);
    const totalWeight = pairs.reduce((a, [, w]) => a + w, 0);
    return totalWeight ? pairs.reduce((a, [v, w]) => a + v * w, 0) / totalWeight : null;
  };

  const attempts = sum('attempts');
  const completions = sum('completions');
  const yards = sum('yards');
  const airYards = sum('air_yards');
  const yac = sum('yac');
  const interceptions = sum('interceptions');

  return {
    attempts,
    completions,
    incompletions: sum('incompletions'),
    interceptions,
    completion_pct: attempts ? r1((completions / attempts) * 100) : null,
    int_rate: attempts ? r1((interceptions / attempts) * 100) : null,
    yards,
    yards_per_attempt: attempts ? r2(yards / attempts) : null,
    yards_per_completion: completions ? r2(yards / completions) : null,
    air_yards: airYards,
    adot: attempts ? r2(airYards / attempts) : null,
    yac,
    yac_per_completion: completions ? r2(yac / completions) : null,
    success_rate: weightedAvg('success_rate'),
    ppa: weightedAvg('ppa'),
    explosiveness: weightedAvg('explosiveness'),
    share_of_attempts: teamAttempts ? r1((attempts / teamAttempts) * 100) : null,
    // Deliberately no `rank` here: ranks are computed once, export-side, only
    // for the buckets that actually exist in the JSON (the six real zones,
    // "total", and the three rush directions). A merged Deep/Short bucket has
    // no equivalent rank to show -- rankLabel() already handles a missing
    // `rank` gracefully (renders "—"), so nothing downstream needs to change.
  };
}

export function getBucket(teamEntry: any, kind: Kind, side: Side, view: string): any {
  const sideObj = teamEntry?.[kind]?.[side];
  if (!sideObj) return null;
  if (view === 'total') return sideObj.total ?? null;
  if (kind === 'passing' && (view === 'deep' || view === 'short')) {
    return combinePassZones(sideObj.zones, view === 'deep' ? DEEP_ZONES : SHORT_ZONES, sideObj.total?.attempts);
  }
  const group = kind === 'passing' ? sideObj.zones : sideObj.directions;
  return group?.[view] ?? null;
}

export interface TableRow {
  team: string;
  conference: string;
  volume: number;
  share: number | null;
  values: (number | null)[]; // aligned to tableFields(kind)
  match: boolean; // true = matches the current search (or no search active); non-destructive, like the scatter
}

// Assigned by sortRows(), based on genuine position in the current sort --
// not the export's pre-computed, single-stat FBS-wide rank. Whatever column
// you sort by, row 1 in that order is #1, regardless of view/filters/side.
export interface RankedRow extends TableRow { localRank: number }

export function buildRows(
  teams: Record<string, any>,
  kind: Kind,
  side: Side,
  view: string,
): TableRow[] {
  const fields = tableFields(kind);
  const vKey = volumeKey(kind);
  const sKey = shareKey(kind);
  const rows: TableRow[] = [];
  for (const [team, entry] of Object.entries<any>(teams || {})) {
    const b = getBucket(entry, kind, side, view);
    const volume = b?.[vKey] ?? 0;
    if (!b || !volume) continue; // a team with zero plays here adds nothing to compare
    rows.push({
      team,
      conference: entry.conference ?? '—',
      volume,
      share: view === 'total' ? null : (b[sKey] ?? null),
      values: fields.map((f) => (isNum(b[f.key]) ? (b[f.key] as number) : null)),
      match: true, // set for real by filterRows(), once it knows the current search text
    });
  }
  return rows;
}

export function filterRows(
  rows: TableRow[],
  o: { conf?: string; search?: string; min?: number; pinned?: Set<string> },
): TableRow[] {
  const conf = o.conf ?? 'ALL';
  const search = (o.search ?? '').trim().toLowerCase();
  const min = o.min ?? 0;
  const pinned = o.pinned ?? new Set<string>();

  // Conference and minimum-volume are real, exclusionary filters -- a team
  // that fails either one genuinely doesn't belong in this comparison.
  let out = rows;
  if (conf !== 'ALL') out = out.filter((r) => r.conference === conf);
  if (min > 0) out = out.filter((r) => r.volume >= min || pinned.has(r.team));

  // Search is non-destructive: it flags matches for the UI to dim/highlight,
  // the same way the scatter's search works, rather than removing
  // non-matching rows outright.
  return out.map((r) => ({
    ...r,
    match: !search || r.team.toLowerCase().includes(search) || r.conference.toLowerCase().includes(search),
  }));
}

export function sortRows(
  rows: TableRow[],
  sortKey: string, // 'team' | 'conference' | 'volume' | 'share' | a field key
  fields: Field[],
  ascending: boolean,
): RankedRow[] {
  const idx = fields.findIndex((f) => f.key === sortKey);
  const val = (r: TableRow): string | number | null => {
    if (sortKey === 'team') return r.team;
    if (sortKey === 'conference') return r.conference;
    if (sortKey === 'volume') return r.volume;
    if (sortKey === 'share') return r.share;
    return idx >= 0 ? r.values[idx] : null;
  };
  const sorted = [...rows].sort((a, b) => {
    const av = val(a), bv = val(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // missing values always sink, regardless of direction
    if (bv == null) return -1;
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv)) * (ascending ? 1 : -1);
    }
    return ((av as number) - (bv as number)) * (ascending ? 1 : -1);
  });
  // localRank reflects genuine position in THIS sort, assigned here -- before
  // the caller floats pinned rows to the top for display. That reordering
  // only ever happens after this, so a pinned row keeps the rank number that
  // matches its real standing rather than picking up a misleadingly low one
  // just because it was pinned.
  return sorted.map((r, i) => ({ ...r, localRank: i + 1 }));
}

const escHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

export function tableHtml(o: {
  rows: RankedRow[]; kind: Kind; view: string; pinned: Set<string>;
  teamHref: (team: string) => string;
}): string {
  const { rows, kind, view, pinned, teamHref } = o;
  const fields = tableFields(kind);
  const showShare = view !== 'total';
  const volLabel = kind === 'passing' ? 'Att' : 'Carries';
  // Only actually dim anything once a search has genuinely excluded at least
  // one visible row -- an empty search, or one that happens to match every
  // row currently on screen, both correctly render as "nothing dimmed."
  const hasSearch = rows.some((r) => !r.match);

  const head = `
    <th class="num rank-col" aria-label="Rank in the current sort">#</th>
    <th class="pin-col" aria-label="Pin"></th>
    <th class="sortable" data-key="team">Team</th>
    <th class="sortable" data-key="conference">Conf</th>
    <th class="sortable num" data-key="volume">${volLabel}</th>
    ${showShare ? `<th class="sortable num" data-key="share">Share</th>` : ''}
    ${fields.map((f) => `<th class="sortable num" data-key="${f.key}">${f.label}</th>`).join('')}
  `;

  const body = rows.map((r) => {
    const pin = pinned.has(r.team);
    const cls = [pin ? 'pinned' : '', hasSearch ? (r.match ? 'match' : 'dimmed') : ''].filter(Boolean).join(' ');
    return `
    <tr data-team="${escHtml(r.team)}" data-conference="${escHtml(r.conference)}" class="${cls}">
      <td class="num rank-col">${r.localRank}</td>
      <td class="pin-col"><input type="checkbox" class="pin-check" data-team="${escHtml(r.team)}" ${pin ? 'checked' : ''} aria-label="Pin ${escHtml(r.team)}" /></td>
      <td class="team-cell"><a href="${escHtml(teamHref(r.team))}">${escHtml(r.team)}</a></td>
      <td>${escHtml(r.conference)}</td>
      <td class="num">${fmtInt(r.volume)}</td>
      ${showShare ? `<td class="num">${isNum(r.share) ? r.share + '%' : '—'}</td>` : ''}
      ${fields.map((f, i) => `<td class="num">${fmtField(f, r.values[i])}</td>`).join('')}
    </tr>`;
  }).join('');

  return `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
}