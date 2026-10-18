import type { SiteSummary } from '../globe/sites';
import type { RoomSummary } from './rooms';

/**
 * Case- and accent-insensitive text for matching. Combining marks go on both sides, so "cafe" finds "Café" and a Thai
 * name typed without its tone marks still finds the room; Thai letters themselves are kept.
 */
export const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const queryWords = (query: string): string[] => fold(query).split(/\s+/).filter(Boolean);

const haystack = (...parts: string[]): string => fold(parts.join(' '));
const hasAll = (text: string, words: readonly string[]): boolean => words.every((w) => text.includes(w));

const roomText = (r: RoomSummary): string => haystack(r.project.name, r.site.name, r.room.name);
const siteText = (s: SiteSummary): string => haystack(s.project.name, s.site.name);

/**
 * The sites and rooms a search keeps: a room when its project, site and room names hold every word between them; a
 * site when it keeps a room, or its own names match (a site with no rooms yet). New objects; the input is untouched.
 */
export function narrowSites(sites: SiteSummary[], words: readonly string[]): SiteSummary[] {
  if (words.length === 0) return sites;
  return sites.flatMap((s) => {
    const rooms = s.rooms.filter((r) => hasAll(roomText(r), words));
    if (rooms.length === 0 && !hasAll(siteText(s), words)) return [];
    return [rooms.length === s.rooms.length ? s : { ...s, rooms }];
  });
}

export type TopMatch = { kind: 'room'; room: RoomSummary } | { kind: 'site'; site: SiteSummary };

const EXACT = 100;
const LEADING = 60;
const CONTAINS = 40;
const ELSEWHERE = 10;

function nameScore(name: string, words: readonly string[]): number {
  const folded = fold(name);
  const phrase = words.join(' ');
  if (folded === phrase) return EXACT;
  if (folded.startsWith(phrase)) return LEADING;
  return words.some((w) => folded.includes(w)) ? CONTAINS : ELSEWHERE;
}

/** What Enter goes to: the best name match, a room before a site on a tie (opening the room is the shorter way in). */
export function topMatch(sites: SiteSummary[], words: readonly string[]): TopMatch | null {
  if (words.length === 0) return null;
  let best: { match: TopMatch; score: number } | null = null;
  const consider = (match: TopMatch, score: number): void => {
    if (!best || score > best.score) best = { match, score };
  };
  for (const s of narrowSites(sites, words)) {
    for (const r of s.rooms) consider({ kind: 'room', room: r }, nameScore(r.room.name, words) + 1);
  }
  for (const s of narrowSites(sites, words)) {
    if (hasAll(siteText(s), words)) consider({ kind: 'site', site: s }, nameScore(s.site.name, words));
  }
  return (best as { match: TopMatch } | null)?.match ?? null;
}
