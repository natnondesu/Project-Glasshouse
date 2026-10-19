import { openRoom } from './nav';
import { expect, test, type Page } from '@playwright/test';

const mapOf = (page: Page) => page.getByRole('application', { name: /^Map\./ });
const crumbs = (page: Page) => page.getByRole('navigation', { name: 'Map level' });
const roomsRegion = (page: Page, name: string | RegExp) => page.getByRole('region', { name });
const numbersHeading = (page: Page) => page.locator('#numbers-h');

/** Pointing at the map stops the world view's slow turn, as it does for a person about to click. */
async function pointAtMap(page: Page): Promise<void> {
  const box = await mapOf(page).boundingBox();
  if (!box) throw new Error('The map is not on screen');
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
}

test('the workspace bar offers the last room back, and Continue opens it', async ({ page }) => {
  await page.goto('/');
  await openRoom(page, /MDF-1/);
  await page.waitForURL(/\/rooms\/[^/]+\/plan/);
  await page.getByRole('link', { name: 'Glasshouse' }).first().click();
  const strip = page.getByRole('region', { name: 'Pick up where you left off' });
  await expect(strip).toContainText('MDF-1 · Bangna campus');
  await expect(strip).toContainText('1 blocking');
  await strip.getByRole('link', { name: 'Continue to MDF-1' }).click();
  await expect(page).toHaveTitle('MDF-1 · Plan · Glasshouse');
});

test('a site picked on the globe floats its card over the map, live in 3D, and opens any room', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox' && !!process.env.CI, "Playwright's Firefox has no WebGL in the CI image");
  await page.goto('/');
  await expect(mapOf(page)).toBeVisible();
  await pointAtMap(page);
  // Home opens on the whole world: the country's count, then the province's.
  await page.getByRole('button', { name: 'Thailand — 3 sites. Show them' }).click();
  await page.getByRole('button', { name: 'Bangkok — 3 sites. Show them' }).click();
  await page.getByRole('button', { name: /^Bangna campus, / }).click();
  const card = page.locator('.globe-sitecard');
  await expect(card.getByRole('heading', { level: 2, name: 'Bangna campus' })).toBeVisible();
  await expect(card.locator('.site-card__paper canvas')).toBeVisible();
  await card.getByRole('button', { name: 'Pause turning' }).click();
  await expect(card.getByRole('button', { name: 'Turn again' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'Show MDF-1 in 3D' }).click();
  // A room with holds leads with the way to them.
  await expect(card.getByRole('link', { name: /^Resolve 2 items/ })).toBeVisible();
  // The selected pin pulses while its site is picked.
  await expect(page.locator('.globe-marker.is-selected .globe-marker__pulse')).toHaveCount(1);
  const rooms = roomsRegion(page, 'Rooms in Bangna campus');
  const cardA = rooms.getByRole('article').filter({ has: page.getByRole('link', { name: 'Server room A', exact: true }) });
  await expect(cardA).toContainText('No issues · install sheet ready');
  await cardA.getByRole('link', { name: 'Server room A', exact: true }).click();
  await expect(page).toHaveTitle('Server room A · Plan · Glasshouse');
});

test('the Thailand count scopes the numbers and the rooms to Thailand', async ({ page }) => {
  await page.goto('/');
  await expect(mapOf(page)).toBeVisible();
  await pointAtMap(page);
  await page.getByRole('button', { name: 'Thailand — 3 sites. Show them' }).click();
  await expect(numbersHeading(page)).toHaveText('Thailand · 3 sites');
  const rooms = roomsRegion(page, 'Rooms in Thailand');
  await expect(rooms.getByRole('article')).toHaveCount(7);
  await expect(page).toHaveURL(/scope=country%3ATH/);
  await rooms.getByRole('button', { name: 'Show all' }).click();
  await expect(roomsRegion(page, 'All rooms')).toBeVisible();
  await expect(numbersHeading(page)).toHaveText('Everywhere · 3 sites');
});

test('typing in the Home search fades the pins, narrows the numbers and the rooms, and Enter opens the room', async ({ page }) => {
  await page.goto('/');
  await expect(mapOf(page)).toBeVisible();
  await pointAtMap(page);
  await page.getByRole('button', { name: 'Thailand — 3 sites. Show them' }).click();
  await page.getByRole('button', { name: 'Bangkok — 3 sites. Show them' }).click();
  await expect(page.getByRole('button', { name: /^Bangna campus, / })).toBeVisible();
  await page.mouse.move(2, 2);
  await page.keyboard.press('/');
  const search = page.getByRole('combobox', { name: 'Search sites and rooms' });
  await expect(search).toBeFocused();
  await page.keyboard.type('Shaft L2');
  await expect(page.locator('.globe-marker:has([aria-label^="Bangna campus,"])')).toHaveClass(/is-dim/);
  await expect(page.locator('.globe-marker:has([aria-label^="Riverside Campus,"])')).not.toHaveClass(/is-dim/);
  await expect(numbersHeading(page)).toHaveText('Bangkok · 1 site · matching “Shaft L2”');
  const rooms = roomsRegion(page, 'Rooms in Bangkok');
  await expect(rooms.getByRole('article')).toHaveCount(1);
  await expect(page).toHaveURL(/q=Shaft\+L2/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle('Shaft L2 · Plan · Glasshouse');
});

test('the room chips filter the grid, with an honest empty result and Clear filters', async ({ page }) => {
  await page.goto('/');
  const rooms = roomsRegion(page, 'All rooms');
  await rooms.getByRole('button', { name: /^Needs attention/ }).click();
  await expect(rooms.getByRole('article')).toHaveCount(2);
  await expect(page).toHaveURL(/rooms=attention/);
  await rooms.getByRole('button', { name: /^Approved/ }).click();
  await expect(rooms.getByRole('article')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Search sites and rooms' }).fill('MDF');
  await expect(rooms.getByText('No rooms match “MDF” here.')).toBeVisible();
  await rooms.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rooms.getByRole('article')).toHaveCount(7);
  // A filtered Home survives a reload.
  await rooms.getByRole('button', { name: /^Draft/ }).click();
  await expect(page).toHaveURL(/rooms=draft/);
  await page.reload();
  await expect(roomsRegion(page, 'All rooms').getByRole('button', { name: /^Draft/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(roomsRegion(page, 'All rooms').getByRole('article')).toHaveCount(5);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the picked site keeps its ring and bold name, without the pulse', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Thailand — 3 sites. Show them' }).click();
    await page.getByRole('button', { name: 'Bangkok — 3 sites. Show them' }).click();
    await page.getByRole('button', { name: /^Bangna campus, / }).click();
    await expect(page.getByRole('button', { name: /^Bangna campus, / })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.globe-marker.is-selected')).toHaveCount(1);
    await expect(page.locator('.globe-marker__pulse')).toHaveCount(0);
  });
});
