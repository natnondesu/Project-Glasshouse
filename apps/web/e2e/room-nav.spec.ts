import { expect, test } from '@playwright/test';
import { openRoom, projectsButton, projectTree } from './nav';

const crumbs = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Breadcrumb' });

test('a room opens without the tree and the breadcrumb switches rooms in one click', async ({ page }) => {
  await page.goto('/');
  await openRoom(page, /Server room A/);
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  await expect(projectTree(page)).toHaveCount(0);

  await crumbs(page).getByRole('button', { name: 'Server room A' }).click();
  const switcher = page.getByRole('dialog', { name: 'Rooms in Sample · Northgate DC' });
  await expect(switcher.getByRole('menuitem', { name: /Server room A/ })).toHaveAttribute('aria-current', 'page');
  await switcher.getByRole('menuitem', { name: /MDF-1/ }).click();
  await expect(page).toHaveURL(/\/rooms\/[^/]+\/plan$/);
  await expect(crumbs(page).getByRole('button', { name: 'MDF-1' })).toBeVisible();
  await expect(switcher).toHaveCount(0);

  // The project crumb opens the project drawer where you are, never a jump Home.
  const url = page.url();
  const projectCrumb = crumbs(page).getByRole('button', { name: 'Sample · Northgate DC' });
  await projectCrumb.click();
  await expect(projectTree(page)).toBeVisible();
  expect(page.url()).toBe(url);
  await page.keyboard.press('Escape');
  await expect(projectTree(page)).toHaveCount(0);
  await expect(projectCrumb).toBeFocused();
});

test('the Projects button and [ open the drawer; picking a room closes it', async ({ page }) => {
  await page.goto('/');
  await openRoom(page, /Server room A/);
  await projectsButton(page).click();
  await expect(projectTree(page)).toBeVisible();
  await projectTree(page).getByRole('link', { name: /Shaft L1/ }).click();
  await expect(crumbs(page).getByRole('button', { name: 'Shaft L1' })).toBeVisible();
  await expect(projectTree(page)).toHaveCount(0);
  await expect(projectsButton(page)).toBeFocused();

  await page.keyboard.press('BracketLeft');
  await expect(projectTree(page)).toBeVisible();
  await expect(projectTree(page).getByRole('link', { name: /Shaft L1/ })).toBeFocused();
  await page.keyboard.press('BracketLeft');
  await expect(projectTree(page)).toHaveCount(0);
  await page.keyboard.press('BracketLeft');
  await projectTree(page).getByRole('link', { name: /Comms Room/ }).click();
  await expect(crumbs(page).getByRole('button', { name: 'Comms Room' })).toBeVisible();
  await expect(projectTree(page)).toHaveCount(0);
});

test('pinning docks the tree in rooms across a reload; unpinning makes it a drawer again', async ({ page }) => {
  await page.goto('/');
  await openRoom(page, /Server room A/);
  await projectsButton(page).click();
  const pin = projectTree(page).getByRole('button', { name: 'Pin projects' });
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(projectsButton(page)).toHaveCount(0);

  await page.reload();
  await expect(projectTree(page)).toBeVisible();
  await expect(projectTree(page)).not.toHaveClass(/tree--drawer/);
  await projectTree(page).getByRole('link', { name: /MDF-1/ }).click();
  await expect(projectTree(page)).toBeVisible();

  await projectTree(page).getByRole('button', { name: 'Pin projects' }).click();
  await expect(projectTree(page)).toHaveClass(/tree--drawer/);
  await page.keyboard.press('Escape');
  await expect(projectTree(page)).toHaveCount(0);
  await page.reload();
  await expect(projectsButton(page)).toBeVisible();
  await expect(projectTree(page)).toHaveCount(0);
});
