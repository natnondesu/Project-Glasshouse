import type { Rack, RoomObjectType } from '@glasshouse/domain';

export const TYPE_LABEL: Record<RoomObjectType, string> = {
  rack: 'Rack',
  existing_rack: 'Existing rack',
  door: 'Door',
  mcb: 'MCB panel',
  furniture: 'Furniture',
  wall_plug: 'Wall plug',
  industrial_socket: 'Industrial socket',
  floor_box: 'Floor box',
  ups: 'UPS',
  pdu: '3rd-party PDU',
};

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "1 Device and 2 Reserved ranges", or null for an empty rack. */
export function describeRackContents(rack: Rack): string | null {
  const parts = [
    rack.devices.length ? count(rack.devices.length, 'Device', 'Devices') : '',
    rack.reserved.length ? count(rack.reserved.length, 'Reserved range', 'Reserved ranges') : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' and ') : null;
}
