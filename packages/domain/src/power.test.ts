import { describe, expect, it } from 'vitest';
import { known, unknownDemand } from './demand';
import { emptyContent } from './factories';
import type { Chassis, PlacedDevice, PlanContent, Rack } from './model/types';
import { createObject } from './objects';
import { deviceDemandTotal, rackPower, roomPower } from './power';

const node = (slot: number, watts: number | null) => ({
  id: `n${slot}`,
  templateId: 't',
  templateVersion: 1,
  name: `NODE-0${slot}`,
  demand: watts === null ? unknownDemand() : known(watts),
  config: '',
  notes: '',
  slot,
});
const chassis = (nodes: ReturnType<typeof node>[]): Chassis => ({
  id: 'ch',
  templateId: 't',
  templateVersion: 1,
  name: 'CH-01',
  demand: known(20),
  config: '',
  notes: '',
  kind: 'chassis',
  bottomU: 5,
  heightU: 6,
  depthMm: 780,
  slotCount: 5,
  slotsPerRow: 5,
  nodes,
});
const server = (watts: number | null): PlacedDevice => ({
  id: 's',
  templateId: 't',
  templateVersion: 1,
  name: 'SRV-01',
  demand: watts === null ? unknownDemand() : known(watts),
  config: '',
  notes: '',
  kind: 'device',
  category: 'compute',
  bottomU: 20,
  heightU: 2,
  depthMm: 780,
});
const roomWith = (rack: Partial<Rack>, survey: Partial<PlanContent['survey']> = {}): PlanContent => {
  const base = emptyContent();
  return { ...base, survey: { ...base.survey, ...survey }, objects: [{ ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), ...rack }] };
};

describe('power', () => {
  it('AC06: a 6U chassis with 20 W overhead and five 150 W nodes draws 770 W', () => {
    expect(deviceDemandTotal(chassis([1, 2, 3, 4, 5].map((s) => node(s, 150))))).toEqual({ knownW: 770, unknownCount: 0 });
  });

  it('counts unknown demand separately and never as zero', () => {
    expect(deviceDemandTotal(chassis([node(1, 150), node(2, null)]))).toEqual({ knownW: 170, unknownCount: 1 });
    const rack = { devices: [server(null)], reserved: [{ id: 'r', label: 'Customer', bottomU: 1, heightU: 4, demand: unknownDemand(), notes: '' }] };
    expect(rackPower({ ...(createObject('rack', { x: 0, y: 0 }, []) as Rack), ...rack })).toEqual({
      devices: { knownW: 0, unknownCount: 1 },
      reserved: { knownW: 0, unknownCount: 1 },
    });
  });

  it('compares known room demand with the design limit, including known reserved ranges', () => {
    const content = roomWith(
      { devices: [server(3500)], reserved: [{ id: 'r', label: 'Customer', bottomU: 1, heightU: 4, demand: known(600), notes: '' }] },
      { powerBudget: 5000, designLimitPct: 80 },
    );
    expect(roomPower(content)).toEqual({ knownW: 4100, unknownDevices: 0, unknownReserved: 0, budgetW: 5000, limitW: 4000, limitPct: 80, overLimit: true });
  });

  it('treats a known 0 W as known', () => {
    expect(deviceDemandTotal(server(0))).toEqual({ knownW: 0, unknownCount: 0 });
  });
});
