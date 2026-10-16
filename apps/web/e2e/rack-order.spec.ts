import { expect, test } from '@playwright/test';

test('drags a rack by its name to reorder Elevation, and resets to plan order', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /Server room A/ }).click();
  await page.getByRole('link', { name: 'Elevation' }).click();
  const area = page.getByRole('region', { name: 'Rack elevations' });
  const names = () => area.locator('[data-rack-slot] .rack-elev__name').allTextContents();
  await expect(area.locator('[data-rack-slot] .rack-elev__name').nth(1)).toBeVisible();
  const before = await names();
  expect(before.length).toBeGreaterThan(1);
  const first = (await area.locator('[data-rack-slot] .rack-elev__name').nth(0).boundingBox())!;
  const second = (await area.locator('[data-rack-slot] .rack-elev__name').nth(1).boundingBox())!;
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 10, first.y + first.height / 2, { steps: 12 });
  await page.mouse.move(first.x - 20, first.y + first.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)]);
  // The drag didn't also select the rack it moved.
  await expect(page).not.toHaveURL(/sel=/);
  await page.getByRole('button', { name: 'Reset to plan order' }).click();
  await expect.poll(names).toEqual(before);
});
