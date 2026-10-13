import { describe, expect, it } from 'vitest';
import { seedTemplates } from '../catalog';
import { applyPlanCommand, type PlanCommand } from '../commands/plan';
import { known, unknownDemand } from '../demand';
import { emptyContent } from '../factories';
import type { PlanContent, Rack, Template } from '../model/types';
import { createObject } from '../objects';
import { checkPlan } from './index';

const T: Record<string, Template> = Object.fromEntries(seedTemplates().map((t) => [t.id, t]));
function run(content: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}
const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
const base = (): PlanContent => run(emptyContent(), { type: 'object/add', object: rack });
const place = (id: string, templateId: string, bottomU: number): PlanCommand => ({ type: 'device/place', id, rackId: rack.id, bottomU, template: T[templateId] as Template });
const codes = (c: PlanContent) => checkPlan(c).map((i) => `${i.severity}:${i.code}`);

describe('equipment checks', () => {
  it('passes a rack whose devices are known and fit', () => {
    expect(codes(run(base(), place('s', 'tpl-server-2u', 1)))).toEqual([]);
  });

  it('AC10: blocks a device deeper than the usable depth', () => {
    const c = run(base(), place('s', 'tpl-server-2u', 1), { type: 'device/update', id: 's', patch: { depthMm: 1070 } });
    expect(checkPlan(c)[0]).toMatchObject({ code: 'device_too_deep', severity: 'block', message: 'SRV-01 is 1070 mm deep, but RK-01 accepts 1000 mm.', targets: ['s', rack.id] });
  });

  it('AC14: blocks unknown demand on a device, a chassis overhead and a node', () => {
    const c = run(
      base(),
      place('s', 'tpl-server-1u', 1),
      place('ch', 'tpl-chassis-6u', 5),
      { type: 'node/insert', id: 'n', chassisId: 'ch', slot: 4, template: T['tpl-node'] as Template },
      { type: 'device/update', id: 's', patch: { demand: unknownDemand() } },
      { type: 'device/update', id: 'ch', patch: { demand: unknownDemand() } },
      { type: 'node/update', id: 'n', patch: { demand: unknownDemand() } },
    );
    expect(checkPlan(c).map((i) => i.message)).toEqual([
      'SRV-01 has unknown demand.',
      'CH-01 has unknown chassis overhead.',
      'NODE-01 in slot 4 of CH-01 has unknown demand.',
    ]);
  });

  it('asks for acknowledgement of an unknown reserved range instead of blocking', () => {
    const c = run(base(), { type: 'reserved/add', rackId: rack.id, range: { id: 'r', label: 'Customer core', bottomU: 1, heightU: 14, demand: unknownDemand(), notes: '' } });
    expect(checkPlan(c)).toMatchObject([{ code: 'reserved_demand_unknown', severity: 'needs_ack', message: 'Reserved range U1–U14 in RK-01 has unknown demand.' }]);
  });

  it('blocks known demand above the design limit', () => {
    const c = run(base(), place('s', 'tpl-server-4u', 1), { type: 'device/update', id: 's', patch: { demand: known(4200) } });
    expect(checkPlan(c)[0]).toMatchObject({
      code: 'over_design_limit',
      severity: 'block',
      message: 'Known demand is 4,200 W, above the 4,000 W design limit (80% of 5,000 W).',
    });
  });
});
