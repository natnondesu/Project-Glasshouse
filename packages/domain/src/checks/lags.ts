import type { Id, PlanContent, PortRef } from '../model/types';
import { describeEnd } from '../ports';
import type { Issue } from './types';
import { racksOf } from '../devices';

interface Owner {
  id: Id;
  name: string;
  ports: { name: string; speed: string; lag?: string }[];
}

function owners(content: PlanContent): Owner[] {
  return racksOf(content).flatMap((r) => r.devices.flatMap((d) => [d, ...(d.kind === 'chassis' ? d.nodes : [])])).map((d) => ({ id: d.id, name: d.name, ports: d.ports ?? [] }));
}

const lagOf = (content: PlanContent, r: PortRef): string | undefined => describeEnd(content, r).port?.lag;

/** LAG checks, warnings only: members should match in speed, and their cables should land in one group at the far end. */
export function lagIssues(content: PlanContent): Issue[] {
  const issues: Issue[] = [];
  for (const owner of owners(content)) {
    const groups = new Map<string, { name: string; speed: string }[]>();
    for (const p of owner.ports) if (p.lag) groups.set(p.lag, [...(groups.get(p.lag) ?? []), p]);
    for (const [lag, members] of groups) {
      const speeds = [...new Set(members.map((p) => p.speed))];
      if (speeds.length > 1) {
        issues.push({
          key: `lag_speed_mismatch:${owner.id}:${lag}`,
          code: 'lag_speed_mismatch',
          severity: 'warn',
          message: `${owner.name} ${lag} bundles ports of different speeds (${speeds.join(', ')}).`,
          hint: 'A LAG runs at one speed: use ports of the same speed.',
          params: { device: owner.name, lag, speeds: speeds.join(', ') },
          targets: [owner.id],
        });
      }
      const names = new Set(members.map((p) => p.name));
      const far = content.links.flatMap((l) => (l.a.deviceId === owner.id && names.has(l.a.port) ? [l.b] : l.b.deviceId === owner.id && names.has(l.b.port) ? [l.a] : []));
      // Far ends on one device must be one group there; spread over two devices, each grouped, is MLAG or a stack.
      const ungrouped = far.some((r) => !lagOf(content, r));
      const split = [...new Set(far.map((r) => r.deviceId))].some((d) => new Set(far.filter((r) => r.deviceId === d).map((r) => lagOf(content, r))).size > 1);
      if (far.length > 1 && (ungrouped || split)) {
        const devices = [...new Set(far.map((r) => describeEnd(content, r).device))];
        issues.push({
          key: `lag_far_end:${owner.id}:${lag}`,
          code: 'lag_far_end',
          severity: 'warn',
          message: `${owner.name} ${lag}: the far ends on ${devices.join(', ')} aren't one group.`,
          hint: 'Group the far ports into one LAG on each device they reach.',
          params: { device: owner.name, lag, far: devices.join(', ') },
          targets: [owner.id, ...far.map((r) => r.deviceId)],
        });
      }
    }
  }
  return issues;
}
