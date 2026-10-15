import type { Id } from '@glasshouse/domain';
import { NODE_H, NODE_W, type TopoEdge, type TopoNode } from './topology';

/** Port pairs shown per cable bundle before the rest are summarised. */
export const MAX_TAG_LINES = 3;

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
export function portTags(selectedId: Id, edges: TopoEdge[], byId: Map<Id, TopoNode>, more: (n: number) => string): PortTag[] {
  const tags: PortTag[] = [];
  for (const e of edges) {
    if (e.a !== selectedId && e.b !== selectedId) continue;
    const other = byId.get(e.a === selectedId ? e.b : e.a);
    const self = byId.get(selectedId);
    if (!other || !self) continue;
    const pairs = e.links.map((l) => {
      const [mine, theirs] = l.a.deviceId === selectedId ? [l.a, l.b] : [l.b, l.a];
      return `${mine.port} ⇄ ${theirs.port}`;
    });
    const lines = pairs.length > MAX_TAG_LINES ? [...pairs.slice(0, MAX_TAG_LINES - 1), more(pairs.length - (MAX_TAG_LINES - 1))] : pairs;
    tags.push({ key: e.key, lines, ...placeNear(self, other, e.tree) });
  }
  return tags;
}

const TAG_GAP = 8;

function placeNear(self: TopoNode, other: TopoNode, tree: boolean): Omit<PortTag, 'key' | 'lines'> {
  const cx = other.x + NODE_W / 2;
  if (tree) {
    // The neighbour below: just above its box. Above: just under its box, where the line leaves it.
    return other.y > self.y ? { x: cx, y: other.y - TAG_GAP, anchor: 'middle', up: true } : { x: cx, y: other.y + NODE_H + TAG_GAP + 10, anchor: 'middle', up: false };
  }
  if (other.y === self.y) {
    return other.x > self.x
      ? { x: other.x - TAG_GAP, y: other.y + NODE_H / 2 - TAG_GAP, anchor: 'end', up: true }
      : { x: other.x + NODE_W + TAG_GAP, y: other.y + NODE_H / 2 - TAG_GAP, anchor: 'start', up: true };
  }
  // A straight cross link: a quarter of the way back from the neighbour's centre.
  const [sx, sy] = [self.x + NODE_W / 2, self.y + NODE_H / 2];
  const [ox, oy] = [cx, other.y + NODE_H / 2];
  return { x: ox + (sx - ox) * 0.25, y: oy + (sy - oy) * 0.25, anchor: 'middle', up: oy > sy };
}
