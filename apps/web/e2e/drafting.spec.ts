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
  await page.getByRole('button', { name: 'More Measure tools' }).click();
  await page.getByRole('menuitemradio', { name: 'Dimension' }).click();
  await page.mouse.click(...at(0, 0.6));
  await page.mouse.click(...at(0.4, 0.6));
  // Third click places the dimension line 0.3 m above the measured points.
  await page.mouse.move(...at(0.2, 0.3));
  await page.mouse.click(...at(0.2, 0.3));
  const dim = page.getByRole('button', { name: 'Dimension 0.40 m, wall to RK-01' });
  await expect(dim).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dimension' })).toBeVisible();
  // Clicks map through the footprint's box, wall stroke included, so at some fits the first point
  // snaps a few px lower and the offset rounds one 0.05 m step either way. The drag below is exact.
  const offset = page.getByLabel('Line offset');
  const placed = Number(await offset.inputValue());
  expect(Math.abs(placed + 0.3)).toBeLessThanOrEqual(0.051);

  // Drag the line further from the rack with the mouse.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.mouse.move(...at(0.2, 0.3));
  await page.mouse.down();
  await page.mouse.move(...at(0.2, 0.2), { steps: 4 });
  await page.mouse.move(...at(0.2, 0.1), { steps: 4 });
  await page.mouse.up();
  await expect(offset).toHaveValue((placed - 0.2).toFixed(2));

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'RK-01, Rack' }).focus();
  await page.getByLabel('X', { exact: true }).fill('0.8');
  await page.getByLabel('X', { exact: true }).blur();
  await expect(page.getByRole('button', { name: /^Dimension 0.80 m, wall to RK-01/ })).toBeVisible();
  await expect(page.getByTestId('clear-left')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /^Dimension 0.80 m, wall to RK-01/ })).toBeVisible();
});
