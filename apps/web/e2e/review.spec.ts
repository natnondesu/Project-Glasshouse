import { pickTool } from './tools';
import { expect, test, type Page } from '@playwright/test';

async function roomWithServer(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Northgate');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add site to Northgate' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site A');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site A' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('MDF-1');
  await page.keyboard.press('Enter');
  await pickTool(page, 'Place rack', 'Rack');
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: 'Add Compute Server 4U to RK-01' }).click();
}

test('AC13/AC16: submit, freeze, self-approve, start a new draft', async ({ page }) => {
  await roomWithServer(page);
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByLabel('Designed by (optional, unverified)').fill('Ploy');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Confirm submit' }).click();
  await page.getByRole('link', { name: 'Plan' }).click();
  await expect(page.getByText('R01 In review · read-only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place rack' })).toHaveCount(0);
  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByLabel('Reviewer name (unverified)').fill('Ploy');
  await page.getByRole('button', { name: 'Approve revision' }).click();
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page.getByText('Self-approved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await expect(page.getByText('R02 DRAFT')).toBeVisible();
});

test('AC14: an unknown reserved range blocks approval until acknowledged', async ({ page }) => {
  await roomWithServer(page);
  await page.getByRole('button', { name: 'RK-01', exact: true }).click();
  await page.getByRole('button', { name: 'Add reserved range' }).click();
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Confirm submit' }).click();
  await expect(page.getByRole('button', { name: 'Approve revision' })).toBeDisabled();
  await page.getByLabel('Why is it acceptable?').fill('Customer will not share figures');
  await page.getByLabel('Your name (unverified)').fill('Somchai');
  await page.getByRole('button', { name: 'Acknowledge' }).click();
  await page.getByLabel('Reviewer name (unverified)').fill('Somchai');
  await expect(page.getByRole('button', { name: 'Approve revision' })).toBeEnabled();
  await page.getByRole('button', { name: 'Approve revision' }).click();
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /MDF-1/ }).last()).toContainText('R01 APPROVED');
});

test('AC15: export a project file, change the room, import and take incoming', async ({ page }) => {
  await roomWithServer(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project file' }).click();
  const file = await (await downloading).path();
  await page.getByRole('link', { name: 'Plan' }).click();
  await page.getByLabel('Width', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Import project file' }).click();
  await page.getByLabel('Choose a project file').setInputFiles(file);
  const dialog = page.getByRole('dialog', { name: 'Import “Northgate”' });
  await expect(dialog).toContainText('1 room already here');
  await page.getByRole('button', { name: 'MDF-1: take incoming' }).click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('5.00');
});

test('backup reminder, backup and confirmed restore', async ({ page }) => {
  await roomWithServer(page);
  await expect(page.getByText('Not backed up yet.')).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up workspace' }).click();
  const backup = await (await downloading).path();
  await expect(page.getByText('Backed up today.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete Northgate' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByLabel('Choose a backup file').setInputFiles(backup);
  await page.getByRole('button', { name: 'Replace workspace' }).click();
  await expect(page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /MDF-1/ }).last()).toBeVisible();
});
