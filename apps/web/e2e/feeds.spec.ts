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

test('place a UPS from the Power group, feed a rack from it, and wire an MCB feed to a way', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /MDF-1/ }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  await page.getByRole('button', { name: 'More Power source tools' }).click();
  await page.getByRole('menuitemradio', { name: 'UPS' }).click();
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('no footprint');
  await page.mouse.click(box.x + (1.2 / 6) * box.width, box.y + (4.2 / 5) * box.height);
  await expect(page.getByRole('heading', { name: 'UPS-01' })).toBeVisible();

  await page.getByRole('button', { name: 'RK-01, Rack' }).focus();
  const feeds = page.getByRole('group', { name: 'Power feeds' });
  await feeds.getByRole('button', { name: 'Add power feed' }).click();
  await feeds.getByLabel('Feed B source').selectOption({ label: 'UPS-01' });
  await expect(page.locator('.plan-canvas .feed__run')).toHaveCount(3);

  // The MCB manager: double-click the panel, move RK-02's feed to way 5.
  const mcb = await page.locator('.obj--mcb .obj__body').boundingBox();
  if (!mcb) throw new Error('no mcb');
  await page.mouse.dblclick(mcb.x + mcb.width / 2, mcb.y + mcb.height / 2);
  const manager = page.getByRole('dialog', { name: 'MCB-01 ways' });
  await expect(manager).toBeVisible();
  await manager.getByLabel('Way 2 feed').selectOption('');
  await manager.getByLabel('Way 5 feed').selectOption({ label: 'RK-02 · Feed A' });
  await expect(manager.getByLabel('Way 5 feed')).not.toHaveValue('');
  await expect(manager.getByText('Every feed from this panel is on a way.')).toBeVisible();
});
