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
  // First visit compiles the lazy three.js chunk on the dev server, which can outlast the default 5 s under load.
  await expect(canvas.or(fallback)).toBeVisible({ timeout: 20_000 });
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
  await page.getByRole('button', { name: /^RK-C1/ }).click();
  await page.getByRole('button', { name: 'Open RK-C1 elevation' }).click();
  await expect(page).toHaveURL(/\/elevation\?sel=/);
  await expect(page.getByRole('group', { name: 'RK-C1 front elevation, 42U' })).toBeVisible();
});

test('AC17 print layout: 60U racks still fit one A4 page each with the title block', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'PDF and print-media layout checked in Chromium');
  await openSampleRoom(page, /Server room A/);
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await page.getByRole('link', { name: 'Plan' }).click();
  for (const rack of ['RK-01', 'RK-02']) {
    await page.getByRole('button', { name: `${rack}, Rack` }).focus();
    await page.getByLabel('Capacity').fill('60');
  }
  await page.getByRole('link', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByLabel('Reviewer name (unverified)').fill('Nok');
  await page.getByRole('button', { name: 'Approve revision' }).click();
  await expect(page.getByRole('heading', { name: 'Revision 02' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Install sheet' }).click();
  await expect(page.locator('.sheet-page').first()).toContainText('R02 APPROVED');

  // A4 at 96 dpi with 12 mm margins: 186 × 273 mm printable ≈ 703 × 1032 px.
  await page.setViewportSize({ width: 703, height: 1032 });
  await page.emulateMedia({ media: 'print' });
  const fixedPages = page.locator('.sheet-page:not(.sheet-page--flow)');
  await expect(fixedPages).toHaveCount(3);
  for (const height of await fixedPages.evaluateAll((els) => els.map((el) => el.scrollHeight))) expect(height).toBeLessThanOrEqual(1032);
  expect((await page.pdf({ format: 'A4' })).byteLength).toBeGreaterThan(10_000);
});
