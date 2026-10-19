import type { Project } from '@glasshouse/domain';
import { placed, type SiteSummary } from '../globe/sites';
import { fold, hasAll, nameScore, narrowSites, roomText, siteText } from './homeSearch';
import type { RoomSummary } from './rooms';

/** Each group of the dropdown shows this many; the rest are a "Show all" away. */
export const GROUP_CAP = 5;

export type ResultGroup = 'sites' | 'rooms' | 'projects';

export interface ProjectHit {
  project: Project;
  siteIds: string[];
  sites: number;
  rooms: number;
}

export interface SearchResults {
  sites: { shown: SiteSummary[]; all: SiteSummary[] };
  rooms: { shown: RoomSummary[]; all: RoomSummary[] };
  projects: { shown: ProjectHit[]; all: ProjectHit[] };
  /** The placed sites the search keeps: what "Show all on the map" fits. */
  onMap: string[];
}

export type SearchOption =
  | { kind: 'site'; site: SiteSummary }
  | { kind: 'room'; room: RoomSummary }
  | { kind: 'project'; project: ProjectHit }
  | { kind: 'more'; group: ResultGroup; total: number }
  | { kind: 'map'; ids: string[] };

export interface ResultSection {
  group: ResultGroup | 'map';
  options: SearchOption[];
}

/** Best name match first; equal ones keep the tree's order. */
function ranked<T>(items: T[], name: (item: T) => string, words: readonly string[]): T[] {
  return items
    .map((item, i) => ({ item, i, score: nameScore(name(item), words) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item);
}

function projectsOf(sites: SiteSummary[]): ProjectHit[] {
  const byId = new Map<string, ProjectHit>();
  for (const s of sites) {
    const hit = byId.get(s.project.id) ?? { project: s.project, siteIds: [], sites: 0, rooms: 0 };
    byId.set(s.project.id, { ...hit, siteIds: [...hit.siteIds, s.site.id], sites: hit.sites + 1, rooms: hit.rooms + s.rooms.length });
  }
  return [...byId.values()];
}

/**
 * What the search finds, grouped for the dropdown: rooms by their project, site and room names together (the rooms the
 * page keeps); sites by their own and their project's names (not merely for holding a matching room); projects by name.
 */
export function searchResults(sites: SiteSummary[], words: readonly string[], cap = GROUP_CAP): SearchResults {
  if (words.length === 0) return { sites: { shown: [], all: [] }, rooms: { shown: [], all: [] }, projects: { shown: [], all: [] }, onMap: [] };
  const allSites = ranked(
    sites.filter((s) => hasAll(siteText(s), words)),
    (s) => s.site.name,
    words,
  );
  const allRooms = ranked(
    sites.flatMap((s) => s.rooms.filter((r) => hasAll(roomText(r), words))),
    (r) => r.room.name,
    words,
  );
  const allProjects = ranked(
    projectsOf(sites).filter((p) => hasAll(fold(p.project.name), words)),
    (p) => p.project.name,
    words,
  );
  const kept = new Set(narrowSites(sites, words).map((s) => s.site.id));
  return {
    sites: { shown: allSites.slice(0, cap), all: allSites },
    rooms: { shown: allRooms.slice(0, cap), all: allRooms },
    projects: { shown: allProjects.slice(0, cap), all: allProjects },
    onMap: placed(sites)
      .filter((s) => kept.has(s.site.id))
      .map((s) => s.site.id),
  };
}

export const isEmpty = (r: SearchResults): boolean => r.sites.all.length === 0 && r.rooms.all.length === 0 && r.projects.all.length === 0;

/** The dropdown's options in order, by group: Sites, Rooms, Projects (each with its "Show all"), then the map. */
export function resultSections(r: SearchResults): ResultSection[] {
  if (isEmpty(r)) return [];
  const more = (group: ResultGroup, shown: number, total: number): SearchOption[] => (total > shown ? [{ kind: 'more', group, total }] : []);
  const sections: ResultSection[] = [
    { group: 'sites', options: [...r.sites.shown.map((site): SearchOption => ({ kind: 'site', site })), ...more('sites', r.sites.shown.length, r.sites.all.length)] },
    { group: 'rooms', options: [...r.rooms.shown.map((room): SearchOption => ({ kind: 'room', room })), ...more('rooms', r.rooms.shown.length, r.rooms.all.length)] },
    { group: 'projects', options: [...r.projects.shown.map((project): SearchOption => ({ kind: 'project', project })), ...more('projects', r.projects.shown.length, r.projects.all.length)] },
    { group: 'map', options: r.onMap.length > 0 ? [{ kind: 'map', ids: r.onMap }] : [] },
  ];
  return sections.filter((s) => s.options.length > 0);
}
