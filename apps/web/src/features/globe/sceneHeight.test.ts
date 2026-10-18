import { describe, expect, it } from 'vitest';
import { sceneHeight } from './SiteCard';

describe('how tall the card’s 3D may be', () => {
  it('is its usual size when the map is tall, or nothing is measured yet', () => {
    expect(sceneHeight(undefined, 4)).toBe(180);
    expect(sceneHeight(900, 4)).toBe(180);
  });

  it('gives way to the facts and the first three rooms on a short map', () => {
    const two = sceneHeight(470, 2)!;
    const four = sceneHeight(510, 4);
    expect(two).toBeGreaterThanOrEqual(110);
    expect(two).toBeLessThan(180);
    expect(four).toBeGreaterThanOrEqual(110);
  });

  it('folds away when only a sliver would be left', () => {
    expect(sceneHeight(380, 4)).toBeNull();
    expect(sceneHeight(494, 4)).toBeNull();
  });
});
