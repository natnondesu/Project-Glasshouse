import { expect, it } from 'vitest';
import type { TopoEdge, TopoNode } from './topology';
import { portTags } from './portTags';

const node = (id: string, x: number, y: number, leaf = false): TopoNode => ({ id, name: id.toUpperCase(), x, y, w: 152, h: 50, leaf } as TopoNode);
const link = (a: string, ap: string, b: string, bp: string) => ({ id: `${a}${ap}`, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
const byId = new Map([node('sw', 300, 40), node('s1', 100, 200), node('s2', 400, 200)].map((n) => [n.id, n]));
const edges = [
  { key: 'sw|s1', a: 'sw', b: 's1', tree: true, links: [link('sw', 'Gi1/0/1', 's1', 'eth0')] },
  { key: 'sw|s2', a: 'sw', b: 's2', tree: true, links: [link('s2', 'eth0', 'sw', 'Gi1/0/2'), link('sw', 'Gi1/0/3', 's2', 'eth1'), link('sw', 'Gi1/0/4', 's2', 'eth2'), link('sw', 'Gi1/0/5', 's2', 'eth3')] },
] as unknown as TopoEdge[];
const more = (n: number) => `+${n} more`;

it('tags each bundle at the neighbour, selected port first, whichever end the cable was entered from', () => {
  const tags = portTags('sw', edges, byId, more);
  expect(tags.map((t) => t.lines)).toEqual([['Gi1/0/1 ⇄ eth0'], ['Gi1/0/2 ⇄ eth0', 'Gi1/0/3 ⇄ eth1', '+2 more']]);
  // Next to each server, not stacked at the switch.
  expect(new Set(tags.map((t) => t.x)).size).toBe(2);
  expect(tags.every((t) => t.up && t.y < 200)).toBe(true);
});

it('from a server, tags its uplink under the switch', () => {
  const [tag] = portTags('s1', edges, byId, more);
  expect(tag).toMatchObject({ lines: ['eth0 ⇄ Gi1/0/1'], up: false });
  expect(tag!.y).toBeGreaterThan(40);
});

it('collapses a LAG into one line naming both groups', () => {
  const lagAt = (r: { deviceId: string; port: string }) => (r.deviceId === 'sw' && r.port !== 'Gi1/0/2' ? 'Po2' : r.deviceId === 's2' ? 'bond0' : undefined);
  const tags = portTags('sw', edges, byId, more, lagAt, (n) => `${n} links`);
  expect(tags[1]!.lines).toEqual(['Po2 ⇄ bond0 · 3 links', 'Gi1/0/2 ⇄ eth0']);
});

it('keeps a tag above a leaf to two lines, so it fits between wrapped rows', () => {
  const leaves = new Map([node('sw', 300, 40), node('s2', 400, 200, true)].map((n) => [n.id, n]));
  const [tag] = portTags('sw', [edges[1]!], leaves, more);
  expect(tag!.lines).toEqual(['Gi1/0/2 ⇄ eth0', '+3 more']);
});
