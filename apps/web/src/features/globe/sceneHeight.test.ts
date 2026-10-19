import { describe, expect, it } from 'vitest';
import { sceneHeight } from './SiteCard';

describe('how tall the card’s 3D may be', () => {
  it('is its usual size until the card is measured', () => {
    expect(sceneHeight(undefined, 4)).toBe(180);
  });

  it('grows into the room the card has, up to a cap: a one-room site gets a big 3D', () => {
    const one = sceneHeight(480, 1)!;
    const four = sceneHeight(480, 4)!;
    expect(one).toBeGreaterThan(180);
    expect(four).toBeGreaterThanOrEqual(110);
    expect(one).toBeGreaterThan(four);
    expect(sceneHeight(2000, 1)).toBe(320);
  });

  it('keeps two room rows in view when it can, one when space is tight', () => {
    expect(sceneHeight(370, 4)).toBeGreaterThanOrEqual(110);
  });

  it('folds away only when not even one room row would fit beside a useful 3D', () => {
    expect(sceneHeight(300, 4)).toBeNull();
  });
});
