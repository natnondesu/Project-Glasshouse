import { describe, expect, it } from 'vitest';
import { bomCsv, bomRows, csvCell } from './bom';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { unknownDemand } from './demand';
import { createWorkspace } from './factories';
import { findRoom } from './lookup';
import type { Rack, Template, Workspace } from './model/types';
import { createObject } from './objects';

function seeded(): Workspace {
  const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
  let ws = createWorkspace();
  const t = (id: string) => ws.catalog.find((x) => x.id === id) as Template;
  const steps: WorkspaceCommand[] = [
    { type: 'project/create', id: 'p', name: 'Northgate' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'Site A' },
    { type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' },
    { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: rack.id, bottomU: 20, template: t('tpl-server-2u') } },
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'ch', rackId: rack.id, bottomU: 5, template: t('tpl-chassis-6u') } },
    ...[1, 2, 3, 4, 5].map((slot): WorkspaceCommand => ({ type: 'plan', roomId: 'r', command: { type: 'node/insert', id: `n${slot}`, chassisId: 'ch', slot, template: t('tpl-node') } })),
    { type: 'plan', roomId: 'r', command: { type: 'node/update', id: 'n3', patch: { demand: unknownDemand(), config: '2× CPU, "fast" RAM\nhot-swap' } } },
  ];
  for (const step of steps) {
    const r = apply(ws, step);
    if (!r.ok) throw new Error(r.error.message);
    ws = r.value;
  }
  return ws;
}

describe('BOM', () => {
  it('AC19: lists every device including each node, with parent chassis and slot', () => {
    const rows = bomRows(findRoom(seeded(), 'r')!);
    expect(rows.map((r) => [r.kind, r.name, r.chassis, r.slot, r.position])).toEqual([
      ['Chassis', 'CH-01', '', '', 'U5–U10'],
      ['Node', 'NODE-01', 'CH-01', '1', 'U5–U10'],
      ['Node', 'NODE-02', 'CH-01', '2', 'U5–U10'],
      ['Node', 'NODE-03', 'CH-01', '3', 'U5–U10'],
      ['Node', 'NODE-04', 'CH-01', '4', 'U5–U10'],
      ['Node', 'NODE-05', 'CH-01', '5', 'U5–U10'],
      ['Device', 'SRV-01', '', '', 'U20–U21'],
    ]);
    expect(rows[0]).toMatchObject({ project: 'Northgate', site: 'Site A', room: 'MDF-1', rack: 'RK-01', model: 'Chassis 6U · 5 slots (Generic 6U chassis)', demandW: '20' });
    expect(rows[3]).toMatchObject({ demandW: 'unknown', heightU: '0' });
  });

  it('writes RFC 4180 CSV with a header and escaped cells', () => {
    const csv = bomCsv(bomRows(findRoom(seeded(), 'r')!));
    const [header] = csv.split('\r\n');
    expect(header).toBe('Project,Site,Room,Rack,Parent chassis,Slot,Type,Name,Template / model,Category,Position,Height (U),Depth (mm),Demand (W),Configuration,Notes');
    expect(csv).toContain('"2× CPU, ""fast"" RAM\nhot-swap"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell('plain')).toBe('plain');
  });
});
