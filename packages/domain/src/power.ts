import { sumDemand, ZERO_TOTAL, type DemandTotal } from './demand';
import { racksOf } from './devices';
import type { PlanContent, Rack, RackDevice, Watts } from './model/types';

const add = (a: DemandTotal, b: DemandTotal): DemandTotal => ({ knownW: a.knownW + b.knownW, unknownCount: a.unknownCount + b.unknownCount });

export const deviceDemandTotal = (d: RackDevice): DemandTotal =>
  d.kind === 'chassis' ? sumDemand([d.demand, ...d.nodes.map((n) => n.demand)]) : sumDemand([d.demand]);

export interface RackPower {
  devices: DemandTotal;
  reserved: DemandTotal;
}

export const rackPower = (rack: Rack): RackPower => ({
  devices: rack.devices.map(deviceDemandTotal).reduce(add, ZERO_TOTAL),
  reserved: sumDemand(rack.reserved.map((r) => r.demand)),
});

export interface RoomPower {
  knownW: Watts;
  unknownDevices: number;
  unknownReserved: number;
  budgetW: Watts;
  limitW: Watts;
  limitPct: number;
  overLimit: boolean;
}

export function roomPower(content: PlanContent): RoomPower {
  const racks = racksOf(content).map(rackPower);
  const devices = racks.map((r) => r.devices).reduce(add, ZERO_TOTAL);
  const reserved = racks.map((r) => r.reserved).reduce(add, ZERO_TOTAL);
  const { powerBudget, designLimitPct } = content.survey;
  const limitW = Math.round((powerBudget * designLimitPct) / 100);
  const knownW = devices.knownW + reserved.knownW;
  return {
    knownW,
    unknownDevices: devices.unknownCount,
    unknownReserved: reserved.unknownCount,
    budgetW: powerBudget,
    limitW,
    limitPct: designLimitPct,
    overLimit: knownW > limitW,
  };
}
