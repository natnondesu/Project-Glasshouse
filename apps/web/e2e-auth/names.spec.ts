import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const HEADERS = { 'x-glasshouse': '1' };
const RESPONSE_WAIT_MS = 10_000;

async function setRole(admin: Page, email: string, role: 'viewer' | 'editor'): Promise<void> {
  const users = (await (await admin.request.get('/api/admin/users')).json()) as { id: string; email: string }[];
  const id = users.find((u) => u.email === email)!.id;
  const res = await admin.request.patch(`/api/admin/users/${id}`, { headers: HEADERS, data: { role } });
  expect(res.ok()).toBe(true);
}

test('an admin renames a person and the Users screen shows the new name', async ({ page }) => {
  await signIn(page, 'admin@company.test', 'admin-password-1');
  await expect(page.getByText('Connected to the Glasshouse server')).toBeVisible();
  await page.goto('/admin/users');
  const row = page.getByRole('row', { name: /Eddie Editor/ });
  await row.getByRole('button', { name: 'Rename Eddie Editor' }).click();
  await page.getByRole('textbox', { name: 'New name for Eddie Editor' }).fill('Eddie Editorson');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row', { name: /Eddie Editorson/ })).toBeVisible();
  // Put it back, so other specs that look for his name still find it.
  await page.getByRole('button', { name: 'Rename Eddie Editorson' }).click();
  await page.getByRole('textbox', { name: 'New name for Eddie Editorson' }).fill('Eddie Editor');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Rename Eddie Editor', exact: true })).toBeVisible();
});

test('an admin can download a workspace backup', async ({ page }) => {
  await signIn(page, 'admin@company.test', 'admin-password-1');
  await page.getByRole('button', { name: 'Account menu for Ada Admin' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download workspace backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/^glasshouse-backup.*\.json$/);
});

test('a viewer gets no New room card', async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, 'admin@company.test', 'admin-password-1');
  await expect(admin.getByText('Connected to the Glasshouse server')).toBeVisible();
  const setup = await admin.request.post('/api/commands', {
    headers: HEADERS,
    data: {
      clientId: 'e2e-names-setup',
      commands: [
        { type: 'project/create', id: 'p-names', name: 'Names e2e' },
        { type: 'site/create', projectId: 'p-names', id: 's-names', name: 'Names site' },
        { type: 'room/create', siteId: 's-names', id: 'r-names', floorAreaId: 'fa-names', name: 'MDF-NAMES' },
      ].map((command, i) => ({ commandId: `names-setup-${i}`, command })),
    },
  });
  expect(await setup.json()).toMatchObject({ rejected: null });
  await admin.goto('/');
  await expect(admin.getByRole('button', { name: /^New room in Names site/ })).toBeVisible();

  const viewerCtx = await browser.newContext();
  const viewer = await viewerCtx.newPage();
  await viewer.goto('/');
  await viewer.getByRole('link', { name: 'Continue with company account' }).click();
  await expect(viewer.getByText('You can view this workspace. Ask an admin for edit access.')).toBeVisible();
  await expect(viewer.getByRole('region', { name: /Names site/ })).toBeVisible();
  await expect(viewer.getByRole('button', { name: /^New room in/ })).toHaveCount(0);
  await viewerCtx.close();
  await adminCtx.close();
});

test('an editor whose role was lowered finds out on their next refused edit, without signing in again', async ({ browser }) => {
  // Two password sign-ins (scrypt is slow on purpose) plus the refusal and re-check: under a full test run this outgrows 30 s.
  // Each step below has its own wait, so a real stall still names the step that never happened.
  test.slow();
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signIn(admin, 'admin@company.test', 'admin-password-1');
  const editorCtx = await browser.newContext();
  const editor = await editorCtx.newPage();
  await signIn(editor, 'ed@company.test', 'editor-password-1');
  await expect(editor.getByText('Connected to the Glasshouse server')).toBeVisible();

  await setRole(admin, 'ed@company.test', 'viewer');
  try {
    // Each step of the chain is awaited on its own, so a failure names the step that never happened.
    const refused = editor.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/commands', { timeout: RESPONSE_WAIT_MS });
    const recheck = editor.waitForResponse((r) => new URL(r.url()).pathname === '/auth/me', { timeout: RESPONSE_WAIT_MS });
    // The click alone is the refused edit: it sends project/create at once. Don't type into the name box afterwards, the
    // refusal rolls the new project back and the box with it, so on a busy machine the box is already gone and a fill waits forever.
    await editor.getByRole('button', { name: 'New project' }).click();
    const outcome = (await (await refused).json()) as { rejected?: { error: { code: string } } };
    expect(outcome.rejected?.error.code).toBe('forbidden');
    expect((await recheck).status()).toBe(200);
    await expect(editor.getByText('You can view this workspace. Ask an admin for edit access.')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'New project' })).toHaveCount(0);
  } finally {
    await setRole(admin, 'ed@company.test', 'editor');
  }
  await editorCtx.close();
  await adminCtx.close();
});
