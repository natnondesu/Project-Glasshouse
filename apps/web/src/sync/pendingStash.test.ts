import { beforeEach, expect, it } from 'vitest';
import { saveStash, takeStash } from './pendingStash';

beforeEach(() => sessionStorage.clear());
const commands = [{ commandId: 'c1', command: { type: 'project/create' as const, id: 'p', name: 'P' } }];

it('gives unsent edits back once, to the same user, while fresh', () => {
  saveStash({ userId: 'u1', clientId: 'tab-1', commands });
  expect(takeStash('u2')).toBeNull();
  expect(takeStash('u1')).toEqual({ clientId: 'tab-1', commands });
  expect(takeStash('u1')).toBeNull();
});

it('drops a stash older than a day or that is unreadable', () => {
  saveStash({ userId: 'u1', clientId: 'tab-1', commands });
  expect(takeStash('u1', Date.now() + 25 * 60 * 60 * 1000)).toBeNull();
  sessionStorage.setItem('glasshouse:unsent', '{nope');
  expect(takeStash('u1')).toBeNull();
});
