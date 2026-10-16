import type { Id, PortRef } from '@glasshouse/domain';
import { type TopoEdge, type TopoNode } from './topology';

/** Port pairs shown per cable bundle before the rest are summarised. */
export const MAX_TAG_LINES = 3;
/** Above a leaf the tag shares the gap between wrapped rows, which fits two lines. */
const MAX_LEAF_TAG_LINES = 2;

export interface PortTag {
  key: string;
  /** "Gi1/0/3 ⇄ eth0": the selected device's port first. */
  lines: string[];
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  /** Lines stack upwards from (x, y) when the tag sits above a box. */
  up: boolean;
}

/**
 * For each cable bundle touching the selected device, a tag of its port pairs placed next to the
 * neighbour's end of the line. Next to the neighbour, because a switch's end is shared by every
 * branch and the tags would pile up there.
 */
/** A LAG's members collapse into one line: 'Po1 ⇄ bond0 · 4 links'. */
export function portTags(selectedId: Id, edges: TopoEdge[], byId: Map<Id, TopoNode>, more: (n: number) => string, lagAt: (r: PortRef) => string | undefined = () => undefined, links: (n: number) => string = (n) => `${n} links`): PortTag[] {
  const tags: PortTag[] = [];
  for (const e of edges) {
    if (e.a !== selectedId && e.b !== selectedId) continue;
    const other = byId.get(e.a === selectedId ? e.b : e.a);
    const self = byId.get(selectedId);
    if (!other || !self) continue;
    const bundles = new Map<string, number>();
    const pairs: string[] = [];
    for (const l of e.links) {
      const [mine, theirs] = l.a.deviceId === selectedId ? [l.a, l.b] : [l.b, l.a];
      const lag = lagAt(mine);
      if (!lag) {
        pairs.push(`${mine.port} ⇄ ${theirs.port}`);
        continue;
      }
      const key = `${lag} ⇄ ${lagAt(theirs) ?? theirs.port}`;
      bundles.set(key, (bundles.get(key) ?? 0) + 1);
    }
    pairs.unshift(...[...bundles].map(([k, n]) => (n > 1 ? `${k} · ${links(n)}` : k)));
    const max = other.leaf ? MAX_LEAF_TAG_LINES : MAX_TAG_LINES;
    const lines = pairs.length > max ? [...pairs.slice(0, max - 1), more(pairs.length - (max - 1))] : pairs;
    tags.push({ key: e.key, lines, ...placeNear(self, other, e.tree) });
  }
  return tags;
}

const TAG_GAP = 8;

function placeNear(self: TopoNode, other: TopoNode, tree: boolean): Omit<PortTag, 'key' | 'lines'> {
  const cx = other.x + other.w / 2;
  if (tree) {
    // The neighbour below: just above its box. Above: just under its box, where the line leaves it.
    return other.y > self.y ? { x: cx, y: other.y - TAG_GAP, anchor: 'middle', up: true } : { x: cx, y: other.y + other.h + TAG_GAP + 10, anchor: 'middle', up: false };
  }
  if (other.y === self.y) {
    return other.x > self.x
      ? { x: other.x - TAG_GAP, y: other.y + other.h / 2 - TAG_GAP, anchor: 'end', up: true }
      : { x: other.x + other.w + TAG_GAP, y: other.y + other.h / 2 - TAG_GAP, anchor: 'start', up: true };
  }
  // A straight cross link: a quarter of the way back from the neighbour's centre.
  const [sx, sy] = [self.x + self.w / 2, self.y + self.h / 2];
  const [ox, oy] = [cx, other.y + other.h / 2];
  return { x: ox + (sx - ox) * 0.25, y: oy + (sy - oy) * 0.25, anchor: 'middle', up: oy > sy };
}
