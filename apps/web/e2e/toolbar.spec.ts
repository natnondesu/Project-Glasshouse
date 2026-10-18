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
