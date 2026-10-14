import type { PlanContent } from '../model/types';
import { describeEnd } from '../ports';
import { carriedVids } from '../vlans';
import type { Issue } from './types';

const list = (vids: number[]): string => vids.join(', ');

/** VLAN checks across each cable. Warnings only: a planner may set one end before the other. */
export function vlanIssues(content: PlanContent): Issue[] {
  return content.links.flatMap((link): Issue[] => {
    const a = describeEnd(content, link.a);
    const b = describeEnd(content, link.b);
    const va = a.port?.vlan;
    const vb = b.port?.vlan;
    if (!va || !vb) return [];
    const base = { a: a.device, aPort: link.a.port, b: b.device, bPort: link.b.port };
    const targets = [link.a.deviceId, link.b.deviceId];
    if (va.mode === 'access' && vb.mode === 'access') {
      if (va.vid === vb.vid) return [];
      return [
        {
          key: `vlan_access_mismatch:${link.id}`,
          code: 'vlan_access_mismatch',
          severity: 'warn',
          message: `${a.device} ${link.a.port} is in VLAN ${va.vid} but ${b.device} ${link.b.port} is in VLAN ${vb.vid}.`,
          hint: 'Put both ends in the same VLAN, or make one end a trunk.',
          params: { ...base, va: va.vid, vb: vb.vid },
          targets,
        },
      ];
    }
    if (va.mode !== vb.mode) {
      const access = va.mode === 'access' ? va : (vb as { vid: number });
      const trunk = va.mode === 'trunk' ? va : vb.mode === 'trunk' ? vb : null;
      if (!trunk || trunk.native === access.vid) return [];
      return [
        {
          key: `vlan_native_mismatch:${link.id}`,
          code: 'vlan_native_mismatch',
          severity: 'warn',
          message: `Untagged traffic from VLAN ${access.vid} arrives in native VLAN ${trunk.native ?? 'none'} across ${a.device} ${link.a.port} and ${b.device} ${link.b.port}.`,
          hint: "Set the trunk's native VLAN to the access VLAN, or make both ends trunks.",
          params: { ...base, access: access.vid, native: trunk.native ?? '—' },
          targets,
        },
      ];
    }
    // Two trunks.
    if (va.mode !== 'trunk' || vb.mode !== 'trunk') return [];
    const ca = carriedVids(content, va);
    const cb = carriedVids(content, vb);
    const onlyA = ca.filter((v) => !cb.includes(v));
    const onlyB = cb.filter((v) => !ca.includes(v));
    if (onlyA.length || onlyB.length) {
      const parts = [onlyA.length ? `${list(onlyA)} only on ${a.device}` : '', onlyB.length ? `${list(onlyB)} only on ${b.device}` : ''].filter(Boolean).join(', ');
      return [
        {
          key: `vlan_allowed_mismatch:${link.id}`,
          code: 'vlan_allowed_mismatch',
          severity: 'warn',
          message: `Trunks ${a.device} ${link.a.port} and ${b.device} ${link.b.port} carry different VLANs: ${parts}.`,
          hint: 'Allow the same VLANs on both ends of the trunk.',
          params: { ...base, onlyA: list(onlyA), onlyB: list(onlyB) },
          targets,
        },
      ];
    }
    if (va.native === vb.native) return [];
    return [
      {
        key: `vlan_native_mismatch:${link.id}`,
        code: 'vlan_native_mismatch',
        severity: 'warn',
        message: `Trunks ${a.device} ${link.a.port} and ${b.device} ${link.b.port} have different native VLANs (${va.native ?? 'none'} and ${vb.native ?? 'none'}).`,
        hint: 'Use the same native VLAN on both ends.',
        params: { ...base, trunks: 1, na: va.native ?? '—', nb: vb.native ?? '—' },
        targets,
      },
    ];
  });
}
