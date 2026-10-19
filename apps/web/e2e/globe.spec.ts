import { expect, test, type Page } from '@playwright/test';

const mapOf = (page: Page) => page.getByRole('application', { name: /^Map\./ });
const crumbs = (page: Page) => page.getByRole('navigation', { name: 'Map level' });
const tree = (page: Page) => page.getByRole('complementary', { name: 'Projects' });

/** Pointing at the map stops the world view's slow turn, as it does for a person about to click. */
async function pointAtMap(page: Page): Promise<void> {
  const box = await mapOf(page).boundingBox();
  if (!box) throw new Error('The map is not on screen');
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
}

async function addSite(page: Page, project: string, site: string): Promise<void> {
  await tree(page).getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill(project);
  await page.keyboard.press('Enter');
  await tree(page).getByRole('button', { name: `Add site to ${project}` }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill(site);
  await page.keyboard.press('Enter');
}

test('the globe flies from the world to a site, and its card opens the room', async ({ page }) => {
  await page.goto('/');
  await expect(mapOf(page)).toBeVisible();
  // Opens on the whole world, counting everything: one count for Thailand, no country crumb yet.
  await expect(crumbs(page).getByRole('button', { name: 'World' })).toHaveAttribute('aria-current', 'location');
  await expect(crumbs(page).getByRole('button', { name: 'Thailand' })).toHaveCount(0);
  await pointAtMap(page);
  await page.getByRole('button', { name: 'Thailand — 3 sites. Show them' }).click();
  await expect(crumbs(page).getByRole('button', { name: 'Thailand' })).toHaveAttribute('aria-current', 'location');

  await page.getByRole('button', { name: 'Bangkok — 3 sites. Show them' }).click();
  await page.getByRole('button', { name: /^Riverside Campus, / }).click();
  await expect(page.locator('#home-site-name')).toHaveText('Riverside Campus');
  await expect(crumbs(page).getByRole('button', { name: 'Riverside Campus' })).toHaveAttribute('aria-current', 'location');
  await expect(crumbs(page).getByRole('button', { name: 'Bangkok' })).toBeVisible();
  const rooms = page.getByRole('list', { name: 'Rooms in Riverside Campus' });
  await expect(rooms.getByRole('button', { name: /^Show / })).toHaveCount(4);
  await rooms.getByRole('button', { name: 'Show Shaft L1 in 3D' }).click();
  await page.getByRole('link', { name: 'Open Shaft L1' }).click();
  await expect(page).toHaveTitle('Shaft L1 · Plan · Glasshouse');
});

test('the wheel scrolls the page over the map unless a modifier is held or the map has focus', async ({ page }) => {
  await page.goto('/');
  await expect(mapOf(page)).toBeVisible();
  await pointAtMap(page);
  const main = page.locator('#main .home-page');
  await page.mouse.wheel(0, 300);
  await expect(page.getByText(/scroll to zoom, or click the map first/)).toBeVisible();
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await main.evaluate((el) => el.scrollTo(0, 0));
  // The world view has no scale bar; zooming in brings one.
  const scale = page.getByRole('img', { name: /^Scale bar/ });
  await expect(scale).toHaveCount(0);
  await pointAtMap(page);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -600);
  await page.keyboard.up('Control');
  await expect(scale).toBeVisible();
  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
});

test('a site is placed by pasting a Google Maps link', async ({ page }) => {
  await page.goto('/');
  await addSite(page, 'Acme', 'Warehouse 2');
  await page.getByRole('link', { name: 'Glasshouse' }).first().click();
  await pointAtMap(page);
  await page.getByRole('button', { name: 'Thailand — 3 sites. Show them' }).click();
  await expect(page.locator('.globe-map')).not.toHaveClass(/is-flying/);
  const toggle = page.getByRole('button', { name: /^Not placed yet/ });
  await toggle.click();
  const waiting = page.getByRole('region', { name: /Not placed yet/ });
  await expect(waiting.getByRole('button', { name: /Warehouse 2/ }).first()).toBeVisible();

  await tree(page).getByRole('button', { name: 'Location of Warehouse 2' }).click();
  const dialog = page.getByRole('dialog', { name: 'Where is Warehouse 2?' });
  await dialog.getByRole('textbox').fill('https://www.google.com/maps/place/Lat+Krabang/@13.72,100.74,14z/data=!3m1!4b1!4m6!3m5!8m2!3d13.7279!4d100.7479');
  await expect(dialog.getByRole('status')).toContainText('13.72790° N, 100.74790° E');
  await dialog.getByRole('button', { name: 'Save location' }).click();
  await expect(dialog).toBeHidden();
  await expect(toggle).toBeHidden();
  // Lat Krabang is in Bangkok, so the count over Bangkok takes it in.
  await expect(page.getByRole('button', { name: 'Bangkok — 4 sites. Show them' })).toBeVisible();
});

test('a site is placed by clicking the map', async ({ page }) => {
  await page.goto('/');
  await addSite(page, 'Acme', 'Depot 9');
  await page.getByRole('link', { name: 'Glasshouse' }).first().click();
  // From the world view to Thailand first; Place mode keeps the view where it is.
  await pointAtMap(page);
  await page.getByRole('button', { name: 'Thailand — 3 sites. Show them' }).click();
  await expect(page.locator('.globe-map')).not.toHaveClass(/is-flying/);
  await page.getByRole('button', { name: /^Not placed yet/ }).click();
  await page.getByRole('button', { name: 'Place Depot 9 on the map' }).click();
  const banner = page.getByRole('region', { name: 'Place Depot 9 on the map' });
  await expect(banner).toContainText('Zoom in to the province first');
  // Place mode takes focus to the map.
  await expect(mapOf(page)).toBeFocused();
  const box = await mapOf(page).boundingBox();
  if (!box) throw new Error('The map is not on screen');
  // At country zoom a click zooms in there; clicks are ignored until that flight has landed.
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.35);
  await expect(page.locator('.globe-map')).not.toHaveClass(/is-flying/);
  await expect(banner).toContainText('Click again to move the pin');
  const province = await crumbs(page).locator('[aria-current="location"]').textContent();
  expect(province).toBeTruthy();
  // The flight centred the view on the first click: dropping the pin there keeps it in the province the crumb names.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(banner.locator('.globe-place__coords')).toContainText('° N');
  await banner.getByRole('button', { name: 'Save location' }).click();
  await expect(banner).toBeHidden();
  await expect(page.locator('#home-site-name')).toHaveText('Depot 9');
  await expect(page.getByRole('button', { name: /^Depot 9, Acme/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Not placed yet/ })).toBeHidden();
  // The pin landed in the province the map was showing, inside Thailand.
  await expect(crumbs(page).getByRole('button', { name: province! })).toBeVisible();
  const coords = (await page.locator('.site-card__where .mono').textContent()) ?? '';
  const [lat, lon] = [...coords.matchAll(/([\d.]+)°/g)].map((m) => Number(m[1]));
  expect(lat).toBeGreaterThan(5.6);
  expect(lat).toBeLessThan(20.5);
  expect(lon).toBeGreaterThan(97.3);
  expect(lon).toBeLessThan(105.7);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the world view holds still and flights are jump cuts', async ({ page }) => {
    await page.goto('/');
    const marker = page.getByRole('button', { name: 'Thailand — 3 sites. Show them' });
    await page.mouse.move(0, 0);
    const before = await marker.boundingBox();
    await page.waitForTimeout(800);
    expect(await marker.boundingBox()).toEqual(before);
    await marker.click();
    await expect(crumbs(page).getByRole('button', { name: 'Thailand' })).toHaveAttribute('aria-current', 'location');
  });
});

for (const [w, h] of [[1280, 720], [1440, 900]] as const) {
  test(`at ${w}×${h} a site card shows its room in 3D, keeps its actions in reach and stays clear of "Not placed yet"`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await addSite(page, 'Acme', 'Unplaced depot');
    await page.getByRole('link', { name: 'Glasshouse' }).first().click();
    const search = page.getByRole('combobox', { name: /Search sites and rooms/ });
    await search.fill('Riverside Campus');
    await search.press('Enter');
    const card = page.locator('.globe-sitecard');
    await expect(card).toBeVisible();
    await expect(page.locator('.globe-map')).not.toHaveClass(/is-flying/);
    await expect(card.locator('#site-card-scene')).toBeVisible();
    const toggle = page.getByRole('button', { name: /^Not placed yet/ });
    await expect(toggle).toBeVisible();
    const [c, t, a] = await Promise.all([card.boundingBox(), toggle.boundingBox(), card.locator('.site-card__actions').boundingBox()]);
    const overlaps = t!.x < c!.x + c!.width && t!.x + t!.width > c!.x && t!.y < c!.y + c!.height && t!.y + t!.height > c!.y;
    expect(overlaps).toBe(false);
    expect(a!.y + a!.height).toBeLessThanOrEqual(c!.y + c!.height + 1);
  });
}
