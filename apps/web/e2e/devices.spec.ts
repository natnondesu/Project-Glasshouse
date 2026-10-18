import { openRoom } from './nav';
import { readFileSync } from 'node:fs';
import { pickTool } from './tools';
import { expect, test, type Page } from '@playwright/test';

async function createRoom(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Northgate');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add site to Northgate' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site A');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site A' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('MDF-1');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('footprint')).toBeVisible();
}

async function placeRack(page: Page, fx: number, fy: number, name: string): Promise<void> {
  await pickTool(page, 'Racks', 'Rack');
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('AC06/AC08/AC14/AC19: fill a chassis, move it, flag an unknown node, export the BOM', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.25, 0.35, 'RK-01');
  await placeRack(page, 0.6, 0.35, 'RK-02');
  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: 'RK-01', exact: true }).click();
  await page.getByRole('button', { name: 'Add Chassis 6U · 5 slots to RK-01' }).click();
  await expect(page.getByRole('heading', { name: 'CH-01' })).toBeVisible();
  for (let slot = 1; slot <= 5; slot += 1) await page.getByRole('button', { name: `Add node to slot ${slot}` }).click();
  await expect(page.getByText('5 of 5 filled')).toBeVisible();
  await expect(page.getByRole('img', { name: /^2500 watts known of a / })).toBeVisible();

  await page.getByLabel('Rack', { exact: true }).selectOption({ label: 'RK-02' });
  await expect(page.getByRole('button', { name: 'CH-01, U1–U6' })).toBeVisible();
  await expect(page.getByText('5 of 5 filled')).toBeVisible();

  await page.getByRole('button', { name: 'Slot 3: NODE-03' }).click();
  await page.getByRole('button', { name: 'Unknown' }).click();
  await expect(page.getByText('NODE-03 in slot 3 of CH-01 has unknown demand.')).toBeVisible();

  await page.getByRole('link', { name: 'Devices & BOM' }).click();
  await expect(page.getByRole('row')).toHaveCount(7);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await (await downloading).path();
  const csv = readFileSync(file, 'utf8');
  expect(csv).toContain('RK-02,CH-01,3,Node,Planned,NODE-03');
  expect(csv).toContain(',unknown,');
});

test('AC09/AC10: template edits leave placed devices alone; a too-deep device blocks', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.3, 0.35, 'RK-01');
  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: 'Add Compute Server 4U to RK-01' }).click();
  await expect(page.getByLabel('Demand in watts')).toHaveValue('500');

  await page.getByRole('banner').getByRole('link', { name: 'Catalog' }).click();
  await page.getByRole('button', { name: /^Compute Server 4U/ }).click();
  await page.getByLabel('Demand in watts').fill('999');
  await page.getByRole('button', { name: 'Save template' }).click();

  await openRoom(page, /MDF-1/, { last: true });
  await page.getByRole('link', { name: 'Elevation' }).click();
  // Select from the keyboard: Firefox's automation mis-scrolls SVG blocks near the bottom of a rack.
  await page.getByRole('button', { name: /^SRV-01,/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Demand in watts')).toHaveValue('500');

  await page.getByLabel('Depth', { exact: true }).fill('1070');
  await expect(page.getByText('SRV-01 is 1070 mm deep, but RK-01 accepts 1000 mm.')).toBeVisible();
});

test('drag a template from the palette onto a rack', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.3, 0.35, 'RK-01');
  await page.getByRole('link', { name: 'Elevation' }).click();
  const rack = page.getByRole('group', { name: 'RK-01 front elevation, 42U' });
  const box = await rack.boundingBox();
  if (!box) throw new Error('Elevation not rendered');
  await page.getByText('Network switch').dragTo(rack, { targetPosition: { x: box.width / 2, y: 8 } });
  await expect(page.getByRole('button', { name: 'SW-01, U42' })).toBeVisible();
});
