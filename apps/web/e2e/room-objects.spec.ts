import { expect, test, type Page } from '@playwright/test';
import { pickTool } from './tools';

const ROOM = { width: 8, length: 6 };

async function createRoom(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Northgate');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add site to Northgate' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site A');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site A' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('Command room');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('footprint')).toBeVisible();
  await page.getByLabel('Width', { exact: true }).fill(String(ROOM.width));
  await page.getByLabel('Length', { exact: true }).fill(String(ROOM.length));
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  // The bigger room was not fitted when its size changed: fit it so every point of it is on screen.
  await page.getByRole('button', { name: 'Fit room' }).click();
  await page.mouse.move(700, 500);
  await expect.poll(async () => (await page.getByTestId('footprint').boundingBox())?.height ?? 0).toBeLessThan(600);
}

/** Screen position of a point in the room, in metres from its top-left corner. */
async function pointAt(page: Page, x: number, y: number): Promise<[number, number]> {
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  return [box.x + (x / ROOM.width) * box.width, box.y + (y / ROOM.length) * box.height];
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(...(await pointAt(page, ...from)));
  await page.mouse.down();
  await page.mouse.move(...(await pointAt(page, ...to)), { steps: 8 });
  await page.mouse.up();
}

async function click(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.click(...(await pointAt(page, x, y)));
}

const checks = (page: Page) => page.getByRole('region', { name: 'Checks' });

test('draws a partition from wall to wall by dragging, and a door placed beside it snaps into it', async ({ page }) => {
  await createRoom(page);
  await pickTool(page, 'Walls & doors', 'Partition');
  await drag(page, [4, 0.03], [4, 5.96]);
  await expect(page.getByRole('heading', { name: 'PT-01' })).toBeVisible();
  // Both ends met the walls: it is the room's full length and exactly upright.
  await expect(page.getByLabel('Length', { exact: true })).toHaveValue(ROOM.length.toFixed(2));
  await expect(page.getByLabel('Angle')).toHaveValue('90.00');

  await pickTool(page, 'Walls & doors', 'Door');
  await click(page, 4.15, 3);
  await expect(page.getByRole('heading', { name: 'D-01' })).toBeVisible();
  // East of the partition: the door stands in its line, centred on its thickness, swinging east.
  await expect(page.getByLabel('Angle')).toHaveValue('270.00');
  await expect(page.getByLabel('X', { exact: true })).toHaveValue('3.95');
  await expect(checks(page)).toContainText('No issues found');
});

test('a wall split AC placed over a rack warns that it can drip, and the zone in front of it is drawn', async ({ page }) => {
  await createRoom(page);
  await pickTool(page, 'Racks', 'Rack');
  await click(page, 3, 0.2);
  await expect(page.getByRole('heading', { name: 'RK-01' })).toBeVisible();
  await pickTool(page, 'Cooling', 'Wall split AC');
  await click(page, 3.3, 0.2);
  await expect(page.getByRole('heading', { name: 'AC-01' })).toBeVisible();
  await expect(page.getByLabel('Height above floor')).toHaveValue('2.20');
  await expect(checks(page)).toContainText('RK-01 stands under the wall AC; condensate can drip on it.');
  await expect(page.locator('.env-zone--warn')).toHaveCount(1);
  await expect(page.locator('[data-object-id].is-warned')).toHaveCount(2);
});

test('a precision AC with a rack in its service area warns, and clears when the rack moves away', async ({ page }) => {
  await createRoom(page);
  await pickTool(page, 'Cooling', 'Precision AC');
  await click(page, 2, 1.5);
  await expect(page.getByRole('heading', { name: 'PAC-01' })).toBeVisible();
  await expect(page.locator('.env-zone')).toHaveCount(1);
  await pickTool(page, 'Racks', 'Rack');
  await click(page, 2.2, 3);
  await expect(page.getByRole('heading', { name: 'RK-01' })).toBeVisible();
  await expect(checks(page)).toContainText('Keep 1.00 m clear in front of the precision AC for service; RK-01 is in the way.');
  await page.getByLabel('Y', { exact: true }).fill('4.5');
  await page.getByLabel('Y', { exact: true }).blur();
  await expect(checks(page)).not.toContainText('Keep 1.00 m clear');
});

test('a display wall hangs on the wall at 0.80 m, takes no power, and warns about a rack in its viewing area', async ({ page }) => {
  await createRoom(page);
  await pickTool(page, 'Furniture', 'Display wall');
  await click(page, 4, 0.2);
  await expect(page.getByRole('heading', { name: 'DW-01' })).toBeVisible();
  await expect(page.getByLabel('Height above floor')).toHaveValue('0.80');
  await expect(page.getByLabel('Angle')).toHaveValue('0.00');
  await expect(page.getByLabel('Y', { exact: true })).toHaveValue('0.00');
  await expect(checks(page)).toContainText('No issues found');
  await pickTool(page, 'Racks', 'Rack');
  await click(page, 3.5, 1.2);
  await expect(checks(page)).toContainText('RK-01 stands in front of the display wall.');
  await expect(page.locator('.env-zone--warn')).toHaveCount(1);
});

test('dragging a door along a partition keeps it in the partition', async ({ page }) => {
  await createRoom(page);
  await pickTool(page, 'Walls & doors', 'Partition');
  await drag(page, [0.03, 3], [7.96, 3]);
  await pickTool(page, 'Walls & doors', 'Door');
  await click(page, 2, 3.1);
  await expect(page.getByRole('heading', { name: 'D-01' })).toBeVisible();
  await expect(page.getByLabel('Angle')).toHaveValue('0.00');
  // Grab it between its handles, not on the one in the middle of its long side.
  await drag(page, [1.8, 3], [4.8, 2.8]);
  // It followed along the wall and flipped to the side the pointer ended on.
  await expect(page.getByLabel('Angle')).toHaveValue('180.00');
  await expect(page.getByLabel('Y', { exact: true })).toHaveValue('2.95');
  await expect(checks(page)).toContainText('No issues found');
});

test('the new objects show in 3D without errors, can be found by search, and are listed on the Install sheet', async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined));
  await createRoom(page);
  await pickTool(page, 'Racks', 'Rack');
  await click(page, 6.5, 1.5);
  await expect(page.getByRole('heading', { name: 'RK-01' })).toBeVisible();
  await pickTool(page, 'Walls & doors', 'Partition');
  await drag(page, [4, 0.03], [4, 5.96]);
  await pickTool(page, 'Walls & doors', 'Door');
  await click(page, 4.15, 3);
  await pickTool(page, 'Cooling', 'Wall split AC');
  await click(page, 2, 0.2);
  await pickTool(page, 'Cooling', 'Precision AC');
  await click(page, 1.5, 3.5);
  await pickTool(page, 'Furniture', 'Display wall');
  await click(page, 2, 5.8);
  await expect(page.getByRole('heading', { name: 'DW-01' })).toBeVisible();

  await page.getByRole('link', { name: '3D' }).click();
  const canvas = page.locator('.room3d canvas');
  await expect(canvas.or(page.getByText(/can't show 3D/))).toBeVisible({ timeout: 20_000 });
  if (browserName === 'chromium') await expect(canvas).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Search this room' });
  await search.fill('aircon');
  await expect(page.getByRole('option')).toHaveCount(2);
  await search.fill('pt-01');
  await search.press('Enter');
  await expect(page.getByRole('region', { name: 'PT-01 details' })).toContainText('Partition');
  expect(errors).toEqual([]);

  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: 'Add Compute Server 4U to RK-01' }).click();
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Confirm submit' }).click();
  await page.getByLabel('Reviewer name (unverified)').fill('Ploy');
  await page.getByRole('button', { name: 'Approve revision' }).click();
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await page.getByRole('link', { name: /Install sheet · R01/ }).click();
  const table = page.getByRole('table', { name: 'Room fittings' });
  await expect(table).toContainText('PT-01');
  await expect(table).toContainText('AC-01');
  await expect(table).toContainText('PAC-01');
  await expect(table).toContainText('DW-01');
  await expect(table.getByRole('row', { name: /DW-01/ })).toContainText('Viewing 1.50 m');
});
