import { expect, test } from '@playwright/test';
test('an edit survives an immediate reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /Server room A/ }).click();
  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /Server room A/ })).toContainText('R02 DRAFT');
});
