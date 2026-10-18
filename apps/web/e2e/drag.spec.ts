import { openRoom } from './nav';
import { expect, test, type Locator, type Page } from '@playwright/test';


const PAD = 2;

/** Press near the device's bottom U, bring the target row into view, then move over `u` of `rack` in steps. */
async function dragTo(page: Page, block: Locator, rack: Locator, u: number): Promise<void> {
  // Firefox ignores scrollIntoView on SVG children: scroll the rack area directly.
  await block.evaluate((el) => {
    const area = el.closest('.elev__racks')!;
    area.scrollBy(0, el.getBoundingClientRect().top - area.getBoundingClientRect().top - area.clientHeight / 2);
  });
  const from = await block.boundingBox();
  if (!from) throw new Error('Not rendered');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height - 6);
  await page.mouse.down();
  const cap = Number(await rack.getAttribute('data-capacity-u'));
  // The elevation fits its unit height to the screen; read it from the rack.
  const U_PX = Number(await rack.getAttribute('data-u-px'));
  const rowY = PAD + (cap - u) * U_PX + U_PX / 2;
  await rack.evaluate((svg, rowY) => {
    const area = svg.closest('.elev__racks')!;
    const mid = area.getBoundingClientRect().top + area.clientHeight / 2;
    area.scrollBy(0, svg.getBoundingClientRect().top + rowY - mid);
  }, rowY);
  const to = await rack.boundingBox();
  if (!to) throw new Error('Not rendered');
  await page.mouse.move(to.x + to.width / 2, to.y + rowY, { steps: 8 });
  // The path may pass the area's edge and auto-scroll it; re-measure and land exactly on the row.
  const settled = await rack.boundingBox();
  if (!settled) throw new Error('Not rendered');
  await page.mouse.move(settled.x + settled.width / 2, settled.y + rowY);
}

test('drags a device to another U and across racks; a blocked spot explains itself', async ({ page }) => {
  await page.goto('/');
  await openRoom(page, /MDF-1/);
  await page.getByRole('link', { name: 'Elevation' }).click();
  const racks = page.locator('svg[data-rack-id]');
  const chassis = page.getByRole('button', { name: /^CH-01,/ });
  await expect(chassis).toHaveAccessibleName('CH-01, U1–U6');

  await dragTo(page, chassis, racks.nth(0), 20);
  await expect(page.locator('.drop-ghost')).toContainText('Move to U20–U25');
  await page.mouse.up();
  await expect(chassis).toHaveAccessibleName('CH-01, U20–U25');

  // Onto the second rack, over its switches at U1–U3: refused, nothing moves.
  await dragTo(page, chassis, racks.nth(1), 3);
  await expect(page.locator('.drop-ghost.is-bad')).toContainText('overlap');
  await page.mouse.up();
  await expect(chassis).toHaveAccessibleName('CH-01, U20–U25');

  await dragTo(page, chassis, racks.nth(1), 10);
  await expect(page.locator('.drop-ghost')).toContainText('Move to U10–U15');
  await page.mouse.up();
  await expect(racks.nth(1).getByRole('button', { name: /^CH-01,/ })).toHaveAccessibleName('CH-01, U10–U15');
  await expect(page.getByRole('heading', { name: 'CH-01' })).toBeVisible();

  // Escape cancels mid-drag.
  await dragTo(page, chassis, racks.nth(1), 30);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(chassis).toHaveAccessibleName('CH-01, U10–U15');
});
