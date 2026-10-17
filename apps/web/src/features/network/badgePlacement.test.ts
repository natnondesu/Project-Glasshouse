import { createShowcaseProject, currentRevision } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { badgeAt } from './TopologyDiagram';
import { buildTopology } from './topology';

const BADGE_HALF_H = 10;
/** A pill may touch the top edge of the box its line enters, never sit inside a box. */
const TOUCH_PX = 2;

it('never hides a cable-count pill under a device box, in any leaf wrapping', () => {
  const project = createShowcaseProject('2026-10-17T00:00:00.000Z');
  if (!project.ok) throw new Error(project.error.message);
  let bundles = 0;
  for (const room of project.value.sites.flatMap((s) => s.rooms)) {
    const content = currentRevision(room.plan).content;
    for (const leafCols of [2, 3, 4, 6]) {
      const t = buildTopology(content, { leafCols });
      const byId = new Map(t.nodes.map((n) => [n.id, n]));
      for (const e of t.edges.filter((x) => x.links.length > 1)) {
        bundles += 1;
        const [x, y] = badgeAt(byId.get(e.a)!, byId.get(e.b)!, e.tree);
        const under = t.nodes.filter((n) => x > n.x && x < n.x + n.w && y + BADGE_HALF_H > n.y + TOUCH_PX && y - BADGE_HALF_H < n.y + n.h);
        expect(under.map((n) => `${room.name} cols=${leafCols}: ${e.key} pill inside ${n.name}`)).toEqual([]);
      }
    }
  }
  expect(bundles).toBeGreaterThan(0);
});
