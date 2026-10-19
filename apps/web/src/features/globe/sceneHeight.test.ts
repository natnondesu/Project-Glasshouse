import { describe, expect, it } from 'vitest';
import { sceneHeight } from './SiteCard';

describe('how tall the card’s 3D may be', () => {
  it('is its usual size when the map is tall, or nothing is measured yet', () => {
    expect(sceneHeight(undefined, 4)).toBe(180);
    expect(sceneHeight(900, 4)).toBe(180);
  });

  it('shows by default on a laptop map, ahead of the room list, which scrolls', () => {
    // A 1280×720 screen gives the card about 370 px: the 3D still shows, with one room row in view.
    expect(sceneHeight(370, 4)).toBeGreaterThanOrEqual(110);
    expect(sceneHeight(370, 1)).toBeGreaterThanOrEqual(110);
    expect(sceneHeight(470, 2)).toBe(180);
  });

  it('folds away only when not even a room row would fit beside a useful 3D', () => {
    expect(sceneHeight(300, 4)).toBeNull();
  });
});
