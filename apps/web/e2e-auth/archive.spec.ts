import { expect, test, type Browser } from '@playwright/test';
import { signIn } from './helpers';

const LONG_WAIT_MS = 30_000;

async function twoPeople(browser: Browser, tag: string) {
  const adaCtx = await browser.newContext();
  const eddieCtx = await browser.newContext();
  const ada = await adaCtx.newPage();
  const eddie = await eddieCtx.newPage();
  await signIn(ada, 'admin@company.test', 'admin-password-1');
  await signIn(eddie, 'ed@company.test', 'editor-password-1');
  await expect(ada.getByText('Connected to the Glasshouse server')).toBeVisible();
  await expect(eddie.getByText('Connected to the Glasshouse server')).toBeVisible();
  const commands = [
    { type: 'project/create', id: `ap-${tag}`, name: `Archive e2e ${tag}` },
    { type: 'site/create', projectId: `ap-${tag}`, id: `as-${tag}`, name: `Quay ${tag}` },
    { type: 'room/create', siteId: `as-${tag}`, id: `ar-${tag}`, floorAreaId: `afa-${tag}`, name: `Room ${tag}` },
  ].map((command, i) => ({ commandId: `archive-setup-${tag}-${i}`, command }));
  const setup = await ada.request.post('/api/commands', { headers: { 'x-glasshouse': '1' }, data: { clientId: `e2e-archive-setup-${tag}`, commands } });
  expect(await setup.json()).toMatchObject({ rejected: null });
  return { ada, eddie };
}

const projects = (page: import('@playwright/test').Page) => page.getByRole('complementary', { name: 'Projects' });

test('only an admin sees the archive actions; an editor reads the archived room but cannot restore it', async ({ browser }) => {
  const { ada, eddie } = await twoPeople(browser, 'roles');
  await expect(projects(eddie).getByRole('link', { name: /^Room roles/ })).toBeVisible();
  await expect(projects(eddie).getByRole('button', { name: 'Archive Room roles' })).toHaveCount(0);
  await expect(projects(ada).getByRole('button', { name: 'Archive Room roles' })).toBeVisible();

  await projects(ada).getByRole('button', { name: 'Archive Room roles' }).click();
  await ada.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  await expect(projects(ada).getByRole('link', { name: /^Room roles/ })).toHaveCount(0);
  // Eddie's tree follows without a reload.
  await expect(projects(eddie).getByRole('link', { name: /^Room roles/ })).toHaveCount(0, { timeout: LONG_WAIT_MS });

  await projects(eddie).getByRole('checkbox', { name: /Show archived/ }).check();
  await expect(projects(eddie).getByRole('link', { name: /^Room roles/ })).toBeVisible();
  await expect(projects(eddie).getByRole('button', { name: /Restore Room roles/ })).toHaveCount(0);
  await projects(eddie).getByRole('link', { name: /^Room roles/ }).click();
  await expect(eddie.getByRole('status').filter({ hasText: /^Archived by Ada Admin on / })).toBeVisible();
  await expect(eddie.getByRole('status').getByRole('button', { name: 'Restore' })).toHaveCount(0);
  await expect(eddie.getByLabel('Width')).toBeDisabled();

  // Admin restores from the tree; Eddie can edit again.
  await projects(ada).getByRole('checkbox', { name: /Show archived/ }).check();
  await projects(ada).getByRole('button', { name: 'Restore Room roles' }).click();
  await expect(eddie.getByRole('status').filter({ hasText: /^Archived / })).toHaveCount(0, { timeout: LONG_WAIT_MS });
  await expect(eddie.getByLabel('Width')).toBeEnabled();
});

test('an editor cannot archive by sending the command, and the refusal says why', async ({ browser }) => {
  const { eddie } = await twoPeople(browser, 'forbid');
  const res = await eddie.request.post('/api/commands', {
    headers: { 'x-glasshouse': '1' },
    data: { clientId: 'e2e-archive-forbid', commands: [{ commandId: 'forbid-1', command: { type: 'room/archive', roomId: 'ar-forbid', by: 'Eddie', at: 'now' } }] },
  });
  expect((await res.json()).rejected).toMatchObject({ error: { code: 'forbidden', message: expect.stringContaining("Editors can't make this change") } });
});

test('archiving waits for the person editing the room, and says who', async ({ browser }) => {
  const { ada, eddie } = await twoPeople(browser, 'claim');
  await eddie.goto('/rooms/ar-claim/plan');
  await eddie.getByLabel('Width').fill('7');
  await eddie.getByLabel('Width').blur();
  await expect(eddie.getByRole('region', { name: /You're editing this room/ })).toBeVisible();
  await expect(projects(ada).getByRole('link', { name: /^Room claim/ })).toBeVisible();
  await ada.goto('/rooms/ar-claim/plan');
  await expect(ada.getByRole('region', { name: /Eddie Editor is editing this room/ })).toBeVisible({ timeout: LONG_WAIT_MS });

  await projects(ada).getByRole('button', { name: 'Archive Room claim' }).click();
  await ada.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  await expect(projects(ada).getByRole('alert')).toHaveText("Eddie Editor is editing Room claim. Try again when they're done.");
  await expect(projects(ada).getByRole('link', { name: /^Room claim/ })).toBeVisible();

  await eddie.getByRole('button', { name: 'Done editing' }).click();
  await expect(ada.getByRole('region', { name: /Eddie Editor is editing/ })).toHaveCount(0, { timeout: LONG_WAIT_MS });
  await projects(ada).getByRole('button', { name: 'Archive Room claim' }).click();
  await ada.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  await expect(ada.getByRole('status').filter({ hasText: /^Archived by Ada Admin/ })).toBeVisible();
});
