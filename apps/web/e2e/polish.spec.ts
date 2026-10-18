import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { pickTool } from './tools';

const SHOTS = fileURLToPath(new URL('../../../.superpowers/polish-shots/', import.meta.url));

async function openRoom(page: Page, room: RegExp): Promise<void> {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: room }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
}

/** The names of the buttons inside a container that a click would actually reach. */
const enabledButtons = (scope: Locator): Promise<string[]> =>
  scope.evaluate((el) => [...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].map((b) => b.getAttribute('aria-label') ?? b.textContent ?? ''));

test.describe('an approved revision: ways can be read, never edited', () => {
  test('the plan inspector opens the ways as View ways, and moving between breakers changes nothing', async ({ page }) => {
    await openRoom(page, /Server room A/);
    await page.getByRole('button', { name: /^MCB-01, MCB panel/ }).focus();
    await expect(page.getByRole('button', { name: 'Manage ways' })).toHaveCount(0);
    await page.getByRole('button', { name: 'View ways' }).click();
    const manager = page.getByRole('dialog', { name: 'MCB-01 ways' });
    await expect(manager).toBeVisible();

    await manager.getByRole('button', { name: /^Way 3,/ }).click();
    await expect(manager.getByRole('heading', { name: /^Way 3 ·/ })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(manager.getByRole('heading', { name: /^Way 4 ·/ })).toBeVisible();

    // Nothing here edits: the only live buttons are the breaker tiles and Close.
    for (const name of await enabledButtons(manager)) expect(name).toMatch(/^(Way \d+,|Close MCB-01 ways)/);
    for (const field of await manager.locator('input, select').all()) await expect(field).toBeDisabled();
    await expect(manager.getByRole('switch', { name: 'In use' })).toBeDisabled();

    await page.screenshot({ path: `${SHOTS}1-view-ways-plan-1440x900.png` });
    await page.keyboard.press('Escape');
    await expect(manager).toBeHidden();
  });

  test('double-clicking an MCB panel on the plan opens the same view', async ({ page }) => {
    await openRoom(page, /Server room A/);
    await page.locator('.obj--mcb').first().dblclick();
    const manager = page.getByRole('dialog', { name: /ways$/ });
    await expect(manager).toBeVisible();
    await expect(manager.getByRole('switch', { name: 'In use' })).toBeDisabled();
    await manager.getByRole('button', { name: /^Way 2,/ }).click();
    await expect(manager.getByRole('heading', { name: /^Way 2 ·/ })).toBeVisible();
  });

  test('the 3D card says View ways and opens the same view', async ({ page }) => {
    await openRoom(page, /Server room A/);
    await page.getByRole('link', { name: '3D' }).click();
    await expect(page.locator('.room3d canvas').or(page.getByText(/can't show 3D/))).toBeVisible({ timeout: 20_000 });
    const search = page.getByRole('combobox', { name: 'Search this room' });
    await search.fill('mcb-01');
    await search.press('Enter');
    await expect(page.getByRole('button', { name: 'Manage ways' })).toHaveCount(0);
    await page.getByRole('button', { name: 'View ways' }).click();
    const manager = page.getByRole('dialog', { name: 'MCB-01 ways' });
    await expect(manager.getByRole('switch', { name: 'In use' })).toBeDisabled();
    await manager.getByRole('button', { name: /^Way 2,/ }).click();
    await expect(manager.getByRole('heading', { name: /^Way 2 ·/ })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}1-view-ways-3d-1440x900.png` });
  });

  test('a draft of the same room still says Manage ways and edits', async ({ page }) => {
    await openRoom(page, /Server room A/);
    await page.getByRole('link', { name: /^Review/ }).click();
    await page.getByRole('button', { name: 'Start new draft' }).click();
    await page.getByRole('link', { name: 'Plan' }).click();
    await page.getByRole('button', { name: /^MCB-01, MCB panel/ }).focus();
    await page.getByRole('button', { name: 'Manage ways' }).click();
    await expect(page.getByRole('dialog', { name: 'MCB-01 ways' }).getByRole('switch', { name: 'In use' })).toBeEnabled();
  });
});

/** A point on the object that the pointer really reaches: a callout or another object can cover its middle. */
async function reachablePoint(page: Page, object: Locator): Promise<[number, number]> {
  const id = await object.getAttribute('data-object-id');
  const box = (await object.locator('.obj__body').boundingBox())!;
  const point = await page.evaluate(
    ([objectId, x0, y0, w, h]) => {
      for (const fy of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
          const [x, y] = [x0! + w! * fx, y0! + h! * fy];
          if (document.elementFromPoint(x, y)?.closest('[data-object-id]')?.getAttribute('data-object-id') === objectId) return [x, y] as [number, number];
        }
      }
      return null;
    },
    [id, box.x, box.y, box.width, box.height] as const,
  );
  if (!point) throw new Error(`${id} is covered everywhere`);
  return point;
}

test('a not-in-use panel carries no tag on the plan, and says so on hover', async ({ page }) => {
  await openRoom(page, /Server room A/);
  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await page.getByRole('link', { name: 'Plan' }).click();
  // A new panel has no feeds, so switching it off raises no callout over it.
  await pickTool(page, 'Power source', 'MCB panel');
  const floor = (await page.getByTestId('footprint').boundingBox())!;
  await page.mouse.click(floor.x + floor.width * 0.5, floor.y + floor.height * 0.8);
  await page.getByRole('button', { name: 'Manage ways' }).click();
  const manager = page.getByRole('dialog', { name: /ways$/ });
  await manager.getByRole('switch', { name: 'In use' }).click();
  await manager.getByRole('button', { name: /^Close / }).click();
  await expect(page.locator('.obj--off')).toHaveCount(1);
  await expect(page.locator('.obj--off .obj__label')).toHaveCount(0);
  await expect(page.locator('.plan-canvas text', { hasText: 'Not in use' })).toHaveCount(0);
  const [x, y] = await reachablePoint(page, page.locator('.obj--off'));
  await page.mouse.move(x, y);
  await expect(page.locator('.obj__hover')).toHaveText(/ · Not in use$/);
  await page.screenshot({ path: `${SHOTS}2-not-in-use-1440x900.png` });
});

/** Makes the label hit-testable (it ignores the pointer, so it never steals the hover) to ask what is painted on top at its centre. */
async function topmostAtLabelCentre(page: Page): Promise<{ label: boolean; point: [number, number] } | null> {
  return page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.obj__hover-tag { pointer-events: auto !important; }';
    document.head.append(style);
    try {
      const rect = document.querySelector('.obj__hover-tag rect');
      if (!rect) return null;
      const r = rect.getBoundingClientRect();
      const [x, y] = [r.x + r.width / 2, r.y + r.height / 2];
      return { label: document.elementFromPoint(x, y)?.closest('.obj__hover-tag') != null, point: [x, y] as [number, number] };
    } finally {
      style.remove();
    }
  });
}

test('the hover name of every object is painted above all the others, even when they crowd it', async ({ page }) => {
  await openRoom(page, /MDF-1/);
  // Zoomed out, the objects press together while the label keeps its size: the worst case for a label that lives inside its object.
  for (let i = 0; i < 6; i += 1) await page.getByRole('button', { name: 'Zoom out' }).click();
  const objects = page.locator('.plan-canvas .obj');
  const n = await objects.count();
  expect(n).toBeGreaterThan(5);
  let checked = 0;
  for (let i = 0; i < n; i += 1) {
    const body = objects.nth(i).locator('.obj__body');
    const box = await body.boundingBox();
    if (!box) continue;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    // Only objects the pointer really reaches at their middle can be hovered there.
    const reached = await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest('[data-object-id]')?.getAttribute('data-object-id') ?? null, [x, y]);
    if (reached !== (await objects.nth(i).getAttribute('data-object-id'))) continue;
    await page.mouse.move(x, y);
    await expect(page.locator('.obj__hover-tag')).toHaveCount(1);
    const top = await topmostAtLabelCentre(page);
    expect(top?.label, `label of ${await objects.nth(i).getAttribute('aria-label')} is under another object at ${top?.point}`).toBe(true);
    checked += 1;
  }
  expect(checked).toBeGreaterThan(5);
});

test('the name of a panel in a stack of MCB panels reads whole, on top, and inside the canvas', async ({ page }) => {
  await openRoom(page, /Server room A/);
  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await page.getByRole('link', { name: 'Plan' }).click();
  const floor = (await page.getByTestId('footprint').boundingBox())!;
  // Three panels 0.2 m apart, the lowest placed first: the later ones are drawn over it, right where its name goes.
  for (const [name, y] of [['MCB-03', 3.4], ['MCB-04', 3.2], ['MCB-05', 3.0]] as const) {
    await pickTool(page, 'Power source', 'MCB panel');
    await page.mouse.click(floor.x + floor.width * 0.5, floor.y + floor.height * 0.5);
    const placement = page.getByRole('complementary', { name: `${name} details` }).getByRole('group', { name: 'Placement' });
    await placement.getByRole('textbox', { name: 'X' }).fill('4.5');
    await placement.getByRole('textbox', { name: 'X' }).press('Enter');
    await placement.getByRole('textbox', { name: 'Y' }).fill(String(y));
    await placement.getByRole('textbox', { name: 'Y' }).press('Enter');
  }
  const lowest = page.getByRole('button', { name: /^MCB-03, MCB panel/ });
  await expect(lowest).toBeVisible();
  const [x, y] = await reachablePoint(page, lowest);
  await page.mouse.move(x, y);
  await expect(page.locator('.obj__hover')).toHaveText('MCB-03');
  expect((await topmostAtLabelCentre(page))?.label).toBe(true);
  const canvas = (await page.locator('.plan-canvas').boundingBox())!;
  const label = (await page.locator('.obj__hover-tag rect').boundingBox())!;
  expect(label.x).toBeGreaterThanOrEqual(canvas.x);
  expect(label.y).toBeGreaterThanOrEqual(canvas.y);
  expect(label.x + label.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  await page.screenshot({ path: `${SHOTS}3-hover-label-1440x900.png` });
});

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1280, height: 720 },
] as const;

for (const size of SIZES) {
  test(`the Checks header clears the toolbar and collapses on a real click at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    // MDF-1 has a blocking check, so Checks has a list to fold away.
    await openRoom(page, /MDF-1/);
    const checks = page.getByRole('region', { name: /Checks/ });
    const toolbar = page.getByRole('toolbar', { name: 'Plan tools' });
    const toggle = checks.getByRole('button', { name: 'Hide checks' });
    await expect(toggle).toBeVisible();

    const clear = async (): Promise<void> => {
      const [c, t] = [(await checks.boundingBox())!, (await toolbar.boundingBox())!];
      const overlaps = c.x < t.x + t.width && c.x + c.width > t.x && c.y < t.y + t.height && c.y + c.height > t.y;
      expect(overlaps, `Checks ${JSON.stringify(c)} overlaps the toolbar ${JSON.stringify(t)}`).toBe(false);
    };
    await clear();
    await page.screenshot({ path: `${SHOTS}4-checks-open-${size.width}x${size.height}.png` });

    // No force: this fails if anything else is on top of the toggle.
    await toggle.click();
    await expect(checks.getByRole('button', { name: 'Show checks' })).toHaveAttribute('aria-expanded', 'false');
    await clear();
    await page.screenshot({ path: `${SHOTS}4-checks-collapsed-${size.width}x${size.height}.png` });

    await checks.getByRole('button', { name: 'Show checks' }).click();
    await expect(checks.getByRole('button', { name: 'Hide checks' })).toHaveAttribute('aria-expanded', 'true');
  });
}
