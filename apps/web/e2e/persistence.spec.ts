import { openRoom, showProjects } from './nav';
import { expect, test } from '@playwright/test';
test('an edit survives an immediate reload', async ({ page }) => {
  await page.goto('/');
  await openRoom(page, /Server room A/);
  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await page.reload();
  await expect((await showProjects(page)).getByRole('link', { name: /Server room A/ })).toContainText('R02 DRAFT');
});
