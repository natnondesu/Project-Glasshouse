import { expect, test } from '@playwright/test';

test('connect a rack to an MCB panel and see the run on the plan and the Install sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /MDF-1/ }).click();
  await page.getByRole('button', { name: 'RK-C1, Rack' }).focus();
  const feeds = page.getByRole('group', { name: 'Power feeds' });
  await feeds.getByRole('button', { name: 'Add power feed' }).click();
  await expect(feeds.getByLabel('Feed A source')).toHaveValue(/.+/);
  await expect(page.locator('.plan-canvas .feed__run')).toHaveCount(3);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.plan-canvas .feed__run')).toHaveCount(2);
});

test('open an approved revision from the review history, read-only', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Server room A/ }).click();
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await page.getByRole('link', { name: 'View R01' }).click();
  await expect(page.getByText('Viewing R01 (Approved), an older revision. Read-only.')).toBeVisible();
  await expect(page.getByLabel('Width', { exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Back to current (R02)' }).click();
  await expect(page.getByLabel('Width', { exact: true })).toBeEnabled();
});
