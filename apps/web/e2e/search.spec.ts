import { expect, test } from '@playwright/test';

test('search finds a node on the plan, jumps to it in the elevation, and in 3D', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /MDF-1/ }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  await page.keyboard.press('/');
  const box = page.getByRole('combobox', { name: 'Search this room' });
  await expect(box).toBeFocused();
  await box.fill('node-03');
  await expect(page.getByRole('option').first()).toContainText('slot 3 of CH-01 in RK-01');
  await box.press('Enter');
  await expect(page).toHaveURL(/sel=/);
  await expect(page.getByRole('heading', { name: 'RK-01' })).toBeVisible();

  await box.click();
  await page.getByRole('link', { name: 'Open NODE-03 in elevation' }).click();
  await expect(page).toHaveURL(/\/elevation\?sel=/);
  await expect(page.getByRole('heading', { name: 'NODE-03' })).toBeVisible();

  await page.getByRole('link', { name: '3D' }).click();
  await expect(page.locator('.room3d canvas').or(page.getByText(/can't show 3D/))).toBeVisible({ timeout: 20_000 });
  const search3d = page.getByRole('combobox', { name: 'Search this room' });
  await search3d.fill('rk-c1');
  await search3d.press('Enter');
  await expect(page.getByRole('button', { name: /^RK-C1/ })).toHaveAttribute('aria-pressed', 'true');
});
