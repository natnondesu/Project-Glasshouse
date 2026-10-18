import { expect, test, type Page } from '@playwright/test';
import { showProjects } from './nav';

async function seed(page: Page, tag: string): Promise<{ project: string; site: string }> {
  const project = `Harbour ${tag}`;
  const site = `Quay ${tag}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill(project);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: `Add site to ${project}` }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill(site);
  await page.keyboard.press('Enter');
  for (const room of ['Core', 'Edge']) {
    // From the second room on, the tree is the drawer over the room just made.
    await showProjects(page);
    await page.getByRole('button', { name: `Add room to ${site}` }).click();
    await page.getByRole('textbox', { name: 'Room name' }).fill(`${room} ${tag}`);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: `${room} ${tag}` })).toBeVisible();
  }
  return { project, site };
}

const treeOf = (page: Page) => page.getByRole('complementary', { name: 'Projects' });

test('archive a room: hidden, then shown greyed, read-only when opened, and restorable', async ({ page }) => {
  const { site } = await seed(page, 'a');
  const tree = await showProjects(page);
  await tree.getByRole('button', { name: 'Archive Core a' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Archive Core a?' })).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();

  await expect(tree.getByRole('link', { name: /^Core a/ })).toHaveCount(0);
  await expect(tree.getByRole('link', { name: /^Edge a/ })).toBeVisible();

  await tree.getByRole('checkbox', { name: /Show archived/ }).check();
  const row = tree.getByRole('link', { name: /^Core a/ });
  await expect(row).toContainText('Archived');
  // Greyed: the archived row's ink differs from a live row's.
  const inkOf = (locator: typeof row) => locator.evaluate((el) => getComputedStyle(el).color);
  expect(await inkOf(row)).not.toBe(await inkOf(tree.getByRole('link', { name: /^Edge a/ })));
  // Archived work can't be deleted until it is restored.
  await expect(tree.getByRole('button', { name: /^Delete Core a/ })).toHaveAttribute('aria-disabled', 'true');

  await row.click();
  await expect(page.getByRole('status').filter({ hasText: /^Archived .*Read-only\./ })).toBeVisible();
  await expect(page.getByLabel('Width')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Racks tools' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Elevation' })).toBeVisible();
  await page.getByRole('link', { name: 'Review' }).click();
  await expect(page.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);
  await expect(page.getByLabel('New note')).toHaveCount(0);

  await page.getByRole('status').filter({ hasText: /Read-only\./ }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Archived / })).toHaveCount(0);
  await page.getByRole('link', { name: 'Plan' }).click();
  await expect(page.getByLabel('Width')).toBeEnabled();

  // With nothing archived left the toggle goes away as it is switched off, so click it rather than wait for it to settle.
  await showProjects(page);
  await tree.getByRole('checkbox', { name: /Show archived/ }).click();
  await expect(tree.getByRole('checkbox', { name: /Show archived/ })).toHaveCount(0);
  await expect(tree.getByRole('link', { name: /^Core a/ })).toBeVisible();
  await expect(tree.getByText(site)).toBeVisible();
});

test('archive a site: its rooms go, and a room inside it points to the site to restore first', async ({ page }) => {
  const { site } = await seed(page, 'b');
  const tree = treeOf(page);
  await page.goto('/');
  await tree.getByRole('button', { name: `Archive ${site}` }).click();
  await expect(page.getByRole('alertdialog', { name: `Archive ${site} and its 2 rooms?` })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toContainText('They become read-only and hidden. You can restore them any time.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();

  await expect(tree.getByRole('link', { name: /^Core b/ })).toHaveCount(0);
  await expect(tree.getByRole('link', { name: /^Edge b/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: new RegExp(site) })).toHaveCount(0);

  await tree.getByRole('checkbox', { name: /Show archived/ }).check();
  const blocked = tree.getByRole('button', { name: /^Restore Core b/ });
  await expect(blocked).toHaveAccessibleName(`Restore Core b. Restore Site ${site} first.`);
  // aria-disabled: assistive tech hears it is unavailable, a click still explains why.
  await blocked.click({ force: true });
  await expect(tree.getByRole('alert')).toHaveText(`Restore Site ${site} first.`);

  await tree.getByRole('button', { name: `Restore ${site}` }).click();
  await expect(tree.getByRole('link', { name: /^Core b/ })).toBeVisible();
  await expect(tree.getByRole('link', { name: /^Core b/ }).locator('xpath=ancestor::li[1]')).not.toHaveClass(/tree-row--archived/);
});

test('the header and home count only what is in use', async ({ page }) => {
  await seed(page, 'c');
  await page.goto('/');
  const before = await page.locator('.title-block__cells').first().innerText();
  const found = /(\d+) rooms?/.exec(before);
  expect(found, `no room count in "${before}"`).not.toBeNull();
  const rooms = Number(found![1]);
  await treeOf(page).getByRole('button', { name: 'Archive Edge c' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  await expect(page.locator('.title-block__cells').first()).toContainText(`${rooms - 1} ${rooms - 1 === 1 ? 'room' : 'rooms'}`);
  await expect(page.getByRole('main').getByRole('link', { name: 'Edge c', exact: true })).toHaveCount(0);
});
