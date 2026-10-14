import type { Rack } from '@glasshouse/domain';
import type { Messages } from '../../i18n';

/** "1 Device and 2 Reserved ranges", or null for an empty rack. */
export function describeRackContents(m: Messages, rack: Rack): string | null {
  return m.objects.rackContents(rack.devices.length, rack.reserved.length) || null;
}
