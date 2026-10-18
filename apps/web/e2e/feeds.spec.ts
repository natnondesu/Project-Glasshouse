import { expect, test } from '@playwright/test';
import { pickTool } from './tools';

test('connect a rack to an MCB panel and see the run on the plan and the Install sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /MDF-1/ }).click();
  await page.getByRole('button', { name: 'RK-C1, Rack' }).focus();
  const feeds = page.getByRole('group', { name: 'Power feeds' });
  // RK-C1 already takes Feed A from the PDU; the sample room has six runs.
  await feeds.getByRole('button', { name: 'Add power feed' }).click();
  await expect(feeds.getByLabel('Feed B source')).toHaveValue(/.+/);
  await expect(page.locator('.plan-canvas .feed__run')).toHaveCount(7);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.plan-canvas .feed__run')).toHaveCount(6);
});

test('open an approved revision from the review history, read-only', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /Server room A/ }).click();
  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await page.getByRole('link', { name: 'View R01' }).click();
  await expect(page.getByText('Viewing R01 (Approved), an older revision. Read-only.')).toBeVisible();
  await expect(page.getByLabel('Width', { exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Back to current (R02)' }).click();
  await expect(page.getByLabel('Width', { exact: true })).toBeEnabled();
});

test('place a UPS, feed a rack from it, feed the UPS from the MCB, and wire feeds to ways', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /MDF-1/ }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  await pickTool(page, 'Power source', 'UPS');
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('no footprint');
  // An empty spot in the L-shaped leg, clear of the desk.
  await page.mouse.click(box.x + (2.4 / 6) * box.width, box.y + (3.7 / 5) * box.height);
  await expect(page.getByRole('heading', { name: 'UPS-01' })).toBeVisible();

  await page.getByRole('button', { name: 'RK-01, Rack' }).focus();
  const feeds = page.getByRole('group', { name: 'Power feeds' });
  await feeds.getByRole('button', { name: 'Add power feed' }).click();
  await feeds.getByLabel('Feed C source').selectOption({ label: 'UPS-01' });
  await expect(page.locator('.plan-canvas .feed__run')).toHaveCount(7);

  // Chain: the UPS itself is fed from the MCB.
  await page.getByRole('button', { name: 'UPS-01, UPS' }).focus();
  await page.getByRole('group', { name: 'Power input' }).getByLabel('Fed from').selectOption({ label: 'MCB-01' });
  await expect(page.locator('.plan-canvas .feed__run')).toHaveCount(8);
  await expect(page.getByRole('list', { name: 'Feeds out of UPS-01' })).toHaveText(/RK-01 · Feed C/);

  // The MCB manager: double-click the panel, move RK-02's feed to way 5.
  const mcb = await page.locator('.obj--mcb .obj__body').boundingBox();
  if (!mcb) throw new Error('no mcb');
  await page.mouse.dblclick(mcb.x + mcb.width / 2, mcb.y + mcb.height / 2);
  const manager = page.getByRole('dialog', { name: 'MCB-01 ways' });
  await expect(manager).toBeVisible();
  // Pick a breaker on the panel face, then set its feed.
  await manager.getByRole('button', { name: /^Way 2,/ }).click();
  await manager.getByLabel('Way 2 feed').selectOption('');
  await manager.getByRole('button', { name: /^Way 5,/ }).click();
  await manager.getByLabel('Way 5 feed').selectOption({ label: 'RK-02 · Feed A' });
  await expect(manager.getByLabel('Way 5 feed')).not.toHaveValue('');
  await manager.getByRole('button', { name: /^Way 6,/ }).click();
  await manager.getByLabel('Way 6 feed').selectOption({ label: 'UPS-01 · Feed A' });
  await expect(manager.getByText('Every feed from this panel is on a way.')).toBeVisible();

  // A long panel scrolls its face inside the manager; the footer stays inside the panel.
  await manager.getByRole('combobox', { name: /^Ways/ }).selectOption('72');
  await manager.getByRole('combobox', { name: 'Layout' }).selectOption('column');
  const table = manager.locator('.panel-mgr__scroll');
  const { scrolls } = await table.evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight + 1 }));
  expect(scrolls).toBe(true);
  const panelBox = (await manager.boundingBox())!;
  const footBox = (await manager.locator('.panel-mgr__foot').boundingBox())!;
  expect(footBox.y + footBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  await table.hover();
  // Firefox caps how far one wheel event scrolls, so scroll in steps like a trackpad would.
  for (let i = 0; i < 8; i += 1) await page.mouse.wheel(0, 600);
  await expect(manager.getByRole('button', { name: /^Way 72,/ })).toBeInViewport();
});
