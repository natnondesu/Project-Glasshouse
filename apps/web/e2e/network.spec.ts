import { expect, test } from '@playwright/test';

test('the Network tab draws the sample cabling, fits it, and opens a device’s ports', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Server room A/ }).click();
  await page.getByRole('link', { name: 'Network' }).click();
  const diagram = page.getByRole('group', { name: 'Network diagram' });
  await expect(diagram.getByRole('button', { name: /^SW-01, / })).toBeVisible();
  // Opens zoomed to fit: the whole diagram is inside the canvas.
  const canvas = await page.locator('.network__canvas').boundingBox();
  const svg = await diagram.boundingBox();
  expect(svg!.width).toBeLessThanOrEqual(canvas!.width);
  await diagram.getByRole('button', { name: /^SW-01, / }).click();
  await page.getByRole('button', { name: 'Manage ports' }).click();
  await expect(page.getByRole('dialog', { name: 'SW-01 ports' })).toBeVisible();
});
