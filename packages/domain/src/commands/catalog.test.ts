import { CATEGORY_LABEL } from '../catalog';
import { describe, expect, it } from 'vitest';
import { SEED_TEMPLATE_IDS } from '../catalog';
import { formatDemand, known, sumDemand, unknownDemand } from '../demand';
import { createWorkspace } from '../factories';
import type { Template, Workspace } from '../model/types';
import { apply, type WorkspaceCommand } from './workspace';
import { applyCatalogCommand } from './catalog';

const custom = (over: Partial<Template> = {}): Omit<Template, 'version'> => ({
  id: 't-gpu',
  label: 'GPU node 4U',
  model: 'Acme G4',
  category: 'compute',
  mounting: 'rack',
  heightU: 4,
  depthMm: 900,
  demand: known(1200),
  color: '',
  defaultConfig: '8× GPU',
  slotCount: null,
  slotsPerRow: null,
  illustrative: false,
  ...over,
});

function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, cmd) => {
    const r = apply(w, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
}

const message = (ws: Workspace, cmd: WorkspaceCommand): string | null => {
  const r = apply(ws, cmd);
  return r.ok ? null : r.error.message;
};

describe('demand', () => {
  it('sums known watts and counts unknowns separately', () => {
    expect(sumDemand([known(20), unknownDemand(), known(150)])).toEqual({ knownW: 170, unknownCount: 1 });
    expect(formatDemand(known(1500))).toBe('1,500 W');
    expect(formatDemand(unknownDemand())).toBe('unknown');
  });
});

describe('seed catalog', () => {
  it('starts every workspace with six illustrative generic templates', () => {
    const { catalog } = createWorkspace();
    expect(catalog.map((t) => t.id)).toEqual(SEED_TEMPLATE_IDS);
    expect(catalog.every((t) => t.illustrative)).toBe(true);
    expect(catalog.find((t) => t.id === 'tpl-chassis-6u')).toMatchObject({ category: 'chassis', heightU: 6, slotCount: 5, slotsPerRow: 5 });
    expect(catalog.find((t) => t.id === 'tpl-node')).toMatchObject({ mounting: 'slot', heightU: 0, demand: { kind: 'known', watts: 150 } });
  });
});

describe('catalog commands', () => {
  it('creates a version-1 template and rejects a duplicate id', () => {
    const ws = run(createWorkspace(), { type: 'template/create', template: custom() });
    expect(ws.catalog.find((t) => t.id === 't-gpu')).toMatchObject({ version: 1, label: 'GPU node 4U' });
    expect(message(ws, { type: 'template/create', template: custom() })).toBe('A template with this ID already exists.');
  });

  it('bumps the version and clears "illustrative" on update', () => {
    const ws = run(createWorkspace(), { type: 'template/update', id: 'tpl-server-2u', patch: { demand: known(500) } });
    expect(ws.catalog.find((t) => t.id === 'tpl-server-2u')).toMatchObject({ version: 2, illustrative: false, demand: { watts: 500 } });
  });

  it('validates templates with plain messages', () => {
    const ws = createWorkspace();
    expect(message(ws, { type: 'template/create', template: custom({ mounting: 'slot', category: 'network' }) })).toBe('Nodes use the Compute category.');
    expect(message(ws, { type: 'template/create', template: custom({ category: 'chassis' }) })).toBe('A Chassis needs between 1 and 64 slots.');
    expect(message(ws, { type: 'template/create', template: custom({ category: 'chassis', slotCount: 4, slotsPerRow: 5 }) })).toBe('Slots per row must be between 1 and 4.');
    expect(message(ws, { type: 'template/create', template: custom({ heightU: 0 }) })).toBe('Rack devices are 1 to 60 U high.');
    expect(message(ws, { type: 'template/create', template: custom({ depthMm: 50 }) })).toBe('Depth must be a whole number from 100 to 1500 mm.');
    expect(message(ws, { type: 'template/create', template: custom({ demand: known(-5) }) })).toBe('Demand must be between 0 and 20,000 W.');
    expect(message(ws, { type: 'template/create', template: custom({ label: ' ' }) })).toBe("Template name can't be empty.");
  });

  it('normalises slot templates to zero U and no slots', () => {
    const ws = run(createWorkspace(), { type: 'template/create', template: custom({ id: 't-n', mounting: 'slot', heightU: 2, depthMm: 400 }) });
    expect(ws.catalog.find((t) => t.id === 't-n')).toMatchObject({ heightU: 0, depthMm: 0, slotCount: null });
  });

  it('deletes, and restores only the missing seed templates', () => {
    let ws = run(createWorkspace(), { type: 'template/update', id: 'tpl-server-1u', patch: { label: 'Our 1U' } }, { type: 'template/delete', id: 'tpl-node' });
    expect(ws.catalog.some((t) => t.id === 'tpl-node')).toBe(false);
    expect(message(ws, { type: 'template/delete', id: 'tpl-node' })).toBe('That template no longer exists.');
    ws = run(ws, { type: 'catalog/seed' });
    expect(ws.catalog.some((t) => t.id === 'tpl-node')).toBe(true);
    expect(ws.catalog.find((t) => t.id === 'tpl-server-1u')).toMatchObject({ label: 'Our 1U', version: 2 });
  });
});

describe('misc category', () => {
  it('holds passive gear such as patch panels and cable management, at 0 W', () => {
    const r = applyCatalogCommand([], {
      type: 'template/create',
      template: { id: 'tpl-patch', label: 'Patch panel 24p', model: 'Cat6A 24-port 1U', category: 'misc', mounting: 'rack', heightU: 1, depthMm: 120, demand: { kind: 'known', watts: 0 }, color: '', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false },
    });
    expect(r.ok && r.value[0]).toMatchObject({ category: 'misc', demand: { kind: 'known', watts: 0 } });
    expect(CATEGORY_LABEL.misc).toBe('Misc');
  });
});
