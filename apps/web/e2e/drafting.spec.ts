import { expect, test } from '@playwright/test';

test('draw a saved dimension from the wall to a rack; it follows the rack and survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /MDF-1/ }).click();
  // The first fit runs after the canvas is measured; read the footprint only once it has settled.
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  // MDF-1 is 6 × 5 m; RK-01's top-left corner sits at (0.4, 0.6).
  const at = (x: number, y: number) => [box.x + (x / 6) * box.width, box.y + (y / 5) * box.height] as const;
  await page.getByRole('button', { name: 'Dimension' }).click();
  await page.mouse.click(...at(0, 0.6));
  await page.mouse.click(...at(0.4, 0.6));
  const dim = page.getByRole('button', { name: 'Dimension 0.40 m, wall to RK-01' });
  await expect(dim).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dimension' })).toBeVisible();

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'RK-01, Rack' }).focus();
  await page.getByLabel('X', { exact: true }).fill('0.8');
  await page.getByLabel('X', { exact: true }).blur();
  await expect(page.getByRole('button', { name: /^Dimension 0.80 m, wall to RK-01/ })).toBeVisible();
  await expect(page.getByTestId('clear-left')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /^Dimension 0.80 m, wall to RK-01/ })).toBeVisible();
});
