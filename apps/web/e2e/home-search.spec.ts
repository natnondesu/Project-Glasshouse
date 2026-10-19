import { expect, test, type Page } from '@playwright/test';

const crumbs = (page: Page) => page.getByRole('navigation', { name: 'Map level' });
const search = (page: Page) => page.getByRole('combobox', { name: 'Search sites and rooms' });
const results = (page: Page) => page.getByRole('listbox', { name: 'Search results' });
const card = (page: Page) => page.locator('.globe-sitecard');

/** The plain Home: the whole world, scope Everywhere, one count for the country. */
async function expectWorld(page: Page): Promise<void> {
  await expect(crumbs(page).getByRole('button', { name: 'World' })).toHaveAttribute('aria-current', 'location');
  await expect(crumbs(page).getByRole('button', { name: 'Thailand' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thailand — 3 sites. Show them' })).toBeVisible();
  await expect(page.locator('#numbers-h')).toHaveText('Everywhere · 3 sites');
}

test('a room typed in the search is listed, and the arrows and Enter show it in its site’s card', async ({ page }) => {
  await page.goto('/');
  await expectWorld(page);
  await page.keyboard.press('/');
  await page.keyboard.type('shaft l2');
  const option = results(page).getByRole('group', { name: /^Rooms/ }).getByRole('option');
  await expect(option).toHaveCount(1);
  await expect(option).toContainText('Shaft L2');
  await expect(option.locator('mark')).toHaveText(['Shaft', 'L2']);
  await page.keyboard.press('ArrowDown');
  await expect(search(page)).toHaveAttribute('aria-activedescendant', (await option.getAttribute('id'))!);
  await page.keyboard.press('Enter');
  await expect(results(page)).toBeHidden();
  await expect(card(page).locator('#home-site-name')).toHaveText('Riverside Campus');
  await expect(card(page).getByRole('button', { name: 'Show Shaft L2 in 3D' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.globe-map')).not.toHaveClass(/is-flying/);
  await expect(crumbs(page).getByRole('button', { name: 'Riverside Campus' })).toHaveAttribute('aria-current', 'location');
});

test('a room’s Open in the dropdown goes straight into the room, from the keyboard', async ({ page }) => {
  await page.goto('/');
  // The shortcut is the search's own: it listens once the search is on the page.
  await expect(search(page)).toBeVisible();
  await page.keyboard.press('/');
  await page.keyboard.type('mdf');
  await expect(results(page).getByRole('option').first()).toContainText('MDF-1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('link', { name: 'Open MDF-1' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle('MDF-1 · Plan · Glasshouse');
});

test('a search that finds nothing says so, and Clear empties it', async ({ page }) => {
  await page.goto('/');
  await search(page).click();
  await page.keyboard.type('zzqx');
  await expect(page.getByText('No site, room or project matches “zzqx”')).toBeVisible();
  await expect(page.getByText('Check the spelling, or search by a site or room name.')).toBeVisible();
  // Escape closes the dropdown and keeps the words; a second Escape clears them.
  await page.keyboard.press('Escape');
  await expect(page.getByText('No site, room or project matches “zzqx”')).toBeHidden();
  await expect(search(page)).toHaveValue('zzqx');
  await page.keyboard.press('Escape');
  await expect(search(page)).toHaveValue('');
  await page.keyboard.type('zzqx');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(search(page)).toHaveValue('');
  await expect(search(page)).toBeFocused();
});

test('Back from a room restores the filtered view; the logo gives the whole world again', async ({ page }) => {
  await page.goto('/');
  // The shortcut is the search's own: it listens once the search is on the page.
  await expect(search(page)).toBeVisible();
  await page.keyboard.press('/');
  await page.keyboard.type('shaft l2');
  await expect(results(page).getByRole('option').first()).toContainText('Shaft L2');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/q=shaft\+l2.*scope=site/);
  await card(page).getByRole('link', { name: 'Open Shaft L2' }).click();
  await expect(page).toHaveTitle('Shaft L2 · Plan · Glasshouse');
  await page.goBack();
  await expect(search(page)).toHaveValue('shaft l2');
  await expect(card(page).locator('#home-site-name')).toHaveText('Riverside Campus');
  await expect(crumbs(page).getByRole('button', { name: 'Riverside Campus' })).toHaveAttribute('aria-current', 'location');
  // Into the room again, and home by the logo: the plain Home, on the world.
  await page.goForward();
  await expect(page).toHaveTitle('Shaft L2 · Plan · Glasshouse');
  await page.getByRole('link', { name: 'Glasshouse' }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(search(page)).toHaveValue('');
  await expectWorld(page);
  await expect(card(page)).toHaveCount(0);
});
