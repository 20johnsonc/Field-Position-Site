// src/lib/prRender.ts
// HTML-string builders shared by PassingRushingTab.astro (first paint) and its
// client <script> (defense toggle / game filter / modal), so both always draw
// identical tiles. Needs prFormat.ts next to it.
import {
  fmtInt, fmtNum, fmtRate, fmtPct, fmtField, tint, deltaLabel, judge, isNum, gameLabel, rankLabel,
  PASS_FIELDS, RUSH_FIELDS, MIN_ATT_SEASON, MIN_ATT_GAME,
  type Side, type Field,
} from './prFormat';

export const PASS_ZONES = [
  { key: 'deep left', label: 'Deep Left' },
  { key: 'deep middle', label: 'Deep Middle' },
  { key: 'deep right', label: 'Deep Right' },
  { key: 'short left', label: 'Short Left' },
  { key: 'short middle', label: 'Short Middle' },
  { key: 'short right', label: 'Short Right' },
];
export const RUSH_DIRS = [
  { key: 'left', label: 'Run Left' },
  { key: 'middle', label: 'Run Middle' },
  { key: 'right', label: 'Run Right' },
];

export interface Ctx { side: Side; isGame: boolean }

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

const minN = (isGame: boolean) => (isGame ? MIN_ATT_GAME : MIN_ATT_SEASON);
const rankTag = (b: any, key: string) => {
  const r = rankLabel(b, key);
  return r ? `<em class="rank-tag ${r.cls}" title="Rank among FBS teams">${r.text}</em>` : '';
};
const mi = (label: string, value: string) =>
  `<div class="m-item"><span>${label}</span> <strong>${value}</strong></div>`;

export function zoneLabel(type: 'passing' | 'rushing', key: string): string {
  const list = type === 'passing' ? PASS_ZONES : RUSH_DIRS;
  return list.find((z) => z.key === key)?.label ?? key;
}

// ---- "Where the yards come from" bar (rushing) -------------------------------------------
// Line / second-level / open-field yards are per-carry averages. The bar shows each as a
// share of the three combined (they are separate CFBD measures and need not add to YPC).
export function yardsSplitHtml(r: any): string {
  const parts = [
    { key: 'line', label: 'Line', v: r?.line_yards },
    { key: 'second', label: '2nd level', v: r?.second_level_yards },
    { key: 'open', label: 'Open field', v: r?.open_field_yards },
  ];
  const nums = parts.map((p) => (isNum(p.v) ? Math.max(p.v, 0) : 0)); // bar can't draw negatives
  const total = nums.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return '';
  const pct = (i: number) => Math.round((nums[i] / total) * 100);
  const segs = parts.map((p, i) => nums[i] <= 0 ? '' :
    `<span class="seg ${p.key}" style="flex:${nums[i]}" title="${p.label}: ${fmtNum(p.v)} per carry (${pct(i)}% of the three)">${pct(i) >= 15 ? `${pct(i)}%` : ''}</span>`
  ).join('');
  const legend = parts.map((p) =>
    `<span class="yl-item"><i class="yl-dot ${p.key}"></i>${p.label} <strong>${fmtNum(p.v)}</strong></span>`
  ).join('');
  const aria = parts.map((p) => `${p.label} ${fmtNum(p.v)}`).join(', ');
  return `<div class="yards-split"><div class="yards-split-title">Where the yards come from <span>(per carry)</span></div><div class="yards-bar" role="img" aria-label="Yards per carry by source: ${aria}">${segs}</div><div class="yards-legend">${legend}</div></div>`;
}

// ---- Tiles ---------------------------------------------------------------------
export function passGridHtml(sideObj: any, lgPass: any, { side, isGame }: Ctx): string {
  const min = minN(isGame);
  return PASS_ZONES.map(({ key, label }) => {
    const z = sideObj?.zones?.[key] ?? {};
    const att: number = z.attempts ?? 0;
    const thin = att > 0 && att < min;
    const cls = ['zone-card', 'pass-card', thin ? 'is-thin' : '', att === 0 ? 'is-empty' : ''].filter(Boolean).join(' ');
    // Only color tiles with enough plays to mean something.
    const bg = att >= min ? tint(z.success_rate, lgPass?.zones?.[key]?.success_rate, side) : 'transparent';
    return `
<div class="${cls}" style="--tint:${bg}" data-zone="${key}" data-type="passing" data-unknown="false" role="button" tabindex="0" aria-label="${label} passing details">
  <div class="card-main">
    <div class="card-header">
      <span class="card-label">${label}</span>
      ${att > 0 && z.share_of_attempts != null ? `<span class="share-badge">${z.share_of_attempts}% of throws</span>` : ''}
    </div>
    <div class="card-value">${att ? fmtNum(z.completion_pct) : '—'}<span class="unit">${att ? '%' : ''}</span></div>
    <div class="card-sub">${fmtInt(z.completions ?? 0)} / ${fmtInt(att)} completions${(z.interceptions ?? 0) > 0 ? `<span class="int-chip">${z.interceptions} INT</span>` : ''}${thin ? '<span class="thin-chip">small sample</span>' : ''}</div>
  </div>
  <div class="card-metrics-grid">
    ${mi('Yards', fmtInt(z.yards))}
    ${mi('YPC', fmtNum(z.yards_per_completion))}
    ${mi('Success', fmtRate(z.success_rate) + rankTag(z, 'success_rate'))}
    ${mi('PPA', fmtNum(z.ppa, 2) + rankTag(z, 'ppa'))}
  </div>
</div>`;
  }).join('');
}

export function rushGridHtml(sideObj: any, lgRush: any, { side, isGame }: Ctx): string {
  const min = minN(isGame);
  return RUSH_DIRS.map(({ key, label }) => {
    const r = sideObj?.directions?.[key] ?? {};
    const n: number = r.carries ?? 0;
    const thin = n > 0 && n < min;
    const cls = ['zone-card', 'rush-card', thin ? 'is-thin' : '', n === 0 ? 'is-empty' : ''].filter(Boolean).join(' ');
    const bg = n >= min ? tint(r.success_rate, lgRush?.directions?.[key]?.success_rate, side) : 'transparent';
    return `
<div class="${cls}" style="--tint:${bg}" data-zone="${key}" data-type="rushing" data-unknown="false" role="button" tabindex="0" aria-label="${label} rushing details">
  <div class="card-main">
    <div class="card-header">
      <span class="card-label">${label}</span>
      ${n > 0 && r.share_of_carries != null ? `<span class="share-badge green-badge">${r.share_of_carries}% of carries</span>` : ''}
    </div>
    <div class="card-value">${n ? fmtInt(r.yards) : '—'}<span class="unit">${n ? 'yds' : ''}</span></div>
    <div class="card-sub">${fmtInt(n)} carries${thin ? '<span class="thin-chip">small sample</span>' : ''}</div>
  </div>
  <div class="card-metrics-grid">
    ${mi('YPC', fmtNum(r.yards_per_carry))}
    ${mi('Success', fmtRate(r.success_rate) + rankTag(r, 'success_rate'))}
    ${mi('Stuff', fmtRate(r.stuff_rate))}
    ${mi('PPA', fmtNum(r.ppa) + rankTag(r, 'ppa'))}
  </div>
  ${n > 0 ? yardsSplitHtml(r) : ''}
</div>`;
  }).join('');
}

export function unknownHtml(type: 'passing' | 'rushing', u: any): string {
  const p = type === 'passing';
  const n = (p ? u?.attempts : u?.carries) ?? 0;
  if (n === 0) return ''; // nothing unmapped: skip the banner instead of showing a row of zeros
  return `
<div class="zone-card wide-card unknown-card" data-zone="unknown" data-type="${type}" data-unknown="true" role="button" tabindex="0" aria-label="${p ? 'Passes with no recorded location' : 'Rushes with no recorded direction'}">
  <div class="wide-header">
    <span class="card-label">${p ? 'No recorded location' : 'No recorded direction'}</span>
    <span class="card-sub">${p ? `${fmtInt(u?.completions ?? 0)} / ${fmtInt(n)} completions` : `${fmtInt(n)} carries`}</span>
  </div>
  <div class="wide-metrics">
    ${mi('Yards', fmtInt(u?.yards))}
    ${p ? mi('YPA', fmtNum(u?.yards_per_attempt)) : mi('YPC', fmtNum(u?.yards_per_carry))}
    ${p ? mi('Comp %', fmtPct(u?.completion_pct)) : mi('Stuff', fmtRate(u?.stuff_rate))}
    ${mi('Success', fmtRate(u?.success_rate))}
    ${mi('PPA', fmtNum(u?.ppa, 2))}
  </div>
</div>`;
}
export const passUnknownHtml = (sideObj: any) => unknownHtml('passing', sideObj?.unknown);
export const rushUnknownHtml = (sideObj: any) => unknownHtml('rushing', sideObj?.unknown);

// ---- Summary strip + coverage notes --------------------------------------------------
export function passSummaryHtml(pSide: any): string {
  const p = pSide?.total ?? {};
  return `
<div class="pr-summary-row">
  <span class="pr-summary-title"><span class="dot blue-dot"></span>Passing</span>
  ${mi('Att', fmtInt(p.attempts))}${mi('Comp %', fmtPct(p.completion_pct) + rankTag(p, 'completion_pct'))}${mi('Yards', fmtInt(p.yards))}
  ${mi('YPA', fmtNum(p.yards_per_attempt))}${mi('ADOT', fmtNum(p.adot))}${mi('INT', fmtInt(p.interceptions))}
  ${mi('Success', fmtRate(p.success_rate) + rankTag(p, 'success_rate'))}${mi('PPA', fmtNum(p.ppa, 2) + rankTag(p, 'ppa'))}
</div>`;
}

export function rushSummaryHtml(rSide: any): string {
  const r = rSide?.total ?? {};
  return `
<div class="pr-summary-row">
  <span class="pr-summary-title"><span class="dot green-dot"></span>Rushing</span>
  ${mi('Carries', fmtInt(r.carries))}${mi('Yards', fmtInt(r.yards))}${mi('YPC', fmtNum(r.yards_per_carry) + rankTag(r, 'yards_per_carry'))}
  ${mi('TD', fmtInt(r.touchdowns))}${mi('Success', fmtRate(r.success_rate) + rankTag(r, 'success_rate'))}${mi('Stuff', fmtRate(r.stuff_rate) + rankTag(r, 'stuff_rate'))}
  ${mi('Line yds', fmtNum(r.line_yards))}${mi('PPA', fmtNum(r.ppa, 2) + rankTag(r, 'ppa'))}
</div>`;
}

export const passCoverage = (sideObj: any) =>
  `${fmtInt(sideObj?.located_attempts)} of ${fmtInt(sideObj?.total?.attempts)} pass attempts have a recorded zone; the rest are in the row above.`;
export const rushCoverage = (sideObj: any) =>
  `Team totals also include sacks, kneels and unattributed carries, so ${fmtInt(sideObj?.located_carries)} of ${fmtInt(sideObj?.total?.carries)} carries have a direction.`;

// ---- Modal --------------------------------------------------------------------------
const modalRow = (label: string, value: string, hint?: string) =>
  `<div class="modal-row"><span${hint ? ` title="${esc(hint)}"` : ''}>${label}</span><strong>${value}</strong></div>`;

function fieldRows(fields: Field[], b: any, lgB: any, side: Side): string {
  return fields.map((f) => {
    const v = b?.[f.key];
    const lv = lgB?.[f.key];
    const d = f.better ? deltaLabel(f, v, lv) : null;
    const rk = rankLabel(b, f.key, true);
    const bits = [
      d ? `<span class="${judge(f, v, lv, side)}">${d} vs fbs avg</span>` : '',
      rk ? `<span class="rk ${rk.cls}">${rk.text}</span>` : '',
    ].filter(Boolean).join(' · ');
    return modalRow(f.label, `${fmtField(f, v)}${bits ? `<em class="delta">${bits}</em>` : ''}`, f.hint);
  }).join('');
}

export function trendHtml(o: {
  games: any[]; type: 'passing' | 'rushing'; side: Side; kind: 'zones' | 'directions'; key: string; lg?: number | null;
}): string {
  const { games, type, side, kind, key, lg } = o;
  const pts = games.map((g) => {
    const b = g?.[type]?.[side]?.[kind]?.[key];
    const n: number = (type === 'passing' ? b?.attempts : b?.carries) ?? 0;
    return { label: gameLabel(g), v: isNum(b?.success_rate) && n > 0 ? (b.success_rate as number) : null, n };
  });
  if (pts.filter((p) => p.v != null).length < 2) return '';
  const W = 320, H = 70, gap = 3;
  const bw = Math.max((W - gap * (pts.length - 1)) / pts.length, 2);
  const top = Math.max(...pts.map((p) => p.v ?? 0), isNum(lg) ? lg : 0, 0.05) * 1.1;
  const y = (v: number) => H - (v / top) * (H - 6);
  const bars = pts.map((p, i) => p.v == null ? '' :
    `<rect class="bar ${type}${p.n < MIN_ATT_GAME ? ' thin' : ''}" x="${(i * (bw + gap)).toFixed(1)}" y="${y(p.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - y(p.v)).toFixed(1)}" rx="1.5"><title>${esc(p.label)}: ${fmtRate(p.v)} success on ${p.n} ${type === 'passing' ? 'attempts' : 'carries'}</title></rect>`
  ).join('');
  const line = isNum(lg)
    ? `<line class="lg-line" x1="0" x2="${W}" y1="${y(lg).toFixed(1)}" y2="${y(lg).toFixed(1)}"></line>` : '';
  return `<div class="trend"><div class="trend-title">Success rate by game${isNum(lg) ? ' <span>(dashed = FBS avg)</span>' : ''}</div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Success rate by game">${bars}${line}</svg></div>`;
}

export function modalHtml(o: {
  type: 'passing' | 'rushing'; key: string; unknown: boolean; sideObj: any; league: any; side: Side; games: any[];
}): string {
  const { type, key, unknown, sideObj, league, side, games } = o;
  const passing = type === 'passing';
  const kind = passing ? 'zones' : 'directions';
  const b = unknown ? sideObj?.unknown : sideObj?.[kind]?.[key];
  const lgB = unknown ? null : league?.[type]?.[kind]?.[key];
  const n = (passing ? b?.attempts : b?.carries) ?? 0;
  if (!n) return `<p class="modal-empty">No ${passing ? 'pass attempts' : 'carries'} recorded here.</p>`;

  const share = passing ? b?.share_of_attempts : b?.share_of_carries;
  let html = '';
  if (!passing) html += yardsSplitHtml(b);
  if (!unknown && share != null) html += modalRow(passing ? 'Share of pass attempts' : 'Share of carries', `${share}%`);
  html += fieldRows(passing ? PASS_FIELDS : RUSH_FIELDS, b, lgB, side);
  if (!unknown && games.length > 1) {
    html += trendHtml({ games, type, side, kind, key, lg: lgB?.success_rate });
  }
  return html;
}