import { seedTemplates } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { filterTemplates } from './templateFilter';

const all = seedTemplates();
const names = (q: string, thai = false) => filterTemplates(all, q, (t) => (thai && t.category === 'server' ? 'เซิร์ฟเวอร์' : t.category)).map((t) => t.label);

it('keeps everything for an empty query', () => {
  expect(names('  ')).toHaveLength(all.length);
});

it('matches every word, in any order and case, across name, category and height', () => {
  const server2u = all.filter((t) => t.category === 'server' && t.heightU === 2 && t.mounting === 'rack').map((t) => t.label);
  expect(server2u.length).toBeGreaterThan(0);
  expect(names('2U SERVER')).toEqual(server2u);
  expect(names('server 2u')).toEqual(server2u);
  expect(names('zzz-not-there')).toEqual([]);
});

it('matches the category in the shown language', () => {
  expect(names('เซิร์ฟเวอร์', true)).toEqual(all.filter((t) => t.category === 'server').map((t) => t.label));
});
