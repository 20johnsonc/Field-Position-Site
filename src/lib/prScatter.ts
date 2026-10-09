// src/lib/prScatter.ts
// Each axis is a fully independent (kind, view, field) choice -- so "Passing PPA"
// on X and "Rushing PPA" on Y is a normal case, not a special one. Built on
// prTable.ts's getBucket()/tableFields()/views() so it stays in sync with the
// table's stat list without duplicating it.
import { isNum, fmtInt, fmtField, type Field } from './prFormat';
import {
  tableFields, views, getBucket, effectiveView, volumeKey,
  type Kind, type Side,
} from './prTable';

// field: 'volume' | a tableFields key.
// adj: use the opponent-adjusted (Massey/Kalman) value instead of the raw one. Kept per
// axis so the helpers below stay pure functions of the spec; the page's single
// Raw/Adjusted toggle just sets it on both axes.
export interface AxisSpec { kind: Kind; view: string; field: string; adj?: boolean }

const KIND_LABEL: Record<Kind, string> = { passing: 'Pass', rushing: 'Rush', overall: 'Overall' };
const VOLUME_LABEL: Record<Kind, string> = { passing: 'Attempts', rushing: 'Carries', overall: 'Plays' };

export interface AxisFieldOption { key: string; label: string }
export function axisFieldOptions(kind: Kind, adjusted = false): AxisFieldOption[] {
  return [
    { key: 'volume', label: VOLUME_LABEL[kind] },
    ...tableFields(kind, adjusted).map((f) => ({ key: f.key, label: f.label })),
  ];
}
export const axisViewOptions = (kind: Kind, adjusted = false) => views(kind, adjusted);

const fieldFor = (kind: Kind, key: string, adjusted = false): Field | null =>
  tableFields(kind, adjusted).find((f) => f.key === key) ?? null;

export function axisLabel(spec: AxisSpec): string {
  const adj = !!spec.adj;
  const stat = spec.field === 'volume'
    ? VOLUME_LABEL[spec.kind]
    : (fieldFor(spec.kind, spec.field, adj)?.label ?? spec.field);
  const kindLabel = KIND_LABEL[spec.kind];
  const v = effectiveView(spec.kind, adj, spec.view);
  const viewLabel = views(spec.kind, adj).find((o) => o.key === v)?.label;
  return v === 'total' || !viewLabel ? `${kindLabel} ${stat}` : `${kindLabel} ${stat} \u2014 ${viewLabel}`;
}

// Which stats a lower raw number is actually "better" on -- drives axis
// inversion so charts read left-to-right / bottom-to-top as "worse to better"
// consistently, and flips correctly for the Defense Allowed side.
export function isStatInverted(side: Side, fieldKey: string): boolean {
  const wantsHighEvenOnDefense = ['interceptions', 'int_rate', 'sacks', 'stuff_rate',];
  return side === 'offense'
    ? wantsHighEvenOnDefense.includes(fieldKey)
    : !wantsHighEvenOnDefense.includes(fieldKey);
}

const bucketFor = (teamData: any, side: Side, spec: AxisSpec) =>
  getBucket(teamData, spec.kind, side, effectiveView(spec.kind, !!spec.adj, spec.view), !!spec.adj);

function getAxisValue(teamData: any, side: Side, spec: AxisSpec): number | null {
  const b = bucketFor(teamData, side, spec);
  if (!b) return null;
  if (spec.field === 'volume') return b[volumeKey(spec.kind)] ?? null;
  const v = b[spec.field];
  return isNum(v) ? v : null;
}

// FIX: this used to read `spec.side ?? 'offense'` -- AxisSpec has no `side`
// field, so that was always undefined and silently fell back to 'offense'
// even while viewing Defense Allowed. Takes the real side explicitly now.
function getAxisVolume(teamData: any, side: Side, spec: AxisSpec): number | null {
  const v = bucketFor(teamData, side, spec)?.[volumeKey(spec.kind)];
  return isNum(v) ? v : null;
}

export function fmtAxisValue(spec: AxisSpec, v: number | null): string {
  if (spec.field === 'volume') return fmtInt(v);
  const f = fieldFor(spec.kind, spec.field, !!spec.adj);
  return f ? fmtField(f, v) : v == null ? '—' : String(v);
}

export interface ScatterPoint {
  team: string; conference: string; x: number; y: number;
  xVol: number | null; yVol: number | null; pinned: boolean;
  color: string;
  match: boolean; // true = matches the current search (or no search active)
}

// Independently looks up each axis's bucket for a team -- x and y can be
// different kinds, different views, or both, with no shared row shape required.
export function buildCrossPoints(options: {
  teams: Record<string, any>;
  side: Side;
  x: AxisSpec;
  y: AxisSpec;
  conf?: string;
  search?: string;
  min?: number;
  pinned?: Set<string>;
}): ScatterPoint[] {
  const conf = options.conf ?? 'ALL';
  const search = (options.search ?? '').trim().toLowerCase();
  const min = options.min ?? 0;
  const pinned = options.pinned ?? new Set<string>();

  const points: ScatterPoint[] = [];

  for (const [teamName, teamData] of Object.entries<any>(options.teams || {})) {
    const teamConf = teamData.conference ?? '—';

    // 1. Hard filter by Conference (a real narrowing, not a search-style highlight)
    if (conf !== 'ALL' && teamConf !== conf) continue;

    const xVal = getAxisValue(teamData, options.side, options.x);
    const yVal = getAxisValue(teamData, options.side, options.y);
    const xVol = getAxisVolume(teamData, options.side, options.x);
    const yVol = getAxisVolume(teamData, options.side, options.y);

    // 2. Hard filter by minimum volume (unless pinned)
    const meetsMin = min <= 0 || ((xVol ?? 0) >= min && (yVol ?? 0) >= min) || pinned.has(teamName);
    if (xVal == null || yVal == null || !meetsMin) continue;

    // 3. Search sets a flag instead of dropping the point, so it highlights/dims
    //    rather than filters -- same idea as the table's row dimming.
    const matchesSearch = !search || teamName.toLowerCase().includes(search) || teamConf.toLowerCase().includes(search);

    points.push({
      team: teamName,
      conference: teamConf, // FIX: was `conf: teamConf`, which didn't match the ScatterPoint interface
      x: xVal,
      y: yVal,
      xVol,
      yVol,
      pinned: pinned.has(teamName),
      color: teamData.color || '#3b82f6',
      match: matchesSearch,
    });
  }

  return points;
}

// Tick formatting per axis (rate -> %, int -> whole number, ...), independent for X and Y.
function tickFmt(spec: AxisSpec, v: number): string {
  if (spec.field === 'volume') return String(Math.round(v));
  const f = fieldFor(spec.kind, spec.field, !!spec.adj);
  if (!f) return v.toFixed(1);
  switch (f.kind) {
    case 'int': return String(Math.round(v));
    case 'rate': return `${Math.round(v * 100)}%`;
    case 'pct': return `${v.toFixed(0)}%`;
    case 'num2': return v.toFixed(2);
    default: return v.toFixed(1);
  }
}

const escHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

export function scatterSvgHtml(o: {
    points: ScatterPoint[]; x: AxisSpec; y: AxisSpec;
    xLabel: string; yLabel: string;
    invertX?: boolean; invertY?: boolean;
    pinned?: Set<string>;
}): string {
  const { points, x, y, xLabel, yLabel, invertX, invertY, pinned } = o;
  if (points.length < 2) {
    return `<p class="scatter-empty">Not enough teams have both stats to plot${points.length ? ' (only 1 match)' : ''}.</p>`;
  }

  const W = 760, H = 460, M = { l: 58, r: 20, t: 16, b: 46 };
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b;

  const pad = (arr: number[]): [number, number] => {
    const min = Math.min(...arr), max = Math.max(...arr);
    const span = max - min || Math.abs(min) || 1;
    return [min - span * 0.08, max + span * 0.08];
  };
  const [xMin, xMax] = pad(points.map((p) => p.x));
  const [yMin, yMax] = pad(points.map((p) => p.y));

  const sizeMetric = points.map((p) => (p.xVol ?? 0) + (p.yVol ?? 0));
  const sMin = Math.min(...sizeMetric), sMax = Math.max(...sizeMetric);

  const sx = (v: number) => {
    const pct = xMax > xMin ? (v - xMin) / (xMax - xMin) : 0.5;
    return M.l + (invertX ? 1 - pct : pct) * plotW;
  };
  const sy = (v: number) => {
    const pct = yMax > yMin ? (v - yMin) / (yMax - yMin) : 0.5;
    return M.t + plotH - (invertY ? 1 - pct : pct) * plotH;
  };
  const sr = (v: number) => 4 + (sMax > sMin ? (v - sMin) / (sMax - sMin) : 0.5) * 7;

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const xMean = mean(points.map((p) => p.x));
  const yMean = mean(points.map((p) => p.y));

  const ticks = (min: number, max: number, n = 5) => Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1));

  const xTicks = ticks(xMin, xMax).map((t) => `
    <line class="grid" x1="${sx(t).toFixed(1)}" x2="${sx(t).toFixed(1)}" y1="${M.t}" y2="${M.t + plotH}"></line>
    <text class="tick" x="${sx(t).toFixed(1)}" y="${M.t + plotH + 18}" text-anchor="middle">${tickFmt(x, t)}</text>`).join('');
  const yTicks = ticks(yMin, yMax).map((t) => `
    <line class="grid" x1="${M.l}" x2="${M.l + plotW}" y1="${sy(t).toFixed(1)}" y2="${sy(t).toFixed(1)}"></line>
    <text class="tick" x="${M.l - 8}" y="${(sy(t) + 4).toFixed(1)}" text-anchor="end">${tickFmt(y, t)}</text>`).join('');

  // A search is "active" only when at least one point actually has one -- an
  // empty search, or one that happens to match every currently-plotted team,
  // both correctly render as "no dimming" rather than dimming everything.
  const hasSearch = points.some((p) => !p.match);

  const dots = points.map((p, i) => {
    const isPinned = p.pinned || pinned?.has(p.team) === true;
    const dotClass = [
      'dot',
      isPinned ? 'pinned' : '',
      hasSearch ? (p.match ? 'match' : 'dimmed') : '',
    ].filter(Boolean).join(' ');

    const cx = sx(p.x);
    const cy = sy(p.y);
    const r = sr(sizeMetric[i]);

    const commonAttributes = `
      class="${dotClass}" tabindex="0"
      style="fill: ${escHtml(p.color)};"
      data-team="${escHtml(p.team)}" data-conf="${escHtml(p.conference)}"
      data-x="${escHtml(fmtAxisValue(x, p.x))}" data-y="${escHtml(fmtAxisValue(y, p.y))}"
      role="button" aria-label="${escHtml(p.team)}: ${escHtml(xLabel)} ${escHtml(fmtAxisValue(x, p.x))}, ${escHtml(yLabel)} ${escHtml(fmtAxisValue(y, p.y))}"`;

    if (isPinned) {
      // Square centered on the same point as the original circle.
      const size = r * 2;
      return `
        <rect ${commonAttributes}
          x="${(cx - size / 2).toFixed(1)}"
          y="${(cy - size / 2).toFixed(1)}"
          width="${size.toFixed(1)}"
          height="${size.toFixed(1)}"></rect>`;
    }

    return `
      <circle ${commonAttributes}
        cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}"
        r="${r.toFixed(1)}"></circle>`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="scatter-svg" role="img" aria-label="${escHtml(xLabel)} vs ${escHtml(yLabel)} scatter plot, one dot per team">
    ${xTicks}${yTicks}
    <line class="mean-line" x1="${sx(xMean).toFixed(1)}" x2="${sx(xMean).toFixed(1)}" y1="${M.t}" y2="${M.t + plotH}"></line>
    <line class="mean-line" x1="${M.l}" x2="${M.l + plotW}" y1="${sy(yMean).toFixed(1)}" y2="${sy(yMean).toFixed(1)}"></line>
    <line class="axis" x1="${M.l}" x2="${M.l + plotW}" y1="${M.t + plotH}" y2="${M.t + plotH}"></line>
    <line class="axis" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${M.t + plotH}"></line>
    <text class="axis-label" x="${M.l + plotW / 2}" y="${H - 6}" text-anchor="middle">${escHtml(xLabel)}</text>
    <text class="axis-label" x="14" y="${M.t + plotH / 2}" text-anchor="middle" transform="rotate(-90 14 ${M.t + plotH / 2})">${escHtml(yLabel)}</text>
    ${dots}
  </svg>`;
}