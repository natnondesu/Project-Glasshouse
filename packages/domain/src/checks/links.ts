import type { PlanContent, PortMedia } from '../model/types';
import { describeEnd, PORT_MEDIA_LABEL } from '../ports';
import type { Issue } from './types';

/** SFP and SFP+ cages take each other's modules; anything else across media needs a converter or the wrong cable. */
const family = (m: PortMedia): string => (m === 'sfp' || m === 'sfp_plus' ? 'sfp' : m);

/** Link checks. Warnings only: a converter or breakout can make a mismatch intentional. */
export function linkIssues(content: PlanContent): Issue[] {
  return content.links.flatMap((link): Issue[] => {
    const a = describeEnd(content, link.a);
    const b = describeEnd(content, link.b);
    if (!a.port || !b.port || family(a.port.media) === family(b.port.media)) return [];
    return [
      {
        key: `link_media_mismatch:${link.id}`,
        code: 'link_media_mismatch',
        severity: 'warn',
        message: `${a.device} ${link.a.port} (${PORT_MEDIA_LABEL[a.port.media]}) is linked to ${b.device} ${link.b.port} (${PORT_MEDIA_LABEL[b.port.media]}).`,
        hint: 'Check the cable or transceiver: these ports take different connectors.',
        targets: [link.a.deviceId, link.b.deviceId],
      },
    ];
  });
}
