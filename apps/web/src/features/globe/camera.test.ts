import { describe, expect, it } from 'vitest';
import { boxOfPoints, clampCamera, flight, fitBox, levelOf, LEVEL_PPD, MAX_PPD, worldCamera, zoomAround } from './camera';

const SIZE = { width: 800, height: 500 };

describe('levels', () => {
  it('names the level from the zoom', () => {
    expect(levelOf(worldCamera(SIZE).ppd)).toBe('world');
    expect(levelOf(LEVEL_PPD.country)).toBe('country');
    expect(levelOf(LEVEL_PPD.province + 1)).toBe('province');
    expect(levelOf(LEVEL_PPD.site)).toBe('site');
  });

  it('fits the whole globe in the shorter side on the world view', () => {
    const cam = worldCamera(SIZE);
    const radius = (cam.ppd * 180) / Math.PI;
    expect(radius * 2).toBeLessThan(SIZE.height);
    expect(radius * 2).toBeGreaterThan(SIZE.height * 0.8);
  });
});

describe('boxOfPoints', () => {
  it('bounds a few points', () => {
    expect(boxOfPoints([{ lat: 13.6, lon: 100.6 }, { lat: 13.75, lon: 100.5 }])).toEqual([[100.5, 13.6], [100.6, 13.75]]);
  });

  it('takes the short way across the antimeridian', () => {
    const [[west], [east]] = boxOfPoints([{ lat: -17, lon: 178 }, { lat: -14, lon: -171 }]);
    expect(west).toBe(178);
    expect(east).toBe(-171);
  });

  it('is a point for one site', () => {
    expect(boxOfPoints([{ lat: 1, lon: 2 }])).toEqual([[2, 1], [2, 1]]);
  });
});

describe('fitBox', () => {
  it('centres Thailand and fills the frame with it', () => {
    const cam = fitBox([[97.35, 5.63], [105.65, 20.45]], SIZE, { padding: 40 });
    expect(cam.lon).toBeCloseTo(101.5, 1);
    expect(cam.lat).toBeCloseTo(13.04, 1);
    // Taller than wide: the height decides.
    expect(cam.ppd).toBeCloseTo((500 - 80) / 14.82, 0);
    expect(levelOf(cam.ppd)).toBe('country');
  });

  it('never zooms past the cap, so one site is not a blank sheet', () => {
    expect(fitBox([[100.6, 13.6], [100.6, 13.6]], SIZE, { padding: 40, maxPpd: 4000 }).ppd).toBe(4000);
  });

  it('wraps a box across the antimeridian', () => {
    const cam = fitBox([[178, -17], [-171, -14]], SIZE, { padding: 40 });
    expect(cam.lon).toBeCloseTo(-176.5, 5);
  });

  it('stays on the world view for sites spread over the globe', () => {
    expect(fitBox([[-120, -40], [150, 60]], SIZE, { padding: 40 }).ppd).toBe(worldCamera(SIZE).ppd);
  });
});

describe('camera limits and zoom', () => {
  it('keeps the zoom between the world view and the closest look, and the centre on the map', () => {
    const world = worldCamera(SIZE).ppd;
    expect(clampCamera({ lon: 190, lat: 95, ppd: 1 }, SIZE)).toEqual({ lon: -170, lat: 85, ppd: world });
    expect(clampCamera({ lon: 0, lat: 0, ppd: 1e9 }, SIZE).ppd).toBe(MAX_PPD);
  });

  it('zooms around a point, keeping that point under the pointer', () => {
    const cam = { lon: 100, lat: 13, ppd: 100 };
    const next = zoomAround(cam, 2, { x: 500, y: 250 }, SIZE);
    expect(next.ppd).toBe(200);
    // 100 px right of centre at 100 px/° is 1° east; after zooming 2× that spot is 50 px from the new centre.
    expect(next.lon).toBeGreaterThan(100);
    expect(next.lon).toBeLessThan(101);
    expect(next.lat).toBeCloseTo(13, 1);
  });
});

describe('flight', () => {
  const from = { lon: 100, lat: 12, ppd: 5 };
  const to = { lon: 100.6, lat: 13.7, ppd: 2000 };

  it('starts and ends exactly on the cameras', () => {
    const f = flight(from, to, SIZE);
    expect(f(0)).toEqual(from);
    expect(f(1)).toEqual(to);
  });

  it('eases: slow at both ends, zoom in log steps', () => {
    const f = flight(from, to, SIZE);
    expect(f(0.1).ppd).toBeLessThan(Math.sqrt(from.ppd * to.ppd));
    expect(f(0.5).ppd).toBeCloseTo(Math.sqrt(from.ppd * to.ppd), 0);
    expect(f(0.9).ppd).toBeGreaterThan(Math.sqrt(from.ppd * to.ppd));
  });

  it('pulls back in the middle of a long trip at the same zoom, so the way there reads', () => {
    const f = flight({ lon: 100, lat: 13, ppd: 300 }, { lon: 151, lat: -33, ppd: 300 }, SIZE);
    expect(f(0.5).ppd).toBeLessThan(300);
    expect(f(0.5).ppd).toBeGreaterThanOrEqual(worldCamera(SIZE).ppd);
  });

  it('goes the short way round the globe', () => {
    const f = flight({ lon: 170, lat: 0, ppd: 10 }, { lon: -170, lat: 0, ppd: 10 }, SIZE);
    const mid = f(0.5).lon;
    expect(Math.abs(Math.abs(mid) - 180)).toBeLessThan(1);
  });
});
