import type { RoomObjectType } from '@glasshouse/domain';

export const TYPE_LABEL: Record<RoomObjectType, string> = {
  rack: 'Rack',
  existing_rack: 'Existing rack',
  door: 'Door',
  mcb: 'MCB panel',
  furniture: 'Furniture',
};
