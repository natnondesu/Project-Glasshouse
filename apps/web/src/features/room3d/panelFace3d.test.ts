import { createObject, defaultPanel, emptyContent, type PanelConfig, type PlanContent, type Rack, type SimpleObject } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { buildScene } from './scene';

const mcb = (panel: Partial<PanelConfig> = {}, ways?: number): SimpleObject => {
  const base = defaultPanel();
  return { ...(createObject('mcb', { x: 0, y: 1 }, []) as SimpleObject), id: 'm', name: 'MCB-01', panel: { ...base, ...(ways ? { ways: Array.from({ length: ways }, () => ({ ratingA: 16, label: '' })) } : {}), ...panel } };
};
const sceneOf = (o: SimpleObject, feeds: PlanContent['feeds'] = []) => buildScene({ ...emptyContent(), objects: [o, { ...(createObject('rack', { x: 2, y: 1.5 }, []) as Rack), id: 'rk' }], feeds }).others[0]!;

it('gives an MCB its breakers in the panel arrangement', () => {
  const row = sceneOf(mcb({}, 8)).panel!;
  expect({ columns: row.columns, rows: row.rows }).toEqual({ columns: 8, rows: 1 });
  const two = sceneOf(mcb({ layout: 'two_column' }, 14)).panel!;
  expect({ columns: two.columns, rows: two.rows }).toEqual({ columns: 2, rows: 7 });
  expect(two.cells[1]).toMatchObject({ column: 1, row: 0 });
  const seq = sceneOf(mcb({ layout: 'two_column', numbering: 'sequential' }, 14)).panel!;
  expect(seq.cells[1]).toMatchObject({ column: 0, row: 1 });
  const col = sceneOf(mcb({ layout: 'column' }, 5)).panel!;
  expect({ columns: col.columns, rows: col.rows }).toEqual({ columns: 1, rows: 5 });
});

it('marks the ways that carry a feed, carries the main breaker and the in-use state', () => {
  const feeds = [{ id: 'f', targetId: 'rk', sourceId: 'm', label: 'Feed A', way: 2 }];
  const panel = sceneOf(mcb({ mainRatingA: 63, inUse: false }), feeds).panel!;
  expect(panel.cells.filter((c) => c.fed).map((c) => c.way)).toEqual([2]);
  expect(panel).toMatchObject({ mainRatingA: 63, inUse: false });
  expect(sceneOf(mcb()).panel!.inUse).toBe(true);
  expect(sceneOf(mcb()).panel).not.toHaveProperty('mainRatingA');
});

it('leaves other objects without panel data', () => {
  expect(buildScene({ ...emptyContent(), objects: [createObject('ups', { x: 1, y: 1 }, [])] }).others[0]).not.toHaveProperty('panel');
});
