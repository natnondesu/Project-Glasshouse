import type { Category, SimpleObjectType } from '@glasshouse/domain';

export interface Palette3D {
  floor: string;
  wall: string;
  rack: string;
  rackCustomer: string;
  front: string;
  slotEmpty: string;
  unknown: string;
  column: string;
  wallFill: string;
  sky: string;
  category: Record<Category, string>;
  object: Record<SimpleObjectType, string>;
}

const FALLBACK: Palette3D = {
  floor: '#eef2f5',
  wall: '#0e1824',
  rack: '#333d49',
  rackCustomer: '#7a8794',
  front: '#1c64c8',
  slotEmpty: '#56626f',
  unknown: '#b8322a',
  column: '#cbd4dc',
  wallFill: '#dfe5ea',
  sky: '#e9eef2',
  category: { compute: '#7fa2e8', storage: '#8fc7b4', network: '#b79af0', power: '#e2b46a', chassis: '#9aa6b2', misc: '#a89f90' },
  object: { existing_rack: '#9aa6b2', door: '#b4a794', mcb: '#e2b46a', furniture: '#e2d8ca', wall_plug: '#f4f1ea', industrial_socket: '#2f6fd1', floor_box: '#8b96a1', ups: '#2b333c', pdu: '#3a4554' },
};

/** Reads the design tokens so 3D colours stay in step with the 2D views. */
export function readPalette(el: Element = document.documentElement): Palette3D {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
  return {
    floor: v('--floor', FALLBACK.floor),
    wall: v('--ink', FALLBACK.wall),
    rack: v('--rack', FALLBACK.rack),
    rackCustomer: v('--rack-customer', FALLBACK.rackCustomer),
    front: v('--acc', FALLBACK.front),
    slotEmpty: v('--rack-front', FALLBACK.slotEmpty),
    unknown: v('--block', FALLBACK.unknown),
    column: v('--column', FALLBACK.column),
    wallFill: FALLBACK.wallFill,
    sky: FALLBACK.sky,
    category: {
      compute: v('--compute', FALLBACK.category.compute),
      storage: v('--storage', FALLBACK.category.storage),
      network: v('--network', FALLBACK.category.network),
      power: v('--power', FALLBACK.category.power),
      chassis: v('--chassis', FALLBACK.category.chassis),
      misc: FALLBACK.category.misc,
    },
    object: {
      existing_rack: v('--existing', FALLBACK.object.existing_rack),
      door: v('--desk-edge', FALLBACK.object.door),
      mcb: v('--power', FALLBACK.object.mcb),
      furniture: v('--desk', FALLBACK.object.furniture),
      wall_plug: FALLBACK.object.wall_plug,
      industrial_socket: FALLBACK.object.industrial_socket,
      floor_box: FALLBACK.object.floor_box,
      ups: FALLBACK.object.ups,
      pdu: FALLBACK.object.pdu,
    },
  };
}
