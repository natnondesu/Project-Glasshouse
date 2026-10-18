export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

export interface Cluster {
  ids: string[];
  x: number;
  y: number;
}

interface Group {
  members: ScreenPoint[];
  x: number;
  y: number;
}

const centre = (members: ScreenPoint[]): { x: number; y: number } => ({
  x: members.reduce((s, m) => s + m.x, 0) / members.length,
  y: members.reduce((s, m) => s + m.y, 0) / members.length,
});

/**
 * Markers closer than `radius` pixels merge, closest pair first, until every marker has room; a merged marker sits at
 * the centre of its sites. Deterministic: the same points always give the same markers, in the order first seen.
 */
export function clusterPoints(points: readonly ScreenPoint[], radius: number): Cluster[] {
  const groups: Group[] = points.map((p) => ({ members: [p], x: p.x, y: p.y }));
  for (;;) {
    let best: [number, number] | null = null;
    let bestD = radius;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const d = Math.hypot(groups[i]!.x - groups[j]!.x, groups[i]!.y - groups[j]!.y);
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
    if (!best) break;
    const [i, j] = best;
    const members = [...groups[i]!.members, ...groups[j]!.members];
    groups[i] = { members, ...centre(members) };
    groups.splice(j, 1);
  }
  const order = new Map(points.map((p, i) => [p.id, i]));
  return groups.map((g) => ({ ids: g.members.map((m) => m.id).sort((a, b) => order.get(a)! - order.get(b)!), x: g.x, y: g.y }));
}

/** One marker per key (the world view: one per country), at the centre of its points, in the order first seen. */
export function clusterByKey(points: readonly ScreenPoint[], keyOf: (id: string) => string): (Cluster & { key: string })[] {
  const byKey = new Map<string, ScreenPoint[]>();
  for (const p of points) {
    const key = keyOf(p.id);
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  return [...byKey].map(([key, members]) => ({ ids: members.map((m) => m.id), ...centre(members), key }));
}
