import type { SiteSummary } from '../globe/sites';
import type { RoomSummary } from './rooms';

/**
 * Case- and accent-insensitive text for matching, on both sides: Latin accents go ("cafe" finds "Café"), and so do Thai
 * tone marks and the thanthakhat (่ ้ ๊ ๋ ์), so a name typed without them still finds the room. Thai vowels stay:
 * they tell words apart.
 */
export const fold = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f\u0e48-\u0e4c]/g, '').toLowerCase();

export const queryWords = (query: string): string[] => fold(query).split(/\s+/).filter(Boolean);

const haystack = (...parts: string[]): string => fold(parts.join(' '));
export const hasAll = (text: string, words: readonly string[]): boolean => words.every((w) => text.includes(w));

export const roomText = (r: RoomSummary): string => haystack(r.project.name, r.site.name, r.room.name);
export const siteText = (s: SiteSummary): string => haystack(s.project.name, s.site.name);

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

/** How well a name answers the words: the whole name, its start, a word in it, or only its site's or project's names. */
export function nameScore(name: string, words: readonly string[]): number {
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
