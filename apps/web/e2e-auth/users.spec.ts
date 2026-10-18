import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { signIn } from './helpers';

// Set SHOTS_DIR to keep screenshots of each step (the screens are checked by eye, not diffed).
const SHOTS = process.env.SHOTS_DIR;
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const API = { 'x-glasshouse': '1' };

/** An approvable room, built through the API as the signed-in page's user. */
async function buildRoom(page: Page, tag: string): Promise<void> {
  const template = ((await (await page.request.get('/api/workspace')).json()) as { workspace: { catalog: { id: string }[] } }).workspace.catalog.find((t) => t.id === 'tpl-server-2u');
  const rack = { type: 'rack', id: `rk-${tag}`, name: 'RK-01', x: 1, y: 0.6, w: 0.8, d: 1.1, angle: 0, height: null, notes: '', capacityU: 42, usableDepthMm: 1000, owner: 'oxygenai', clearance: { front: 1, rear: 0.6 }, devices: [], reserved: [] };
  const commands = [
    { type: 'project/create', id: `p-${tag}`, name: `Users e2e ${tag}` },
    { type: 'site/create', projectId: `p-${tag}`, id: `s-${tag}`, name: 'Site' },
    { type: 'room/create', siteId: `s-${tag}`, id: `r-${tag}`, floorAreaId: `fa-${tag}`, name: `MDF-${tag}` },
    { type: 'plan', roomId: `r-${tag}`, command: { type: 'object/add', object: rack } },
    { type: 'plan', roomId: `r-${tag}`, command: { type: 'device/place', id: `srv-${tag}`, rackId: `rk-${tag}`, bottomU: 1, template } },
  ].map((command, i) => ({ commandId: `users-setup-${tag}-${i}`, command }));
  const res = await page.request.post('/api/commands', { headers: API, data: { clientId: `e2e-users-${tag}`, commands } });
  expect(await res.json()).toMatchObject({ rejected: null });
}

test('switch off hides someone, delete removes them, and what they approved still shows their name, marked removed', async ({ browser }) => {
  const adaCtx = await browser.newContext();
  const rowanCtx = await browser.newContext();
  const ada = await adaCtx.newPage();
  const rowan = await rowanCtx.newPage();
  await signIn(ada, 'admin@company.test', 'admin-password-1');
  await expect(ada.getByText('Connected to the Glasshouse server')).toBeVisible();

  // Rowan is a reviewer with a password of their own.
  const created = await ada.request.post('/api/admin/users', { headers: API, data: { email: 'rowan@company.test', displayName: 'Rowan Reviewer', role: 'reviewer' } });
  expect(created.status()).toBe(201);
  const temp = ((await created.json()) as { temporaryPassword: string }).temporaryPassword;
  await signIn(rowan, 'rowan@company.test', temp);
  await rowan.getByLabel('Temporary password').fill(temp);
  await rowan.getByLabel('New password', { exact: true }).fill('rowan-password-1');
  await rowan.getByLabel('New password again').fill('rowan-password-1');
  await rowan.getByRole('button', { name: 'Change password' }).click();
  await expect(rowan.getByText('Connected to the Glasshouse server')).toBeVisible();

  // Ada submits a room; Rowan approves it.
  await buildRoom(ada, 'users');
  await ada.goto('/rooms/r-users/review');
  await ada.getByRole('button', { name: 'Submit for review' }).click();
  await ada.getByRole('button', { name: 'Confirm submit' }).click();
  await rowan.goto('/rooms/r-users/review');
  await rowan.getByRole('button', { name: 'Approve revision' }).click();
  await rowan.getByRole('button', { name: 'Confirm approval' }).click();
  await ada.reload();
  const stamp = ada.getByRole('status').filter({ hasText: 'APPROVED' });
  await expect(stamp).toContainText('by Rowan Reviewer (rowan@company.test)');
  const fingerprintBefore = await ada.getByText(/^Fingerprint /).first().textContent();
  await shot(ada, 'history-before-removal');

  // Switch off: asks first, then Rowan disappears from the list behind a counted toggle.
  await ada.goto('/admin/users');
  const rowanRow = ada.getByRole('row', { name: 'Rowan Reviewer' });
  await expect(rowanRow.getByText('Active', { exact: true })).toBeVisible();
  await shot(ada, 'users-default');
  await rowanRow.getByRole('button', { name: 'Switch off Rowan Reviewer' }).click();
  await expect(ada.getByRole('alertdialog')).toContainText("They're signed out now and can't sign in until you switch them back on.");
  await shot(ada, 'confirm-switch-off');
  await ada.getByRole('alertdialog').getByRole('button', { name: 'Switch off' }).click();
  await expect(rowanRow).toHaveCount(0);
  const toggle = ada.getByRole('checkbox', { name: 'Show switched off (1)' });
  await expect(toggle).not.toBeChecked();

  // Rowan is signed out now and cannot come back.
  await rowan.reload();
  await expect(rowan.getByRole('heading', { name: 'Sign in to Glasshouse' })).toBeVisible();
  await rowan.getByLabel('Work email').fill('rowan@company.test');
  await rowan.getByLabel('Password', { exact: true }).fill('rowan-password-1');
  await rowan.getByRole('button', { name: 'Sign in' }).click();
  await expect(rowan.getByRole('alert')).toBeVisible();

  // The choice survives a reload; Delete account is only on the switched-off row.
  await toggle.check();
  await ada.reload();
  await expect(ada.getByRole('checkbox', { name: 'Show switched off (1)' })).toBeChecked();
  await expect(rowanRow.getByText('Switched off', { exact: true })).toBeVisible();
  await expect(ada.getByRole('row', { name: 'Ada Admin' }).getByRole('button', { name: /Switch off|Delete/ })).toHaveCount(0);
  await shot(ada, 'users-show-switched-off');
  await rowanRow.getByRole('button', { name: 'Delete Rowan Reviewer’s account' }).click();
  await expect(ada.getByRole('alertdialog')).toContainText('Delete Rowan Reviewer’s account (rowan@company.test)?');
  await expect(ada.getByRole('alertdialog')).toContainText("Their name stays on past work, marked removed. This can't be undone.");
  await shot(ada, 'confirm-delete');
  await ada.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click();
  await expect(rowanRow).toHaveCount(0);
  await expect(ada.getByRole('status')).toContainText('Rowan Reviewer’s account was deleted.');

  // What Rowan approved still reads as Rowan's work, with the same fingerprint.
  await ada.goto('/rooms/r-users/review');
  await expect(ada.getByRole('status').filter({ hasText: 'APPROVED' })).toContainText('by Rowan Reviewer (removed)');
  await expect(ada.getByRole('region', { name: 'Revisions and history' })).toContainText('Approved by Rowan Reviewer (removed)');
  await expect(ada.getByRole('region', { name: 'Revisions and history' })).not.toContainText(/undefined/);
  expect(await ada.getByText(/^Fingerprint /).first().textContent()).toBe(fingerprintBefore);
  await shot(ada, 'history-removed-name');

  // The email is free: a returning Rowan gets a fresh account, and the old work stays under the old name.
  const again = await ada.request.post('/api/admin/users', { headers: API, data: { email: 'rowan@company.test', displayName: 'Rowan Reviewer', role: 'viewer' } });
  expect(again.status()).toBe(201);
  await ada.reload();
  await expect(ada.getByRole('status').filter({ hasText: 'APPROVED' })).toContainText('by Rowan Reviewer (removed)');
  const people = (await (await ada.request.get('/api/people')).json()) as { people: { email: string }[] };
  expect(people.people.filter((p) => p.email === 'rowan@company.test')).toHaveLength(1);

  await adaCtx.close();
  await rowanCtx.close();
});

test('the Users list reads in Thai, and the server refuses to delete someone who is still switched on', async ({ browser }) => {
  const ctx = await browser.newContext();
  const ada = await ctx.newPage();
  await signIn(ada, 'admin@company.test', 'admin-password-1');
  await expect(ada.getByRole('button', { name: /^Account menu for / })).toBeVisible();
  const list = (await (await ada.request.get('/api/admin/users')).json()) as { id: string; email: string }[];
  const eddie = list.find((u) => u.email === 'ed@company.test')!;
  const refused = await ada.request.delete(`/api/admin/users/${eddie.id}`, { headers: API });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toMatchObject({ error: { message: 'Switch Eddie Editor off before deleting the account.' } });
  await ada.evaluate(() => localStorage.setItem('glasshouse:lang', 'th'));
  await ada.goto('/admin/users');
  await expect(ada.getByRole('row', { name: 'Eddie Editor' }).getByText('ใช้งานอยู่')).toBeVisible();
  await expect(ada.getByRole('row', { name: 'Eddie Editor' }).getByRole('button', { name: 'ปิดใช้งาน Eddie Editor' })).toBeVisible();
  await shot(ada, 'users-default-th');
  await ada.getByRole('row', { name: 'Eddie Editor' }).getByRole('button', { name: 'ปิดใช้งาน Eddie Editor' }).click();
  await ada.getByRole('alertdialog').getByRole('button', { name: 'ปิดใช้งาน' }).click();
  await expect(ada.getByRole('checkbox', { name: 'แสดงผู้ที่ปิดใช้งาน (1)' })).toBeVisible();
  await ada.getByRole('checkbox', { name: 'แสดงผู้ที่ปิดใช้งาน (1)' }).check();
  await shot(ada, 'users-show-switched-off-th');
  await ada.getByRole('row', { name: 'Eddie Editor' }).getByRole('button', { name: 'เปิดใช้งาน Eddie Editor' }).click();
  await expect(ada.getByRole('row', { name: 'Eddie Editor' }).getByText('ใช้งานอยู่')).toBeVisible();
  await ctx.close();
});
