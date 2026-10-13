import { describe, expect, it } from 'vitest';
import { applyPlanCommand } from './commands/plan';
import { known } from './demand';
import { emptyContent } from './factories';
import type { PlacedDevice, Rack, ReservedRange } from './model/types';
import { createObject } from './objects';
import { checkSpan, formatURange, lowestFreeBottomU, rackSpans, usedU } from './occupancy';

const dev = (id: string, bottomU: number, heightU: number): PlacedDevice => ({
  id,
  templateId: 't',
  templateVersion: 1,
  name: id,
  demand: known(100),
  config: '',
  notes: '',
  kind: 'device',
  category: 'compute',
  bottomU,
  heightU,
  depthMm: 700,
});
const reserved = (id: string, bottomU: number, heightU: number): ReservedRange => ({ id, label: 'Customer core', bottomU, heightU, demand: { kind: 'unknown' }, notes: '' });
const rackWith = (devices: PlacedDevice[], ranges: ReservedRange[] = []): Rack => ({
  ...(createObject('rack', { x: 1, y: 1 }, []) as Rack),
  name: 'RK-01',
  devices,
  reserved: ranges,
});

describe('occupancy', () => {
  it('lists spans bottom-up and counts used U', () => {
    const rack = rackWith([dev('SRV-B', 10, 2), dev('SRV-A', 1, 4)], [reserved('r', 20, 5)]);
    expect(rackSpans(rack).map((s) => s.id)).toEqual(['SRV-A', 'SRV-B', 'r']);
    expect(usedU(rack)).toBe(11);
  });

  it('rejects overlaps, overflow and non-whole positions with plain messages', () => {
    const rack = rackWith([dev('SRV-A', 10, 2)]);
    expect(checkSpan(rack, { id: 'SRV-B', label: 'SRV-B', bottomU: 11, heightU: 2 })?.error.message).toBe('SRV-B would overlap SRV-A at U11.');
    expect(checkSpan(rack, { id: 'SRV-B', label: 'SRV-B', bottomU: 40, heightU: 4 })?.error.message).toBe('SRV-B needs U40–U43, but RK-01 has 42U.');
    expect(checkSpan(rack, { id: 'SRV-B', label: 'SRV-B', bottomU: 2.5, heightU: 1 })?.error.message).toBe('Positions are whole U, starting at U1.');
    expect(checkSpan(rack, { id: 'SRV-A', label: 'SRV-A', bottomU: 11, heightU: 2 })).toBeNull();
    expect(checkSpan(rack, { id: 'SRV-B', label: 'SRV-B', bottomU: 12, heightU: 2 })).toBeNull();
  });

  it('finds the lowest free span', () => {
    const rack = rackWith([dev('a', 1, 4), dev('b', 7, 1)]);
    expect(lowestFreeBottomU(rack, 2)).toBe(5);
    expect(lowestFreeBottomU(rack, 3)).toBe(8);
    expect(lowestFreeBottomU(rackWith([dev('full', 1, 42)]), 1)).toBeNull();
  });

  it('formats U ranges', () => {
    expect(formatURange({ bottomU: 5, heightU: 6 })).toBe('U5–U10');
    expect(formatURange({ bottomU: 42, heightU: 1 })).toBe('U42');
  });
});

describe('rack capacity guard', () => {
  it('refuses to shrink capacity below the highest occupied U, naming the rack', () => {
    const rack = rackWith([dev('SRV-A', 19, 2)]);
    const added = applyPlanCommand(emptyContent(), { type: 'object/add', object: rack });
    if (!added.ok) throw new Error(added.error.message);
    const r = applyPlanCommand(added.value, { type: 'object/update', id: rack.id, patch: { capacityU: 18 } });
    expect(r).toMatchObject({ ok: false, error: { message: "RK-01 is occupied up to U20, so its capacity can't go below 20U." } });
    expect(applyPlanCommand(added.value, { type: 'object/update', id: rack.id, patch: { capacityU: 20 } }).ok).toBe(true);
  });
});
