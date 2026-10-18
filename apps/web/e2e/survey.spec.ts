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

async function placeRack(page: Page, fx: number, fy: number): Promise<void> {
  await pickTool(page, 'Racks', 'Rack');
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await expect(page.getByRole('heading', { name: 'RK-01' })).toBeVisible();
}

test('AC01: survey values persist without Save and the drawing keeps its proportion', async ({ page }) => {
  await createRoom(page);
  await page.getByLabel('Width', { exact: true }).fill('5');
  await page.getByLabel('Length', { exact: true }).fill('4');
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('5.00');
  const box = await page.getByTestId('footprint').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width / box!.height).toBeCloseTo(1.25, 1);
});

test('AC04: a drag commits on release and Escape cancels it', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.3, 0.4);
  const x = page.getByLabel('X', { exact: true });
  const before = await x.inputValue();
  const rack = await page.getByRole('button', { name: 'RK-01, Rack' }).boundingBox();
  if (!rack) throw new Error('Rack not rendered');
  const cx = rack.x + rack.width / 2;
  const cy = rack.y + rack.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 140, cy, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(x).toHaveValue(before);

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 140, cy, { steps: 6 });
  await page.mouse.up();
  await expect(x).not.toHaveValue(before);
});

test('AC20: pinch zooms around the pointer and two-finger scroll pans', async ({ page }) => {
  await createRoom(page);
  const zoom = page.getByTestId('zoom-value');
  const startZoom = await zoom.textContent();
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(zoom).not.toHaveText(startZoom ?? '');

  const zoomed = await zoom.textContent();
  const before = await page.getByTestId('footprint').boundingBox();
  await page.mouse.wheel(0, 80);
  await expect(zoom).toHaveText(zoomed ?? '');
  const after = await page.getByTestId('footprint').boundingBox();
  expect(after!.y).toBeLessThan(before!.y);
});

test('AC11: a rack against the wall shows a blocking rear-clearance check', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.2, 0.01);
  await expect(page.getByText('The rear clearance of RK-01 runs outside the floor.')).toBeVisible();
  await page.getByRole('button', { name: 'Rotate 45° clockwise' }).click();
  await expect(page.getByRole('alert')).toHaveText("There isn't room to turn RK-01 here. Move it away from the wall first.");
  await page.getByLabel('Y', { exact: true }).fill('0.6');
  await expect(page.getByText('No issues found')).toBeVisible();
});

test('a second tab is read-only instead of overwriting the first', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByText('Glasshouse is open in another tab, so this tab is read-only.', { exact: false })).toBeVisible();
  await second.getByRole('button', { name: 'New project' }).click();
  await expect(second.getByText('This tab is read-only because Glasshouse is open in another tab.')).toBeVisible();
  await expect(page.getByText('read-only', { exact: false })).toHaveCount(0);
});

test('Measure: hover shows wall gaps, two clicks measure, Escape clears', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.3, 0.4);
  const x = await page.getByLabel('X', { exact: true }).inputValue();
  await pickTool(page, 'Measure', 'Measure');
  const rack = await page.getByRole('button', { name: 'RK-01, Rack' }).boundingBox();
  const fp = await page.getByTestId('footprint').boundingBox();
  if (!rack || !fp) throw new Error('Plan not rendered');
  const cy = rack.y + rack.height / 2;
  await page.mouse.move(rack.x + rack.width / 2, cy);
  await expect(page.getByTestId('gap-left')).toHaveText(`${x} m`);
  await page.mouse.click(fp.x + 2, cy);
  await page.mouse.click(rack.x + 2, cy);
  await expect(page.getByTestId('measure-result')).toContainText(`${x} m`);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('measure-result')).toHaveCount(0);
});

test('drawing floor past the room asks to extend it; growing left keeps what is drawn in place', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.5, 0.5);
  await page.keyboard.press('Escape');
  const survey = page.getByRole('complementary', { name: 'Survey' });
  await expect(survey).toBeVisible();
  const drag = async (fx1: number, fy1: number, fx2: number, fy2: number): Promise<void> => {
    await pickTool(page, 'Floor', 'Add floor area');
    const box = (await page.getByTestId('footprint').boundingBox())!;
    await page.mouse.move(box.x + box.width * fx1, box.y + box.height * fy1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * fx2, box.y + box.height * fy2, { steps: 6 });
    await page.mouse.up();
  };
  const width = survey.getByLabel('Width', { exact: true });
  const startWidth = Number(await width.inputValue());

  // Past the right edge: the room grows; cancelling first changes nothing.
  await drag(0.8, 0.2, 1.2, 0.4);
  await expect(page.getByRole('alertdialog', { name: /^Extend the room to / })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(width).toHaveValue(startWidth.toFixed(2));
  await drag(0.8, 0.2, 1.2, 0.4);
  await page.getByRole('button', { name: 'Extend room' }).click();
  await expect.poll(async () => Number(await width.inputValue())).toBeGreaterThan(startWidth);

  // Past the left edge: everything moves over in the plan, and stays put on screen.
  const rackBefore = (await page.getByRole('button', { name: 'RK-01, Rack' }).boundingBox())!;
  const grown = Number(await width.inputValue());
  await drag(0.1, 0.6, -0.15, 0.8);
  await expect(page.getByRole('alertdialog')).toContainText('everything already drawn moves over');
  await page.getByRole('button', { name: 'Extend room' }).click();
  await expect.poll(async () => Number(await width.inputValue())).toBeGreaterThan(grown);
  const rackAfter = (await page.getByRole('button', { name: 'RK-01, Rack' }).boundingBox())!;
  expect(Math.abs(rackAfter.x - rackBefore.x)).toBeLessThan(2);
  expect(Math.abs(rackAfter.y - rackBefore.y)).toBeLessThan(2);
});
