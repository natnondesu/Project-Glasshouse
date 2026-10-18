import type { RoomObjectType, SimpleObjectType } from './types';

export const CURRENT_SCHEMA_VERSION = 9;

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
  wallBottomMaxM: 4,
  powerMinW: 100,
  powerMaxW: 100_000,
  designLimitMinPct: 50,
  designLimitMaxPct: 100,
  nameMaxLength: 80,
  textMaxLength: 2000,
  /** Hard ceiling for any stored text, above every edit limit: guards imports, restores and the shared server. */
  storedTextMaxLength: 10_000,
  deviceDepthMinMm: 100,
  deviceDepthMaxMm: 1500,
  chassisMaxSlots: 64,
  deviceDemandMaxW: 20_000,
} as const;

export const DEFAULT_ROOM = { width: 5, length: 4 } as const;
export const DEFAULT_POWER_BUDGET_W = 5000;
export const DEFAULT_DESIGN_LIMIT_PCT = 80;
export const DEFAULT_CLEARANCE = { front: 1, rear: 0.6 } as const;
/** A typical wall cabinet: 12U, 600 × 500 mm, hung with its bottom at 1.20 m. */
export const DEFAULT_WALL_RACK = { capacityU: 12, w: 0.6, d: 0.5, usableDepthMm: 400, bottomM: 1.2 } as const;

export const DEFAULT_RACK = { w: 0.8, d: 1.1, capacityU: 42, usableDepthMm: 1000 } as const;

export const DEFAULT_SIZES: Record<SimpleObjectType, { w: number; d: number }> = {
  existing_rack: { w: 0.6, d: 1 },
  door: { w: 0.9, d: 0.1 },
  mcb: { w: 0.5, d: 0.2 },
  furniture: { w: 1.2, d: 0.6 },
  wall_plug: { w: 0.15, d: 0.1 },
  industrial_socket: { w: 0.2, d: 0.12 },
  floor_box: { w: 0.3, d: 0.3 },
  ups: { w: 0.6, d: 0.85 },
  /** A third-party PDU is a power bar: a 19-inch strip of sockets. */
  pdu: { w: 0.48, d: 0.1 },
  /** w is the length, d the thickness. */
  partition: { w: 2, d: 0.1 },
  wall_split_ac: { w: 0.9, d: 0.25 },
  precision_ac: { w: 0.8, d: 0.8 },
  display_wall: { w: 3, d: 0.15 },
};

export const DEFAULT_HEIGHTS_M: Record<SimpleObjectType, number> = {
  existing_rack: 2,
  door: 2.1,
  mcb: 1.4,
  furniture: 0.75,
  wall_plug: 0.45,
  industrial_socket: 0.6,
  floor_box: 0.03,
  ups: 1.6,
  pdu: 0.05,
  partition: 2.4,
  wall_split_ac: 0.3,
  precision_ac: 1.95,
  display_wall: 1.7,
};

/** Objects hung on a wall at a height, like a wall rack: they carry `wallBottomM`, which these are created with. */
export const DEFAULT_WALL_BOTTOM_M: Partial<Record<SimpleObjectType, number>> = {
  wall_split_ac: 2.2,
  display_wall: 0.8,
};

/** An object hung with its underside at or above this is walked and worked under, so it is not in the way of a rack's aisle. */
export const CLEARANCE_HEADROOM_M = 2.0;

/** How deep, in front of an object, the planner keeps watch (metres). */
export const ENVIRONMENT_ZONE_M = {
  /** Air blown by a wall split AC. */
  splitAcAirflow: 1,
  /** Service access in front of a precision AC. */
  precisionAcService: 1,
  /** Viewing area in front of a display wall. */
  displayWallViewing: 1.5,
} as const;

export const NAME_PREFIX: Record<RoomObjectType, string> = {
  rack: 'RK',
  existing_rack: 'EX',
  door: 'D',
  mcb: 'MCB',
  furniture: 'F',
  wall_plug: 'WP',
  industrial_socket: 'IS',
  floor_box: 'FB',
  ups: 'UPS',
  pdu: 'PDU',
  partition: 'PT',
  wall_split_ac: 'AC',
  precision_ac: 'PAC',
  display_wall: 'DW',
};
