import { describe, expect, it } from 'vitest';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { createWorkspace } from './factories';
import { findSite } from './lookup';
import type { Workspace } from './model/types';
import { exportProjectFile, parseProjectFile } from './projectFile';
import { createSampleProject } from './sample';
import { createShowcaseProject } from './sampleShowcase';
import { parseWorkspace } from './schema';

const AT = '2026-10-18T00:00:00.000Z';

function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, cmd) => {
    const r = apply(w, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
}

const seeded = (): Workspace =>
  run(
    createWorkspace(),
    { type: 'project/create', id: 'p', name: 'Northgate' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'Bangna campus' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' },
  );

describe('site/locate', () => {
  it('starts every new site without a location', () => {
    expect(findSite(seeded(), 's')?.site.location).toBeUndefined();
  });

  it('sets, moves and clears a site location', () => {
    const placed = run(seeded(), { type: 'site/locate', siteId: 's', location: { lat: 13.668, lon: 100.605 } });
    expect(findSite(placed, 's')?.site.location).toEqual({ lat: 13.668, lon: 100.605 });
    const moved = run(placed, { type: 'site/locate', siteId: 's', location: { lat: -33.8688, lon: 151.2093 } });
    expect(findSite(moved, 's')?.site.location).toEqual({ lat: -33.8688, lon: 151.2093 });
    const cleared = run(moved, { type: 'site/locate', siteId: 's', location: null });
    expect(findSite(cleared, 's')?.site).not.toHaveProperty('location');
  });

  it('keeps six decimals (about 10 cm) and nothing else from what was sent', () => {
    const ws = run(seeded(), { type: 'site/locate', siteId: 's', location: { lat: 13.66812345678, lon: 100.60598765432, zoom: 17 } as never });
    expect(findSite(ws, 's')?.site.location).toEqual({ lat: 13.668123, lon: 100.605988 });
  });

  it.each([
    [{ lat: 90.0001, lon: 0 }, 'Latitude must be between -90 and 90.'],
    [{ lat: -91, lon: 0 }, 'Latitude must be between -90 and 90.'],
    [{ lat: 0, lon: 180.5 }, 'Longitude must be between -180 and 180.'],
    [{ lat: 0, lon: -181 }, 'Longitude must be between -180 and 180.'],
    [{ lat: Number.NaN, lon: 0 }, 'Latitude must be between -90 and 90.'],
    [{ lat: 0, lon: Number.POSITIVE_INFINITY }, 'Longitude must be between -180 and 180.'],
    [{ lat: '13.6', lon: 100 }, 'Latitude must be between -90 and 90.'],
    [{ lon: 100 }, 'Latitude must be between -90 and 90.'],
    ['13.6,100.6', 'A location is a latitude and a longitude.'],
    [undefined, 'A location is a latitude and a longitude.'],
  ])('refuses %j', (location, message) => {
    const r = apply(seeded(), { type: 'site/locate', siteId: 's', location } as unknown as WorkspaceCommand);
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_value', message } });
  });

  it('accepts the edges of the ranges', () => {
    const ws = run(seeded(), { type: 'site/locate', siteId: 's', location: { lat: -90, lon: 180 } });
    expect(findSite(ws, 's')?.site.location).toEqual({ lat: -90, lon: 180 });
  });

  it('answers a missing site', () => {
    expect(apply(seeded(), { type: 'site/locate', siteId: 'gone', location: null })).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });

  it('is refused on an archived site, and on a site inside an archived project', () => {
    const site = run(seeded(), { type: 'site/archive', siteId: 's', by: 'Ada', at: AT });
    expect(apply(site, { type: 'site/locate', siteId: 's', location: { lat: 1, lon: 2 } })).toMatchObject({ ok: false, error: { code: 'archived', message: 'Site Bangna campus is archived. Restore it to make changes.' } });
    const project = run(seeded(), { type: 'project/archive', projectId: 'p', by: 'Ada', at: AT });
    expect(apply(project, { type: 'site/locate', siteId: 's', location: null })).toMatchObject({ ok: false, error: { code: 'archived' } });
  });
});

describe('a site location on disk', () => {
  it('survives the workspace schema and a project file round trip', () => {
    const ws = run(seeded(), { type: 'site/locate', siteId: 's', location: { lat: 13.668, lon: 100.605 } });
    const parsed = parseWorkspace(JSON.parse(JSON.stringify(ws)));
    expect(parsed.ok && parsed.value.projects[0]!.sites[0]!.location).toEqual({ lat: 13.668, lon: 100.605 });
    const file = exportProjectFile(ws, 'p', AT);
    if (!file.ok) throw new Error(file.error.message);
    const back = parseProjectFile(JSON.parse(JSON.stringify(file.value)));
    expect(back.ok && back.value.project.sites[0]!.location).toEqual({ lat: 13.668, lon: 100.605 });
  });

  it('loads files from before locations existed', () => {
    const parsed = parseWorkspace(JSON.parse(JSON.stringify(seeded())));
    expect(parsed.ok && parsed.value.projects[0]!.sites[0]!).not.toHaveProperty('location');
  });

  it('refuses a stored location out of range', () => {
    const ws = run(seeded());
    const raw = JSON.parse(JSON.stringify(ws));
    raw.projects[0].sites[0].location = { lat: 120, lon: 0 };
    expect(parseWorkspace(raw).ok).toBe(false);
  });
});

describe('sample sites', () => {
  const sites = (r: ReturnType<typeof createSampleProject>) => {
    if (!r.ok) throw new Error(r.error.message);
    return Object.fromEntries(r.value.sites.map((s) => [s.name, s.location]));
  };

  it('places the sample sites around Bangkok (illustrative coordinates)', () => {
    const all = { ...sites(createSampleProject(AT)), ...sites(createShowcaseProject(AT)) };
    expect(Object.keys(all).sort()).toEqual(['Bangna campus', 'Riverside Annex', 'Riverside Campus']);
    for (const location of Object.values(all)) {
      expect(location!.lat).toBeGreaterThan(13.5);
      expect(location!.lat).toBeLessThan(14);
      expect(location!.lon).toBeGreaterThan(100.3);
      expect(location!.lon).toBeLessThan(100.8);
    }
  });
});
