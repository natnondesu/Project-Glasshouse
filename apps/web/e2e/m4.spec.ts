import { expect, test, type Page } from '@playwright/test';

const SAMPLE = 'Sample · Northgate DC';

async function openSampleRoom(page: Page, name: RegExp): Promise<string> {
  await page.goto('/');
  await page.getByRole('link', { name }).click();
  await page.waitForURL(/\/rooms\/[^/]+\/plan/);
  return new URL(page.url()).pathname.split('/')[2]!;
}

test('AC18: a fresh workspace lists the Sample Project with working checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(SAMPLE)).toBeVisible();
  await expect(page.getByText('SAMPLE', { exact: true }).first()).toBeVisible();
  await openSampleRoom(page, /MDF-1/);
  await expect(page.getByText('EX-01 sits inside the front clearance zone of RK-C1.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Server room A/ })).toContainText('R01 APPROVED');
});

test('AC17: the Install sheet prints from the Approved room and is unavailable for a Draft', async ({ page }) => {
  await openSampleRoom(page, /Server room A/);
  await page.getByRole('link', { name: /Install sheet · R01/ }).click();
  await expect(page.locator('.sheet-page').first()).toContainText('R01 APPROVED');
  await expect(page.getByRole('img', { name: 'Server room A plan' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'RK-01 front elevation, 42U' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Bill of materials' })).toContainText('SW-01');
  await expect(page.locator('.sheet input, .sheet textarea, .sheet select')).toHaveCount(0);

  const mdf = await openSampleRoom(page, /MDF-1/);
  await expect(page.getByText('Install sheet after approval')).toBeVisible();
  await page.goto(`/rooms/${mdf}/install-sheet`);
  await expect(page.getByRole('heading', { name: 'No Approved revision yet' })).toBeVisible();
});

test('AC20: room 3D renders, pinch zooms at the pointer, and a Rack opens its elevation', async ({ page, browserName }) => {
  await openSampleRoom(page, /MDF-1/);
  await page.getByRole('link', { name: '3D' }).click();
  const canvas = page.locator('.room3d canvas');
  const fallback = page.getByText(/can't show 3D/);
  await expect(canvas.or(fallback)).toBeVisible();
  if (browserName === 'chromium') await expect(canvas).toBeVisible();
  if (await canvas.isVisible()) {
    const box = await canvas.boundingBox();
    if (!box) throw new Error('3D canvas has no box');
    const zoom = page.locator('.room3d__zoom');
    const before = await zoom.textContent();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -40);
    await page.keyboard.up('Control');
    await expect(zoom).not.toHaveText(before ?? '');
    await page.getByRole('button', { name: 'Reset view' }).click();
    await expect(zoom).toHaveText(before ?? '');
  }
  await page.getByRole('button', { name: /RK-C1/ }).click();
  await expect(page).toHaveURL(/\/elevation\?sel=/);
  await expect(page.getByRole('group', { name: 'RK-C1 front elevation, 42U' })).toBeVisible();
});
