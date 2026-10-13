import { describe, expect, it } from 'vitest';
import { cameraPosition, defaultCamera, dollyToward, orbit, panGround, MAX_ELEVATION, MIN_ELEVATION } from './camera';

const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]!);
const norm = (v: number[]) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};

describe('room 3D camera', () => {
  it('frames the room from above at an angle', () => {
    const cam = defaultCamera(6, 5);
    expect(cam.target[0]).toBeCloseTo(3);
    expect(cam.target[2]).toBeCloseTo(2.5);
    expect(cameraPosition(cam)[1]).toBeGreaterThan(cam.target[1]);
  });

  it('keeps the floor point under the pointer fixed while zooming (pointer-anchored dolly)', () => {
    const cam = defaultCamera(6, 5);
    const p: [number, number, number] = [1, 0, 1];
    const before = norm(sub(p, cameraPosition(cam)));
    const next = dollyToward(cam, 0.6, p);
    expect(next.distance).toBeCloseTo(cam.distance * 0.6);
    const after = norm(sub(p, cameraPosition(next)));
    after.forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 6));
  });

  it('never orbits under the floor or over the top', () => {
    const cam = defaultCamera(6, 5);
    expect(orbit(cam, 0, 100000).elevation).toBe(MAX_ELEVATION);
    expect(orbit(cam, 0, -100000).elevation).toBe(MIN_ELEVATION);
    expect(orbit(cam, 100, 0).azimuth).not.toBe(cam.azimuth);
  });

  it('pans the target along the floor, keeping its height', () => {
    const cam = defaultCamera(6, 5);
    const moved = panGround(cam, 40, 0, 800, 45);
    expect(moved.target[1]).toBe(cam.target[1]);
    expect(Math.hypot(moved.target[0] - cam.target[0], moved.target[2] - cam.target[2])).toBeGreaterThan(0);
    expect(moved.distance).toBe(cam.distance);
  });
});
