import { expect, test } from '@playwright/test';
import { pickTool } from '../e2e/tools';

// The server sends a Content-Security-Policy with every response. The real app must run under it: a violation
// on any of these screens means something is broken in production while every other test still passes.
test('the app runs under its content security policy', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Refused to/.test(msg.text())) violations.push(msg.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`Refused to load ${e.blockedURI} (${e.violatedDirective}) ${e.sourceFile}:${e.lineNumber} ${e.sample}`));
  });

  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByText('Connected to the Glasshouse server')).toBeVisible();

  // Home, then a room with something in it, approved so that it has an Install sheet.
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Policy check');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add site to Policy check' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site P');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site P' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('CSP-1');
  await page.keyboard.press('Enter');
  await pickTool(page, 'Racks', 'Rack');
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: 'Add Compute Server 4U to RK-01' }).click();

  await page.getByRole('link', { name: '3D' }).click();
  // The lazy three.js chunk loads here. Chromium has WebGL, so the fallback text would mean a blocked chunk.
  await expect(page.locator('.room3d canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/can't show 3D/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Confirm submit' }).click();
  await page.getByLabel('Reviewer name (unverified)').fill('Ploy');
  await page.getByRole('button', { name: 'Approve revision' }).click();
  await page.getByRole('button', { name: 'Confirm approval' }).click();

  await page.getByRole('link', { name: /Install sheet · R01/ }).click();
  await expect(page.locator('.sheet-page').first()).toContainText('R01 APPROVED');
  await expect(page.getByRole('table', { name: 'Bill of materials' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Projects' })).toBeVisible();

  expect(violations).toEqual([]);
});
