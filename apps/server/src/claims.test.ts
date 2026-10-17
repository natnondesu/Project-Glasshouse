import { describe, expect, it } from 'vitest';
import { CLAIM_IDLE_MS, ClaimRegistry } from './claims';

const ploy = { id: 'u-p', name: 'Ploy' };
const eddie = { id: 'u-e', name: 'Eddie' };

function clock(start = Date.parse('2026-10-18T09:00:00.000Z')) {
  let t = start;
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

describe('ClaimRegistry', () => {
  it('lets the first editor claim by editing, renews on each edit, and blocks others', () => {
    const c = clock();
    const reg = new ClaimRegistry(c.now);
    expect(reg.canEdit('r', ploy.id)).toBe(true);
    reg.touch('r', ploy);
    expect(reg.holder('r')).toMatchObject({ roomId: 'r', userId: 'u-p', name: 'Ploy', since: '2026-10-18T09:00:00.000Z' });
    c.advance(60_000);
    reg.touch('r', ploy);
    expect(reg.holder('r')!.lastEditAt).toBe('2026-10-18T09:01:00.000Z');
    expect(reg.canEdit('r', eddie.id)).toBe(false);
  });

  it('allows a takeover only after 15 idle minutes, or by an admin', () => {
    const c = clock();
    const reg = new ClaimRegistry(c.now);
    reg.touch('r', ploy);
    expect(reg.claim('r', eddie, { admin: false })).toMatchObject({ ok: false, claim: { userId: 'u-p' } });
    expect(reg.claim('r', eddie, { admin: true })).toMatchObject({ ok: true, claim: { userId: 'u-e' } });
    reg.touch('r', eddie); // Eddie, holder after the admin takeover, edits once, then goes idle
    c.advance(CLAIM_IDLE_MS);
    expect(reg.claim('r', ploy, { admin: false })).toMatchObject({ ok: true, claim: { userId: 'u-p' } });
  });

  it('releases only the holder’s claim unless an admin asks', () => {
    const reg = new ClaimRegistry(clock().now);
    reg.touch('r', ploy);
    expect(reg.release('r', eddie.id, { admin: false })).toBe(false);
    expect(reg.holder('r')).not.toBeNull();
    expect(reg.release('r', ploy.id, { admin: false })).toBe(true);
    expect(reg.holder('r')).toBeNull();
  });

  it('tells subscribers about every change, and prunes rooms that are gone', () => {
    const reg = new ClaimRegistry(clock().now);
    const seen: number[] = [];
    reg.subscribe((claims) => seen.push(claims.length));
    reg.touch('r', ploy);
    reg.touch('q', eddie);
    reg.touch('r', ploy); // a renewal is a change too: lastEditAt moves
    reg.prune((roomId) => roomId === 'q');
    expect(seen).toEqual([1, 2, 2, 1]);
    expect(reg.list().map((x) => x.roomId)).toEqual(['q']);
  });
});
