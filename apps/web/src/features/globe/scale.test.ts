import { expect, it } from 'vitest';
import { scaleBar } from './scale';

it('picks a round distance that fits the bar, in km or m', () => {
  // 28 px a degree (Thailand framed): 111.32 km / 28 px ≈ 3.98 km a pixel; 120 px ≈ 477 km, so 200 km.
  expect(scaleBar(28)).toEqual({ label: '200 km', px: expect.closeTo(50.3, 0) });
  expect(scaleBar(1000).label).toBe('10 km');
  expect(scaleBar(30000)).toMatchObject({ label: '200 m' });
  expect(scaleBar(30000).px).toBeLessThanOrEqual(120);
  expect(scaleBar(30000).px).toBeGreaterThan(40);
});
