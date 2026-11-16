// Team logos/colors from the basketball team data, for use on football pages.
//
// This file is deliberately pure (no node:fs), so it is safe to import from components that
// may run on Cloudflare as well as from prerendered pages. Loading the JSON is the caller's job.
//
// Football (CFBD) and basketball (CBBD) don't always spell a school the same way, so both sides
// are normalized to a key, and known alternates share one key.

export interface TeamBranding {
  team: string;
  logo?: string;
  logo_dark?: string;
  primaryColor?: string;
  secondaryColor?: string;
  mascot?: string;
}

const norm = (s: string) =>
  (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // San José -> San Jose
    .toLowerCase()
    .replace(/[’'.&]/g, '')                           // Hawai'i -> hawaii, Texas A&M -> texas am
    .replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\bst\b/g, 'state');                     // Boise St. -> boise state

// Each row lists names that mean the same school. Add a row when a team is missing a logo.
const ALIAS_GROUPS = [
  ['connecticut', 'uconn'],
  ['ole miss', 'mississippi'],
  ['southern miss', 'southern mississippi'],
  ['umass', 'massachusetts'],
  ['utsa', 'texas san antonio', 'ut san antonio'],
  ['utep', 'texas el paso'],
  ['unlv', 'nevada las vegas'],
  ['ucf', 'central florida'],
  ['usc', 'southern california'],
  ['lsu', 'louisiana state'],
  ['byu', 'brigham young'],
  ['smu', 'southern methodist'],
  ['tcu', 'texas christian'],
  ['uab', 'alabama birmingham'],
  ['pitt', 'pittsburgh'],
  ['app state', 'appalachian state'],
  ['fiu', 'florida international'],
  ['fau', 'florida atlantic'],
  ['sam houston', 'sam houston state'],
  ['ul monroe', 'louisiana monroe'],
  ['nc state', 'north carolina state'],
  ['middle tennessee', 'middle tennessee state'],
  ['miami', 'miami fl'],
  ['miami oh', 'miami ohio'],
  ['louisiana', 'louisiana lafayette', 'ul lafayette'],
  ['california', 'cal'],
  ['army', 'army west point'],
];

const canon = new Map<string, string>();
ALIAS_GROUPS.forEach((g) => {
  const keys = g.map(norm);
  keys.forEach((k) => canon.set(k, keys[0]));
});

/** Normalized lookup key for a team name from either sport. */
export const teamKey = (name: string): string => {
  const k = norm(name);
  return canon.get(k) ?? k;
};

const FIELDS = ['logo', 'logo_dark', 'primaryColor', 'secondaryColor', 'mascot'] as const;

/**
 * Index the `teams` array from basketball rankings.json by teamKey. Pass newest data first: for
 * each team the newest value of each field wins, and older entries only fill fields the newer
 * ones are missing (e.g. a `logo` that the latest season dropped). Teams with no logo are skipped.
 */
export function buildBrandingMap(teams: any[]): Map<string, TeamBranding> {
  const map = new Map<string, TeamBranding>();
  for (const t of teams ?? []) {
    if (!t?.team) continue;
    const k = teamKey(t.team);
    const merged = map.get(k);
    if (!merged) {
      map.set(k, { ...t });
      continue;
    }
    for (const f of FIELDS) if (!merged[f] && t[f]) merged[f] = t[f];
  }
  for (const [k, v] of map) if (!v.logo && !v.logo_dark) map.delete(k);
  return map;
}

// Build once per process: a prerendered site renders hundreds of team pages, and every one
// would otherwise re-read the same basketball files.
let cached: Map<string, TeamBranding> | null = null;
export function getBrandingMap(loadTeams: () => any[]): Map<string, TeamBranding> {
  if (!cached) cached = buildBrandingMap(loadTeams());
  return cached;
}