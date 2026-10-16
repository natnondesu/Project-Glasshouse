import { expect, test } from '@playwright/test';

test('walks the room at eye height from the 3D view, stands at a rack, and leaves with Esc', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /Server room A/ }).click();
  await page.getByRole('link', { name: '3D' }).click();
  await page.getByRole('button', { name: 'Walk' }).click();
  await expect(page.getByText('Eye height 1.6 m')).toBeVisible();
  await expect(page.getByText(/Click the floor to walk there/)).toBeVisible();
  // The rack list is somewhere to go while walking.
  await expect(page.getByText('Pick a rack to stand in front of it.')).toBeVisible();
  await page.getByRole('complementary', { name: 'Racks in this room' }).getByRole('button').first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Walk' })).toBeVisible();
  await expect(page.getByText('Eye height 1.6 m')).toBeHidden();
});
