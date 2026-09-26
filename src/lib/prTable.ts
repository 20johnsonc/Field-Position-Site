// src/lib/prTable.ts
// Shared by the table page's SSR render and its client script, so the
// server-rendered rows and any client re-render (year change) always agree.
// Depends only on prFormat.ts -- no Node/browser APIs, so it bundles cleanly
// for both the Astro frontmatter and the client <script>.
import {
  isNum, fmtInt, fmtField, rankLabel,
  PASS_FIELDS, RUSH_FIELDS, type Field,
} from './prFormat';

export type Kind = 'passing' | 'rushing';
export type Side = 'offense' | 'defense';

// Keeps a curated, table-width-friendly subset of PASS_FIELDS/RUSH_FIELDS,
// in the order columns should appear. Not just "everything" -- ADOT/YAC/etc.
// stay in the per-team modal (PassingRushingTab), not this overview.
const PASS_TABLE_KEYS = ['completion_pct', 'yards', 'yards_per_completion', 'interceptions', 'success_rate', 'ppa'];
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

export function getBucket(teamEntry: any, kind: Kind, side: Side, view: string): any {
  const sideObj = teamEntry?.[kind]?.[side];
  if (!sideObj) return null;
  if (view === 'total') return sideObj.total ?? null;
  const group = kind === 'passing' ? sideObj.zones : sideObj.directions;
  return group?.[view] ?? null;
}

export interface TableRow {
  team: string;
  conference: string;
  match: boolean; // Evaluates whether it passes conference, volume, and search filters
  volume: number;
  share: number | null;
  values: (number | null)[]; // aligned to tableFields(kind)
  rank: [number, number] | null; // [rank, teamsRanked] on the primary field, or null
}

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
    const r = rankLabel(b, PRIMARY_FIELD[kind]);
    rows.push({
      team,
      conference: entry.conference ?? '—',
      match: true, // defaults to true, refined in filterRows
      volume,
      share: view === 'total' ? null : (b[sKey] ?? null),
      values: fields.map((f) => (isNum(b[f.key]) ? (b[f.key] as number) : null)),
      rank: r ? (b.rank[PRIMARY_FIELD[kind]] as [number, number]) : null,
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

  // 1. Hard filter by Conference and Minimum Volume first
  let out = rows.filter((r) => {
    const matchesConf = conf === 'ALL' || r.conference === conf;
    const matchesMin = min <= 0 || r.volume >= min || pinned.has(r.team);
    return matchesConf && matchesMin;
  });

  // 2. Map the remaining rows to set the 'match' property for search highlighting
  return out.map((r) => {
    const matchesSearch = !search || r.team.toLowerCase().includes(search) || r.conference.toLowerCase().includes(search);
    return {
      ...r,
      match: matchesSearch, // If search is active, non-matching rows get flagged false (dimmed)
    };
  });
}

export function sortRows(
  rows: TableRow[],
  sortKey: string, // 'team' | 'conference' | 'volume' | 'share' | 'rank' | a field key
  fields: Field[],
  ascending: boolean,
): TableRow[] {
  const idx = fields.findIndex((f) => f.key === sortKey);
  const val = (r: TableRow): string | number | null => {
    if (sortKey === 'team') return r.team;
    if (sortKey === 'conference') return r.conference;
    if (sortKey === 'volume') return r.volume;
    if (sortKey === 'share') return r.share;
    if (sortKey === 'rank') return r.rank ? r.rank[0] : null;
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
  return sorted;
}

const escHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

export function tableHtml(o: {
  rows: TableRow[]; kind: Kind; view: string; pinned: Set<string>;
  teamHref: (team: string) => string;
}): string {
  const { rows, kind, view, pinned, teamHref } = o;
  const fields = tableFields(kind);
  const showShare = view !== 'total';
  const volLabel = kind === 'passing' ? 'Att' : 'Carries';

  const head = `
    <th class="pin-col" aria-label="Pin"></th>
    <th class="sortable" data-key="team">Team</th>
    <th class="sortable" data-key="conference">Conf</th>
    <th class="sortable num" data-key="volume">${volLabel}</th>
    ${showShare ? `<th class="sortable num" data-key="share">Share</th>` : ''}
    ${fields.map((f) => `<th class="sortable num" data-key="${f.key}">${f.label}</th>`).join('')}
    <th class="sortable num" data-key="rank">Rank</th>
  `;

  const body = rows.map((r) => {
    const pin = pinned.has(r.team);
    const rowClasses = [
      pin ? 'pinned' : '',
      !r.match ? 'dimmed' : '', // Applies the dimmed class to rows that fail the filter/search criteria
    ].filter(Boolean).join(' ');

    return `
    <tr data-team="${escHtml(r.team)}" data-conference="${escHtml(r.conference)}" class="${rowClasses}">
      <td class="pin-col"><input type="checkbox" class="pin-check" data-team="${escHtml(r.team)}" ${pin ? 'checked' : ''} aria-label="Pin ${escHtml(r.team)}" /></td>
      <td class="team-cell"><a href="${escHtml(teamHref(r.team))}">${escHtml(r.team)}</a></td>
      <td>${escHtml(r.conference)}</td>
      <td class="num">${fmtInt(r.volume)}</td>
      ${showShare ? `<td class="num">${isNum(r.share) ? r.share + '%' : '—'}</td>` : ''}
      ${fields.map((f, i) => `<td class="num">${fmtField(f, r.values[i])}</td>`).join('')}
      <td class="num">${r.rank ? `<span class="rk">#${r.rank[0]}<small> /${r.rank[1]}</small></span>` : '—'}</td>
    </tr>`;
  }).join('');

  return `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
}