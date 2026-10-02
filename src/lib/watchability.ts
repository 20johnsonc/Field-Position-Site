// Front-end helpers for the fields the notebook exports on every 2026 matchup row:
//   kickoff_utc, start_time_tbd, tv_channel, tv_all, watchability_score, watchability_rank
// Pure functions + two tiny DOM helpers. Safe to import from .astro frontmatter (build time)
// and from client scripts / dashboard-controls.ts.

export interface WatchFields {
  kickoffUtc?: string;          // ISO-8601 UTC, e.g. 2026-10-03T16:00:00Z
  startTimeTbd?: boolean;       // true => the time on the game is a placeholder
  tvChannel?: string | null;    // primary channel; null until announced
  tvAll?: string[];
  watchabilityScore?: number;   // 0-100, upcoming games only
  watchabilityRank?: number;    // 1 = most watchable within the week
}

/** Build-time fallback zone. Static builds run in UTC, so we render ET at build and let the
 *  browser upgrade it to the visitor's own zone (see localizeKickoffs). */
export const FALLBACK_TZ = 'America/New_York';

// ---------------------------------------------------------------- kickoff time
export function kickoffMs(g: Pick<WatchFields, 'kickoffUtc' | 'startTimeTbd'>): number | null {
  if (g.startTimeTbd || !g.kickoffUtc) return null;
  const ms = Date.parse(g.kickoffUtc);
  return Number.isFinite(ms) ? ms : null;
}

const KICK_FMT: Intl.DateTimeFormatOptions = {
  weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
};

/** "Sat 12:00 PM EDT", or "TBD". timeZone undefined => the runtime's own zone (browser). */
export function formatKickoff(g: Pick<WatchFields, 'kickoffUtc' | 'startTimeTbd'>, timeZone?: string): string {
  const ms = kickoffMs(g);
  if (ms === null) return 'TBD';
  return new Intl.DateTimeFormat('en-US', { ...KICK_FMT, timeZone }).format(ms);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Markup for a kickoff time. Use this in BOTH server-rendered cards and any client-side
 *  re-render so every instance gets upgraded to the visitor's local time. */
export function kickoffTimeHtml(g: Pick<WatchFields, 'kickoffUtc' | 'startTimeTbd'>, timeZone = FALLBACK_TZ): string {
  const ms = kickoffMs(g);
  if (ms === null) return '<span class="wm-kickoff wm-tbd">Time TBD</span>';
  return `<time class="wm-kickoff" datetime="${new Date(ms).toISOString()}" data-kickoff-ms="${ms}">` +
    `${escapeHtml(formatKickoff(g, timeZone))}</time>`;
}

/** Rewrites every not-yet-localized <time class="wm-kickoff"> under `root` into the visitor's
 *  local zone. Idempotent (skips elements already done), so it is safe inside a MutationObserver. */
export function localizeKickoffs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('time.wm-kickoff[data-kickoff-ms]:not([data-local])').forEach((el) => {
    const ms = Number(el.dataset.kickoffMs);
    if (!Number.isFinite(ms)) return;
    const text = new Intl.DateTimeFormat('en-US', KICK_FMT).format(ms);
    if (el.textContent !== text) el.textContent = text;
    el.title = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'long' }).format(ms);
    el.dataset.local = '1';
  });
}

// ---------------------------------------------------------------- channel / tier
export const channelLabel = (g: Pick<WatchFields, 'tvChannel'>): string => g.tvChannel || 'TV TBD';

export type WatchTier = 'marquee' | 'strong' | 'solid' | 'light';
// Tuned to the week-5 slate: ~top 4% / 15% / 40% of games. Edit freely.
export const TIER_CUTOFFS: Array<[number, WatchTier, string]> = [
  [70, 'marquee', 'Must-watch'],
  [55, 'strong', 'Strong'],
  [40, 'solid', 'Solid'],
  [0, 'light', 'Light'],
];

export function watchTier(score?: number | null): { tier: WatchTier; label: string } | null {
  if (score === undefined || score === null || !Number.isFinite(score)) return null;
  const [, tier, label] = TIER_CUTOFFS.find(([min]) => score >= min) ?? TIER_CUTOFFS[TIER_CUTOFFS.length - 1];
  return { tier, label };
}

export function topWatchable<T extends WatchFields>(games: T[], n = 10): T[] {
  return games
    .filter((g) => g.watchabilityScore !== undefined)
    .sort((a, b) => (b.watchabilityScore! - a.watchabilityScore!) ||
                    ((kickoffMs(a) ?? Infinity) - (kickoffMs(b) ?? Infinity)))
    .slice(0, n);
}

// ---------------------------------------------------------------- client-side sorting
export type SortMode = 'kickoff' | 'watchability';
export interface SortableEl { dataset: Record<string, string | undefined> }
export interface SortableContainer<T extends SortableEl> { children: ArrayLike<T>; appendChild(node: T): unknown }

/** Reorders the cards under `container` using their data-watch / data-kickoff attributes.
 *  Returns true only if the order actually changed (so observers don't loop). Cards missing
 *  data-watch sort last for 'watchability'; cards missing data-kickoff (TBD) sort last for 'kickoff'. */
export function applySort<T extends SortableEl>(container: SortableContainer<T>, mode: SortMode): boolean {
  const items = Array.from(container.children).filter(
    (el) => el.dataset.watch !== undefined || el.dataset.kickoff !== undefined);
  if (items.length < 2) return false;
  const watch = (el: T) => { const v = el.dataset.watch; return v === undefined || v === '' ? -1 : Number(v); };
  const kick = (el: T) => { const v = el.dataset.kickoff; return v === undefined || v === '' ? Infinity : Number(v); };
  const ordered = items.map((el, i) => ({ el, i })).sort((a, b) =>
    mode === 'watchability'
      ? (watch(b.el) - watch(a.el)) || (kick(a.el) - kick(b.el)) || (a.i - b.i)
      : (kick(a.el) - kick(b.el)) || (watch(b.el) - watch(a.el)) || (a.i - b.i)
  ).map((x) => x.el);
  if (ordered.every((el, i) => el === items[i])) return false;
  ordered.forEach((el) => container.appendChild(el));
  return true;
}