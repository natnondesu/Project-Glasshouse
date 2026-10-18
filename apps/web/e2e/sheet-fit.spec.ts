import { openRoom } from './nav';
import { expect, test } from '@playwright/test';

test('every Install sheet table fits inside its A4 page', async ({ page }) => {
  await page.goto('/');
  await openRoom(page, /Server room A/);
  await page.getByRole('link', { name: /Install sheet/ }).click();
  await expect(page.getByRole('table', { name: 'Bill of materials' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Cable schedule' })).toBeVisible();
  const overflow = await page.locator('.sheet-page').evaluateAll((pages) =>
    pages.flatMap((p) => {
      const right = p.getBoundingClientRect().right;
      return [...p.querySelectorAll('table')].filter((t) => t.getBoundingClientRect().right > right + 1).map((t) => t.getAttribute('aria-label'));
    }),
  );
  expect(overflow).toEqual([]);
  await expect(page.getByRole('table', { name: 'Bill of materials' }).getByRole('columnheader', { name: 'State' })).toHaveCount(0);
});
