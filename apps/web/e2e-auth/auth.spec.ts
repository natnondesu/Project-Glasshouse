import { expect, test } from '@playwright/test';
import { signIn, signOut } from './helpers';

test('the workspace is behind sign-in, and a wrong password is explained', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to Glasshouse' })).toBeVisible();
  expect((await page.request.get('/api/workspace')).status()).toBe(401);
  await signIn(page, 'ed@company.test', 'not-the-password');
  await expect(page.getByRole('alert')).toContainText('don’t match');
});

test('an editor signs in, edits, and signs out', async ({ page }) => {
  await signIn(page, 'ed@company.test', 'editor-password-1');
  await expect(page.getByText('Connected to the Glasshouse server')).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Editor project');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Projects' }).getByText('Editor project')).toBeVisible();
  await expect(page.getByText(/Saved to the server/)).toBeVisible();
  await signOut(page);
});

test('an admin adds a person, who must choose their own password', async ({ page }) => {
  await signIn(page, 'admin@company.test', 'admin-password-1');
  await expect(page.getByRole('button', { name: 'Account menu for Ada Admin' })).toBeVisible();
  await page.goto('/admin/users');
  await page.getByLabel('Email').fill('newbie@company.test');
  await page.getByLabel('Name', { exact: true }).fill('New Bie');
  await page.getByLabel('Role', { exact: true }).selectOption('editor');
  await page.getByRole('button', { name: 'Add user' }).click();
  const temp = (await page.locator('.users__secret code').textContent())!.trim();
  await signOut(page);
  await signIn(page, 'newbie@company.test', temp);
  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
  await page.getByLabel('Temporary password').fill(temp);
  await page.getByLabel('New password', { exact: true }).fill('newbie-password-1');
  await page.getByLabel('New password again').fill('newbie-password-1');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Connected to the Glasshouse server')).toBeVisible();
});

test('a company sign-in creates a viewer, who can look but not change', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with your company account' }).click();
  await expect(page.getByText('You can view this workspace. Ask an admin for edit access.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account menu for Ploy SSO' })).toBeVisible();
  const refused = await page.request.post('/api/commands', { headers: { 'x-glasshouse': '1' }, data: { clientId: 'x', commands: [{ commandId: 'v1', command: { type: 'project/create', id: 'pv', name: 'Nope' } }] } });
  expect(await refused.json()).toMatchObject({ rejected: { error: { code: 'forbidden' } } });
});

test('a reviewer who submitted can’t approve; another reviewer can, and names are verified', async ({ browser }) => {
  const rae = await (await browser.newContext()).newPage();
  await signIn(rae, 'rev@company.test', 'review-password-1');
  await expect(rae.getByText('Connected to the Glasshouse server')).toBeVisible();
  // An approvable room (the domain review test's ready() state), built through the API as Rae.
  const template = ((await (await rae.request.get('/api/workspace')).json()) as { workspace: { catalog: { id: string }[] } }).workspace.catalog.find((t) => t.id === 'tpl-server-2u');
  const rack = { type: 'rack', id: 'rk-e2e', name: 'RK-01', x: 1, y: 0.6, w: 0.8, d: 1.1, angle: 0, height: null, notes: '', capacityU: 42, usableDepthMm: 1000, owner: 'oxygenai', clearance: { front: 1, rear: 0.6 }, devices: [], reserved: [] };
  const commands = [
    { type: 'project/create', id: 'p-e2e', name: 'Review e2e' },
    { type: 'site/create', projectId: 'p-e2e', id: 's-e2e', name: 'Site' },
    { type: 'room/create', siteId: 's-e2e', id: 'r-e2e', floorAreaId: 'fa-e2e', name: 'MDF-E2E' },
    { type: 'plan', roomId: 'r-e2e', command: { type: 'object/add', object: rack } },
    { type: 'plan', roomId: 'r-e2e', command: { type: 'device/place', id: 'srv-e2e', rackId: 'rk-e2e', bottomU: 1, template } },
  ].map((command, i) => ({ commandId: `setup-${i}`, command }));
  const setup = await rae.request.post('/api/commands', { headers: { 'x-glasshouse': '1' }, data: { clientId: 'e2e-setup', commands } });
  expect(await setup.json()).toMatchObject({ rejected: null });
  await rae.goto('/rooms/r-e2e/review');
  await rae.getByRole('button', { name: 'Submit for review' }).click();
  await rae.getByRole('button', { name: 'Confirm submit' }).click();
  await expect(rae.getByText('You submitted this revision. Another reviewer has to approve it.')).toBeVisible();
  await expect(rae.getByRole('button', { name: 'Approve revision' })).toBeDisabled();

  const ada = await (await browser.newContext()).newPage();
  await signIn(ada, 'admin@company.test', 'admin-password-1');
  await expect(ada.getByRole('button', { name: 'Account menu for Ada Admin' })).toBeVisible();
  await ada.goto('/rooms/r-e2e/review');
  await ada.getByRole('button', { name: 'Approve revision' }).click();
  await ada.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(ada.getByText('by Ada Admin', { exact: true })).toBeVisible();
  await expect(ada.getByText('Rae Reviewer', { exact: true })).toBeVisible();
  await expect(ada.getByText(/\(unverified\)/)).toHaveCount(0);
});
