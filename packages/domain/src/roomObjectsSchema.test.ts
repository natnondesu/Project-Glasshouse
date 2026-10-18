import { describe, expect, it } from 'vitest';
import { apply } from './commands/workspace';
import { createWorkspace } from './factories';
import { createObject } from './objects';
import { withSample } from './sample';
import { parseWorkspace } from './schema';
import type { Workspace } from './model/types';

function withObjects(types: Parameters<typeof createObject>[0][]): Workspace {
  let ws = createWorkspace();
  for (const cmd of [
    { type: 'project/create', id: 'p', name: 'P' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' },
  ] as const) {
    const r = apply(ws, cmd);
    if (!r.ok) throw new Error(r.error.message);
    ws = r.value;
  }
  types.forEach((type, i) => {
    const r = apply(ws, { type: 'plan', roomId: 'r', command: { type: 'object/add', object: createObject(type, { x: 0.2 + i * 0.01, y: 0.2 }, []) } });
    if (!r.ok) throw new Error(r.error.message);
    ws = r.value;
  });
  return ws;
}
const roundTrip = (ws: Workspace) => parseWorkspace(JSON.parse(JSON.stringify(ws)));

describe('schema with the new room objects', () => {
  it('accepts every new object type, with a wall height where they have one', () => {
    const ws = withObjects(['partition', 'wall_split_ac', 'precision_ac', 'display_wall']);
    const parsed = roundTrip(ws);
    expect(parsed.ok).toBe(true);
    const objects = parsed.ok ? parsed.value.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!.content.objects : [];
    expect(objects.map((o) => o.type)).toEqual(['partition', 'wall_split_ac', 'precision_ac', 'display_wall']);
    expect(objects[1]).toMatchObject({ wallBottomM: 2.2 });
  });

  it('still accepts workspaces saved before the new objects, with no schema bump', () => {
    const old = withObjects(['furniture', 'door', 'existing_rack', 'rack']);
    expect(old.schemaVersion).toBe(9);
    expect(roundTrip(old).ok).toBe(true);
    const sample = withSample(createWorkspace(), '2026-10-18T00:00:00.000Z');
    if (!sample.ok) throw new Error(sample.error.message);
    expect(roundTrip(sample.value).ok).toBe(true);
  });

  it('refuses an unknown object type as before', () => {
    const ws = JSON.parse(JSON.stringify(withObjects(['furniture'])));
    ws.projects[0].sites[0].rooms[0].plan.revisions[0].content.objects[0].type = 'hot_tub';
    const r = parseWorkspace(ws);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(/^Saved data is not a valid Glasshouse workspace/);
  });
});
