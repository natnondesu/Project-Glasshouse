import { expect, test } from '@playwright/test';

test('home leads with the last room in 3D and opens any room from its card', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /MDF-1/ }).click();
  await page.waitForURL(/\/rooms\/[^/]+\/plan/);
  await page.getByRole('link', { name: 'Glasshouse' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'MDF-1' })).toBeVisible();
  await expect(page.locator('.home-hero canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Pause turning' }).click();
  await expect(page.getByRole('button', { name: 'Turn again' })).toHaveAttribute('aria-pressed', 'true');
  const card = page.getByRole('main').getByRole('link', { name: /Server room A/ });
  await expect(card).toContainText('No issues · install sheet ready');
  await card.click();
  await expect(page).toHaveTitle('Server room A · Plan · Glasshouse');
});
