import { openRoom as openFromTree } from './nav';
import { expect, test } from '@playwright/test';

import { groupButton, pickTool } from './tools';

const openRoom = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/');
  await openFromTree(page, /MDF-1/);
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
};

test('a group with variants opens its list wherever its button is clicked', async ({ page }) => {
  await openRoom(page);
  const racks = groupButton(page, 'Racks');
  const box = await racks.boundingBox();
  if (!box) throw new Error('Toolbar not rendered');
  const menu = page.getByRole('menu', { name: 'Racks tools' });
  // Top-left, centre and the corner mark: the same thing happens everywhere.
  for (const [x, y] of [[4, 4], [box.width / 2, box.height / 2], [box.width - 4, box.height - 4]] as const) {
    await page.mouse.click(box.x + x, box.y + y);
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Escape cancels a tool chosen from a group list, like any other tool', async ({ page }) => {
  await openRoom(page);
  await pickTool(page, 'Racks', 'Wall rack');
  await expect(groupButton(page, 'Racks')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(groupButton(page, 'Racks')).toHaveAttribute('aria-pressed', 'false');
});

test('a flyout low on the rail stays inside the plan area on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openRoom(page);
  await groupButton(page, 'Power source').click();
  const menu = page.getByRole('menu', { name: 'Power source tools' });
  await expect(menu).toBeVisible();
  // The last tool must be fully on screen and inside the area that clips the flyout, not cut off at the bottom.
  const last = menu.getByRole('menuitemradio', { name: '3rd-party PDU' });
  const box = await last.boundingBox();
  const clip = await menu.evaluate((el) => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (/(hidden|auto|scroll|clip)/.test(`${s.overflow} ${s.overflowY}`)) return node.getBoundingClientRect().bottom;
    }
    return window.innerHeight;
  });
  if (!box) throw new Error('Last power tool not rendered');
  expect(box.y + box.height).toBeLessThanOrEqual(Math.min(clip, 720));
  await last.click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole('toolbar', { name: 'Plan tools' }).getByRole('button', { name: /^3rd-party PDU — / })).toHaveAttribute('aria-pressed', 'true');
});

test('on a short screen with Checks expanded the rail clears the strip and all nine buttons stay reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => localStorage.setItem('glasshouse:checks-open', 'true'));
  await openRoom(page);
  const bar = page.getByRole('toolbar', { name: 'Plan tools' });
  const buttons = bar.getByRole('button');
  await expect(buttons).toHaveCount(9);
  const rail = await bar.boundingBox();
  const last = await buttons.last().boundingBox();
  const plan = await page.locator('.plan-canvas').boundingBox();
  const checks = await page.getByRole('region', { name: 'Checks' }).boundingBox();
  if (!rail || !last || !plan || !checks) throw new Error('Plan view not rendered');
  // The strip starts to the right of the rail, so the rail never covers its heading.
  expect(checks.x).toBeGreaterThanOrEqual(rail.x + rail.width);
  expect(last.y + last.height).toBeLessThanOrEqual(plan.y + plan.height);
  await buttons.last().click();
  await expect(page.getByRole('menu', { name: 'Power source tools' })).toBeVisible();
});

test('the hint shows wherever the pointer is on a grouped tool, including over its corner arrow', async ({ page }) => {
  await openRoom(page);
  const face = await groupButton(page, 'Racks').boundingBox();
  if (!face) throw new Error('Toolbar not rendered');
  const hint = page.getByRole('tooltip').filter({ hasText: 'Place rack' });
  // Lower half of the icon, where the arrow's 24 px target overlaps it.
  await page.mouse.move(face.x + face.width * 0.6, face.y + face.height * 0.8);
  await expect(hint).toBeVisible();
  await page.mouse.move(face.x + face.width / 2, face.y + 6);
  await expect(hint).toBeVisible();
});

test('after picking from a list and pressing Escape, no hint lingers and hovering shows only one', async ({ page }) => {
  await openRoom(page);
  await pickTool(page, 'Floor', 'Cut out');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Pointer away from the toolbar: nothing explains itself.
  await page.mouse.move(700, 500);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  // Hovering another tool shows its hint alone, not next to the Floor one.
  await groupButton(page, 'Racks').hover();
  await expect(page.getByRole('tooltip')).toHaveCount(1);
  await expect(page.getByRole('tooltip')).toContainText('Place rack');
});

test('keyboard focus still shows a tool’s hint', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari does not Tab to buttons unless the user opts in');
  await openRoom(page);
  await page.getByRole('button', { name: 'Select', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Pan', exact: true })).toBeFocused();
  await expect(page.getByRole('tooltip')).toContainText('Pan');
});
