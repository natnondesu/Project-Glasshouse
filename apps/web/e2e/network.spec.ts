import { openRoom } from './nav';
import { expect, test } from '@playwright/test';

test('the Network tab draws the sample cabling, fits it, and opens a device’s ports', async ({ page }) => {
  await page.goto('/');
  await openRoom(page, /Server room A/);
  await page.getByRole('link', { name: 'Network' }).click();
  const diagram = page.getByRole('group', { name: 'Network diagram' });
  await expect(diagram.getByRole('button', { name: /^CORE-01, / })).toBeVisible();
  // Opens fitted, but never below 85%: smaller and the node text drops under the 11px floor, so it scrolls instead.
  const zoom = Number((await page.locator('.network__zoom .mono').textContent())!.replace('%', ''));
  expect(zoom).toBeGreaterThanOrEqual(85);
  expect(zoom).toBeLessThanOrEqual(100);
  await diagram.getByRole('button', { name: /^CORE-01, / }).click();
  await page.getByRole('button', { name: 'Manage ports' }).click();
  await expect(page.getByRole('dialog', { name: 'CORE-01 ports' })).toBeVisible();
});
