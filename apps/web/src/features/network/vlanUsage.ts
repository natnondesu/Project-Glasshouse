import { carriedVids, racksOf, type PlanContent } from '@glasshouse/domain';

/** How many ports in the room carry each VLAN (access, allowed on a trunk, or native). */
export function vlanUsage(content: PlanContent): Map<number, number> {
  const counts = new Map<number, number>();
  for (const rack of racksOf(content)) {
    for (const d of rack.devices) {
      for (const owner of [d, ...(d.kind === 'chassis' ? d.nodes : [])]) {
        for (const p of owner.ports ?? []) for (const vid of carriedVids(content, p.vlan)) counts.set(vid, (counts.get(vid) ?? 0) + 1);
      }
    }
  }
  return counts;
}
