import { seedTemplates } from './catalog';
import { newId } from './ids';
import type { Port, PortMedia, Rack, RackOwner, SimpleObject, SimpleObjectType, Template } from './model/types';
import { createObject } from './objects';

/** Building blocks shared by the sample projects. */
export const template = (id: string): Template => {
  const t = seedTemplates().find((x) => x.id === id);
  if (!t) throw new Error(`Seed template ${id} is missing`);
  return t;
};

export function rack(name: string, x: number, y: number, owner: RackOwner = 'oxygenai'): Rack {
  return { ...(createObject('rack', { x, y }, []) as Rack), id: newId(), name, owner };
}

/** A wall-mounted MCB panel, turned so its back sits on the wall at x = 0 or y = 0. */
export function mcb(name: string, x: number, y: number, onLeftWall: boolean): SimpleObject {
  return { ...(createObject('mcb', { x, y }, []) as SimpleObject), id: newId(), name, angle: onLeftWall ? 270 : 0 };
}

export function existingRack(name: string, x: number, y: number): SimpleObject {
  return { ...(createObject('existing_rack', { x, y }, []) as SimpleObject), id: newId(), name };
}

/** Any other room object; `x, y` is its corner before rotation. */
export function thing(type: SimpleObjectType, name: string, x: number, y: number, extra: Partial<SimpleObject> = {}): SimpleObject {
  return { ...(createObject(type, { x, y }, []) as SimpleObject), id: newId(), name, ...extra };
}

/** Ports added one by one, as an engineer would on site: the team catalog's templates carry none. */
export function portRun(prefix: string, from: number, to: number, media: PortMedia, speed: string): Port[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ name: `${prefix}${from + i}`, media, speed }));
}

