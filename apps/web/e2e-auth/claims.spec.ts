import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const LONG_WAIT_MS = 30_000;

test('one editor per room: the other sees who, takes over, and the first keeps their work', async ({ browser }) => {
  const eddieCtx = await browser.newContext({ acceptDownloads: true });
  const adaCtx = await browser.newContext();
  const eddie = await eddieCtx.newPage();
  const ada = await adaCtx.newPage();
  await signIn(eddie, 'ed@company.test', 'editor-password-1');
  await signIn(ada, 'admin@company.test', 'admin-password-1');
  await expect(eddie.getByText('Connected to the Glasshouse server')).toBeVisible();
  await expect(ada.getByText('Connected to the Glasshouse server')).toBeVisible();

  // Ada creates the room through the API, as the review e2e does; both then open its plan.
  const commands = [
    { type: 'project/create', id: 'p-claims', name: 'Claims e2e' },
    { type: 'site/create', projectId: 'p-claims', id: 's-claims', name: 'Site' },
    { type: 'room/create', siteId: 's-claims', id: 'r-claims', floorAreaId: 'fa-claims', name: 'MDF-CLAIMS' },
  ].map((command, i) => ({ commandId: `claims-setup-${i}`, command }));
  const setup = await ada.request.post('/api/commands', { headers: { 'x-glasshouse': '1' }, data: { clientId: 'e2e-claims-setup', commands } });
  expect(await setup.json()).toMatchObject({ rejected: null });

  await eddie.goto('/rooms/r-claims/plan');
  await ada.goto('/rooms/r-claims/plan');
  await expect(eddie.getByLabel('Width')).toBeEnabled();

  // Eddie's first edit claims the room.
  await eddie.getByLabel('Width').fill('7');
  await eddie.getByLabel('Width').blur();
  await expect(eddie.getByRole('region', { name: /You're editing this room/ })).toBeVisible();
  await expect(ada.getByRole('region', { name: /Eddie Editor is editing this room/ })).toBeVisible();
  await expect(ada.getByLabel('Width')).toBeDisabled();

  // Eddie goes offline and queues another edit.
  await eddieCtx.setOffline(true);
  await eddie.getByLabel('Width').fill('8');
  await eddie.getByLabel('Width').blur();

  // Ada (admin) takes over.
  await ada.getByRole('button', { name: 'Take over' }).click();
  await ada.getByRole('alertdialog').getByRole('button', { name: 'Take over' }).click();
  await expect(ada.getByRole('region', { name: /You're editing this room/ })).toBeVisible();
  await expect(ada.getByLabel('Width')).toBeEnabled();

  // Eddie comes back: his queued edit is refused and he is offered his version.
  await eddieCtx.setOffline(false);
  const dialog = eddie.getByRole('dialog', { name: /is being edited by someone else/ });
  await expect(dialog).toBeVisible({ timeout: LONG_WAIT_MS });
  await expect(dialog).toContainText('Ada Admin took over');
  const download = eddie.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download my version' }).click();
  expect((await download).suggestedFilename()).toMatch(/my version\.json$/);
  await dialog.getByRole('button', { name: 'Dismiss' }).click();
  await expect(eddie.getByRole('region', { name: /Ada Admin is editing this room/ })).toBeVisible();
  await expect(eddie.getByLabel('Width')).toBeDisabled();

  await eddieCtx.close();
  await adaCtx.close();
});
