import type { RoomObjectType, SimpleObjectType } from './types';

export const CURRENT_SCHEMA_VERSION = 1;

export const LIMITS = {
  roomMinM: 1,
  roomMaxM: 50,
  minObjectM: 0.1,
  minFloorRectM: 0.1,
  rackMinU: 1,
  rackMaxU: 60,
  usableDepthMinMm: 300,
  usableDepthMaxMm: 1500,
  clearanceMaxM: 3,
  heightMaxM: 10,
  powerMinW: 100,
  powerMaxW: 100_000,
  designLimitMinPct: 50,
  designLimitMaxPct: 100,
  nameMaxLength: 80,
  textMaxLength: 2000,
  deviceDepthMinMm: 100,
  deviceDepthMaxMm: 1500,
  chassisMaxSlots: 64,
  deviceDemandMaxW: 20_000,
} as const;

export const DEFAULT_ROOM = { width: 5, length: 4 } as const;
export const DEFAULT_POWER_BUDGET_W = 5000;
export const DEFAULT_DESIGN_LIMIT_PCT = 80;
export const DEFAULT_CLEARANCE = { front: 1, rear: 0.6 } as const;
export const DEFAULT_RACK = { w: 0.6, d: 1.07, capacityU: 42, usableDepthMm: 1000 } as const;

export const DEFAULT_SIZES: Record<SimpleObjectType, { w: number; d: number }> = {
  existing_rack: { w: 0.6, d: 1 },
  door: { w: 0.9, d: 0.1 },
  mcb: { w: 0.5, d: 0.2 },
  furniture: { w: 1.2, d: 0.6 },
};

export const DEFAULT_HEIGHTS_M: Record<SimpleObjectType, number> = {
  existing_rack: 2,
  door: 2.1,
  mcb: 1.4,
  furniture: 0.75,
};

export const NAME_PREFIX: Record<RoomObjectType, string> = {
  rack: 'RK',
  existing_rack: 'EX',
  door: 'D',
  mcb: 'MCB',
  furniture: 'F',
};
