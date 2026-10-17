import { expect, test, type Browser } from '@playwright/test';
import { signIn } from './helpers';

const LONG_WAIT_MS = 30_000;

async function arrangeLostCopy(browser: Browser, tag: string) {
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
    { type: 'project/create', id: `p-${tag}`, name: `Claims e2e ${tag}` },
    { type: 'site/create', projectId: `p-${tag}`, id: `s-${tag}`, name: 'Site' },
    { type: 'room/create', siteId: `s-${tag}`, id: `r-${tag}`, floorAreaId: `fa-${tag}`, name: `MDF-${tag}` },
  ].map((command, i) => ({ commandId: `claims-setup-${tag}-${i}`, command }));
  const setup = await ada.request.post('/api/commands', { headers: { 'x-glasshouse': '1' }, data: { clientId: `e2e-claims-setup-${tag}`, commands } });
  expect(await setup.json()).toMatchObject({ rejected: null });

  await eddie.goto(`/rooms/r-${tag}/plan`);
  await ada.goto(`/rooms/r-${tag}/plan`);
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
  // The dialog's name follows its heading, which changes in the discard warning; the element is the stable handle.
  const dialog = eddie.locator('dialog.claim-lost');
  await expect(dialog).toBeVisible({ timeout: LONG_WAIT_MS });
  await expect(dialog).toContainText(/took over/);
  return { eddie, eddieCtx, adaCtx, dialog };
}

test('Dismiss warns inside the dialog before the only copy goes; Keep it comes back, Discard closes', async ({ browser }) => {
  const { eddie, eddieCtx, adaCtx, dialog } = await arrangeLostCopy(browser, 'discard');
  await dialog.getByRole('button', { name: 'Dismiss' }).click();
  await expect(dialog.getByRole('heading', { name: 'Discard your version?' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download my version' })).toBeHidden();
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(dialog.getByRole('button', { name: 'Download my version' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Dismiss' }).click();
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await expect(dialog).toBeHidden();
  await expect(eddie.getByRole('region', { name: /Ada Admin is editing this room/ })).toBeVisible();

  await eddieCtx.close();
  await adaCtx.close();
});

test('one editor per room: the other sees who, takes over, and the first keeps their work', async ({ browser }) => {
  const { eddie, eddieCtx, adaCtx, dialog } = await arrangeLostCopy(browser, 'claims');
  const download = eddie.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download my version' }).click();
  expect((await download).suggestedFilename()).toMatch(/my version\.json$/);
  // The file is saved, so Dismiss closes without the discard warning.
  await dialog.getByRole('button', { name: 'Dismiss' }).click();
  await expect(dialog).toBeHidden();
  await expect(eddie.getByRole('region', { name: /Ada Admin is editing this room/ })).toBeVisible();
  await expect(eddie.getByLabel('Width')).toBeDisabled();

  await eddieCtx.close();
  await adaCtx.close();
});
