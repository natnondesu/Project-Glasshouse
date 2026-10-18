import { beforeEach, describe, expect, it } from 'vitest';
import { useHomeView, viewParams } from './homeView';

beforeEach(() => useHomeView.getState().reset());

describe('Home’s view in the address', () => {
  it('reads the search, the scope and the room chip from the address', () => {
    useHomeView.getState().load(new URLSearchParams('q=mdf&scope=site:abc&rooms=attention'));
    const { q, scope, filter } = useHomeView.getState();
    expect({ q, scope, filter }).toEqual({ q: 'mdf', scope: { kind: 'site', id: 'abc' }, filter: 'attention' });
  });

  it('writes only what differs from the plain Home, and keeps other parameters', () => {
    expect(viewParams({ q: '', scope: { kind: 'world' }, filter: 'all' }).toString()).toBe('');
    const params = viewParams({ q: 'server room', scope: { kind: 'region', level: 'country', code: 'TH' }, filter: 'draft' }, new URLSearchParams('keep=1'));
    expect(params.get('keep')).toBe('1');
    expect(params.get('q')).toBe('server room');
    expect(params.get('scope')).toBe('country:TH');
    expect(params.get('rooms')).toBe('draft');
    // A search of spaces only is no search.
    expect(viewParams({ q: '   ', scope: { kind: 'world' }, filter: 'all' }, params).toString()).toBe('keep=1');
  });

  it('round-trips through the address', () => {
    const view = { q: 'ห้อง', scope: { kind: 'sites' as const, ids: ['a', 'b'] }, filter: 'approved' as const };
    useHomeView.getState().load(viewParams(view));
    const { q, scope, filter } = useHomeView.getState();
    expect({ q, scope, filter }).toEqual(view);
  });

  it('starts over when Home closes, and counts Enter presses and flights', () => {
    const s = useHomeView.getState();
    s.setQ('x');
    s.enter();
    s.flyTo({ kind: 'site', id: 'a' });
    expect(useHomeView.getState()).toMatchObject({ q: 'x', enterSeq: 1, frame: { seq: 1, target: { kind: 'site', id: 'a' } } });
    s.reset();
    expect(useHomeView.getState()).toMatchObject({ q: '', enterSeq: 0, frame: null, scope: { kind: 'world' }, filter: 'all' });
  });
});
