import { describe, expect, it } from 'vitest';
import { apply } from './commands/workspace';
import { createWorkspace } from './factories';
import { migrate } from './migrations';
import { createObject } from './objects';
import { parseWorkspace } from './schema';

describe('workspace schema', () => {
  it('accepts a fresh and a populated workspace', () => {
    expect(parseWorkspace(createWorkspace()).ok).toBe(true);
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
    const withRack = apply(ws, { type: 'plan', roomId: 'r', command: { type: 'object/add', object: createObject('rack', { x: 1, y: 1 }, []) } });
    expect(withRack.ok && parseWorkspace(JSON.parse(JSON.stringify(withRack.value))).ok).toBe(true);
  });

  it('explains corrupted data instead of resetting', () => {
    const bad = { ...createWorkspace(), projects: [{ id: 'p' }] };
    const r = parseWorkspace(bad);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(/^Saved data is not a valid Glasshouse workspace/);
  });
});

describe('migrations', () => {
  it('rejects non-objects, missing versions and newer schemas', () => {
    expect(migrate(null).ok).toBe(false);
    expect(migrate({}).ok).toBe(false);
    expect(migrate({ schemaVersion: 99 })).toMatchObject({
      ok: false,
      error: { message: 'This data was saved by a newer Glasshouse (schema 99). Update the app to open it.' },
    });
  });

  it('passes current data through unchanged', () => {
    const ws = createWorkspace();
    expect(migrate(ws)).toEqual({ ok: true, value: ws });
  });
});
