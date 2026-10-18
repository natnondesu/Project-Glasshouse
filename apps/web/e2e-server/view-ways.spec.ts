import { expect, test } from '@playwright/test';
import { pickTool } from '../e2e/tools';

test('looking at the ways of an approved room sends no command and takes no editing claim', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Ways view');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add site to Ways view' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site W');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site W' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('Room W');
  await page.keyboard.press('Enter');
  // Approval needs a device in a rack.
  await pickTool(page, 'Racks', 'Rack');
  const floor = (await page.getByTestId('footprint').boundingBox())!;
  await page.mouse.click(floor.x + floor.width * 0.3, floor.y + floor.height * 0.35);
  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: 'Add Compute Server 4U to RK-01' }).click();
  await page.getByRole('link', { name: 'Plan', exact: true }).click();
  await pickTool(page, 'Power source', 'MCB panel');
  await page.mouse.click(floor.x + floor.width * 0.7, floor.y + floor.height * 0.7);
  await expect(page.getByRole('heading', { name: 'MCB-01' })).toBeVisible();
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Confirm submit' }).click();
  await page.getByLabel('Reviewer name (unverified)').fill('Ploy');
  await page.getByRole('button', { name: 'Approve revision' }).click();
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page.getByRole('button', { name: 'Start new draft' })).toBeVisible();

  // A fresh load: the page holds no claim from the edits above.
  await page.reload();
  await page.getByRole('link', { name: 'Plan', exact: true }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && /\/api\/(claims|commands)/.test(r.url())) writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });

  await page.getByRole('button', { name: /^MCB-01, MCB panel/ }).focus();
  await page.getByRole('button', { name: 'View ways' }).click();
  const manager = page.getByRole('dialog', { name: 'MCB-01 ways' });
  await expect(manager).toBeVisible();
  await manager.getByRole('button', { name: /^Way 3,/ }).click();
  await page.keyboard.press('ArrowRight');
  await expect(manager.getByRole('heading', { name: /^Way 4 ·/ })).toBeVisible();
  await expect(manager.getByRole('switch', { name: 'In use' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(manager).toBeHidden();
  // Let any request the clicks would have started go out before counting.
  await page.waitForTimeout(500);

  expect(writes).toEqual([]);
  await expect(page.getByRole('region', { name: /editing this room/ })).toHaveCount(0);
});
