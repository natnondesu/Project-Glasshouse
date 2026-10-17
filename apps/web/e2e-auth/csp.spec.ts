import { expect, test } from '@playwright/test';
import { signIn, signOut } from './helpers';

// Sign-in, password change, admin and file-import screens under the server's Content-Security-Policy.
// (The plan, 3D and Install sheet screens are covered in e2e-server/csp.spec.ts.)
test('the sign-in, password, Users and import screens run under the content security policy', async ({ page }, testInfo) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Refused to/.test(msg.text())) violations.push(msg.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`Refused to load ${e.blockedURI} (${e.violatedDirective}) ${e.sourceFile}:${e.lineNumber} ${e.sample}`));
  });

  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('heading', { name: 'Sign in to Glasshouse' })).toBeVisible();

  await signIn(page, 'admin@company.test', 'admin-password-1');
  await expect(page.getByText('Connected to the Glasshouse server')).toBeVisible();

  // Users screen, with the rename form open.
  await page.goto('/admin/users');
  await page.getByLabel('Email').fill('csp-person@company.test');
  await page.getByLabel('Name', { exact: true }).fill('Csp Person');
  await page.getByRole('button', { name: 'Add user' }).click();
  const temp = (await page.locator('.users__secret code').textContent())!.trim();
  await page.getByRole('button', { name: 'Rename Eddie Editor' }).click();
  await expect(page.getByRole('textbox', { name: 'New name for Eddie Editor' })).toBeVisible();

  // Import project file dialog, from a project file exported here.
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Csp import');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add site to Csp import' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site C');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site C' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('CSP-I');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('footprint')).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project file' }).click();
  const saved = testInfo.outputPath('csp-import.json');
  await (await downloading).saveAs(saved);
  await page.getByRole('button', { name: 'Import project file' }).click();
  await page.getByLabel('Choose a project file').setInputFiles(saved);
  await expect(page.getByRole('dialog', { name: /^Import/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // Change-password screen for a person with a temporary password.
  await signOut(page);
  await signIn(page, 'csp-person@company.test', temp);
  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();

  expect(violations).toEqual([]);
});
