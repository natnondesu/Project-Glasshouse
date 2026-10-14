import { expect, test, type Page } from '@playwright/test';

/**
 * Regression for imprecise 3D picking: outlines were pickable up to 1 m away, and labels and
 * highlight pads caught clicks meant for the floor. Positions are for the sample MDF at the default
 * camera in a 1440 × 900 window, measured from the canvas's top-left corner.
 */
async function selected(page: Page): Promise<string> {
  const out: string[] = [];
  for (const n of ['RK-01', 'RK-02', 'RK-C1']) if ((await page.getByRole('button', { name: new RegExp(`^${n}`) }).getAttribute('aria-pressed')) === 'true') out.push(n);
  return out.join(',') || 'none';
}

test('3D clicks pick the rack under the pointer and nothing beside it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Pixel positions are measured in Chromium');
  await page.goto('/');
  await page.getByRole('link', { name: /MDF-1/ }).click();
  await page.getByRole('link', { name: '3D' }).click();
  const canvas = page.locator('.room3d canvas');
  await canvas.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const box = (await canvas.boundingBox())!;
  const click = async (x: number, y: number) => {
    await page.mouse.click(box.x + 390, box.y + 600); // empty floor: clears
    await page.mouse.click(box.x + x, box.y + y);
  };
  for (const [x, y] of [[386, 316], [496, 406], [626, 266]] as const) {
    await click(x, y);
    await expect.poll(() => selected(page)).toBe('none');
  }
  await click(446, 266);
  await expect.poll(() => selected(page)).toBe('RK-01');
  await click(531, 266);
  await expect.poll(() => selected(page)).toBe('RK-02');
});
