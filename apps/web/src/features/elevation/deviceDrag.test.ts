import { applyPlanCommand, createObject, emptyContent, type PlanContent, type Rack, type Template } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { useWorkspaceStore, resetWorkspaceStore } from '../../store/workspaceStore';
import { dropPreview } from './deviceDrag';

function setup(): PlanContent {
  resetWorkspaceStore();
  const t = (id: string) => useWorkspaceStore.getState().workspace.catalog.find((x) => x.id === id) as Template;
  const rack = (id: string, x: number) => ({ ...(createObject('rack', { x, y: 1 }, []) as Rack), id, name: id.toUpperCase() });
  let c = emptyContent();
  const run = (cmd: Parameters<typeof applyPlanCommand>[1]) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    c = r.value;
  };
  run({ type: 'object/add', object: rack('rk-a', 1) });
  run({ type: 'object/add', object: rack('rk-b', 3) });
  run({ type: 'device/place', id: 'd1', rackId: 'rk-a', bottomU: 1, template: t('tpl-server-2u') });
  run({ type: 'device/place', id: 'd2', rackId: 'rk-a', bottomU: 10, template: t('tpl-server-2u') });
  return c;
}

describe('dropPreview', () => {
  it('keeps the grab point under the pointer: grabbing the top U of a 2U device', () => {
    expect(dropPreview(setup(), 'd1', 'rk-a', 21, 1)).toMatchObject({ rackId: 'rk-a', bottomU: 20, heightU: 2, ok: true, reason: null });
  });

  it('clamps inside the rack', () => {
    expect(dropPreview(setup(), 'd1', 'rk-a', 1, 1)).toMatchObject({ bottomU: 1 });
    expect(dropPreview(setup(), 'd1', 'rk-a', 60, 0)).toMatchObject({ bottomU: 41 });
  });

  it('flags an overlap with the reason from the domain', () => {
    expect(dropPreview(setup(), 'd1', 'rk-a', 11, 0)).toMatchObject({ ok: false, reason: 'SRV-01 would overlap SRV-02 at U11.' });
  });

  it('moves across racks', () => {
    expect(dropPreview(setup(), 'd2', 'rk-b', 5, 0)).toMatchObject({ rackId: 'rk-b', bottomU: 5, ok: true });
  });

  it('is a no-op where the device already is', () => {
    expect(dropPreview(setup(), 'd1', 'rk-a', 1, 0)).toMatchObject({ ok: true, unchanged: true });
  });

  it('returns null for unknown devices or racks', () => {
    expect(dropPreview(setup(), 'nope', 'rk-a', 1, 0)).toBeNull();
    expect(dropPreview(setup(), 'd1', 'nope', 1, 0)).toBeNull();
  });
});
