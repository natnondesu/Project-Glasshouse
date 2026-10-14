import { formatWatts } from '../demand';
import { racksOf } from '../devices';
import type { PlanContent } from '../model/types';
import { formatURange } from '../occupancy';
import { roomPower } from '../power';
import type { Issue } from './types';

const UNKNOWN_HINT = "Enter its watts. Your own Devices can't stay unknown.";

export function equipmentIssues(content: PlanContent, acknowledged: ReadonlySet<string> = new Set()): Issue[] {
  const issues: Issue[] = [];
  for (const rack of racksOf(content)) {
    for (const d of rack.devices) {
      if (d.depthMm > rack.usableDepthMm) {
        issues.push({
          key: `device_too_deep:${d.id}`,
          code: 'device_too_deep',
          severity: 'block',
          message: `${d.name} is ${d.depthMm} mm deep, but ${rack.name} accepts ${rack.usableDepthMm} mm.`,
          params: { name: d.name, depth: d.depthMm, rack: rack.name, usable: rack.usableDepthMm },
          hint: 'Use a deeper rack, or a shorter Device.',
          targets: [d.id, rack.id],
        });
      }
      if (d.demand.kind === 'unknown') {
        issues.push({
          key: `demand_unknown:${d.id}`,
          code: 'demand_unknown',
          severity: 'block',
          message: d.kind === 'chassis' ? `${d.name} has unknown chassis overhead.` : `${d.name} has unknown demand.`,
          params: { name: d.name, form: d.kind === 'chassis' ? 'chassis' : 'device' },
          hint: UNKNOWN_HINT,
          targets: [d.id],
        });
      }
      if (d.kind !== 'chassis') continue;
      for (const n of d.nodes) {
        if (n.demand.kind !== 'unknown') continue;
        issues.push({
          key: `demand_unknown:${n.id}`,
          code: 'demand_unknown',
          severity: 'block',
          message: `${n.name} in slot ${n.slot} of ${d.name} has unknown demand.`,
          params: { name: n.name, form: 'node', slot: n.slot, chassis: d.name },
          hint: UNKNOWN_HINT,
          targets: [n.id, d.id],
        });
      }
    }
    for (const r of rack.reserved) {
      if (r.demand.kind !== 'unknown' || acknowledged.has(r.id)) continue;
      issues.push({
        key: `reserved_demand_unknown:${r.id}`,
        code: 'reserved_demand_unknown',
        severity: 'needs_ack',
        message: `Reserved range ${formatURange(r)} in ${rack.name} has unknown demand.`,
        params: { range: formatURange(r), rack: rack.name },
        hint: 'A reviewer must acknowledge it with a reason before approval.',
        targets: [r.id, rack.id],
      });
    }
  }
  const power = roomPower(content);
  if (power.overLimit) {
    issues.push({
      key: 'over_design_limit',
      code: 'over_design_limit',
      severity: 'block',
      message: `Known demand is ${formatWatts(power.knownW)}, above the ${formatWatts(power.limitW)} design limit (${power.limitPct}% of ${formatWatts(power.budgetW)}).`,
      params: { known: formatWatts(power.knownW), limit: formatWatts(power.limitW), pct: power.limitPct, budget: formatWatts(power.budgetW) },
      hint: 'Move load to another room, or raise the power budget only if the site really has it.',
      targets: [],
    });
  }
  return issues;
}
