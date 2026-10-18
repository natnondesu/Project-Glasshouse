import { expect, test } from '@playwright/test';

const CORNER_REACH_PX = 5;

test('the corner arrow opens the flyout from a 24 px target, without taking the group button or its neighbours', async ({ page, browserName }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /MDF-1/ }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  const more = page.getByRole('button', { name: 'More Racks tools', exact: true });
  const arrow = await more.boundingBox();
  const face = await page.getByRole('button', { name: 'Place rack', exact: true }).boundingBox();
  if (!arrow || !face) throw new Error('Toolbar not rendered');

  // Outside the drawn arrow, but inside its 24 px target: up-left of it, and in the toolbar's right padding.
  await page.mouse.click(arrow.x - CORNER_REACH_PX, arrow.y - 8);
  await expect(page.getByRole('menu', { name: 'Racks tools' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.click(arrow.x + arrow.width + 4, arrow.y + arrow.height / 2);
  await expect(page.getByRole('menu', { name: 'Racks tools' })).toBeVisible();
  await page.keyboard.press('Escape');

  // The rest of the face still picks the default tool, and the area just below the group belongs to nobody.
  await page.mouse.click(face.x + 6, face.y + 6);
  await expect(page.getByRole('button', { name: 'Place rack', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.tool-group__more') !== null, [arrow.x + 6, arrow.y + arrow.height + 5])).toBe(false);

  // A keyboard user sees where focus is. (Safari does not Tab to buttons unless the user opts in.)
  if (browserName === 'webkit') return;
  await page.getByRole('button', { name: 'Place rack', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(more).toBeFocused();
  expect(await more.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
});

test('a flyout low on the rail stays inside the plan area on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /MDF-1/ }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  await page.getByRole('button', { name: 'More Power source tools', exact: true }).click();
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

test('the hint shows wherever the pointer is on a grouped tool, including over its corner arrow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /MDF-1/ }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  const face = await page.getByRole('button', { name: 'Place rack', exact: true }).boundingBox();
  if (!face) throw new Error('Toolbar not rendered');
  const hint = page.getByRole('tooltip').filter({ hasText: 'Place rack' });
  // Lower half of the icon, where the arrow's 24 px target overlaps it.
  await page.mouse.move(face.x + face.width * 0.6, face.y + face.height * 0.8);
  await expect(hint).toBeVisible();
  await page.mouse.move(face.x + face.width / 2, face.y + 6);
  await expect(hint).toBeVisible();
});
