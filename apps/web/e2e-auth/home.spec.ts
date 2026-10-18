import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Home's "Pick up where you left off" names who changed the room last, from the server's log.
test('the pick-up strip says who edited the last room and when', async ({ browser }) => {
  const tag = Date.now().toString(36);
  const adaCtx = await browser.newContext();
  const eddieCtx = await browser.newContext();
  const ada = await adaCtx.newPage();
  const eddie = await eddieCtx.newPage();
  await signIn(ada, 'admin@company.test', 'admin-password-1');
  await signIn(eddie, 'ed@company.test', 'editor-password-1');
  // Sign-in finishes when the workspace is connected; only then may the pages move on.
  await expect(ada.getByText('Connected to the Glasshouse server')).toBeVisible();
  await expect(eddie.getByText('Connected to the Glasshouse server')).toBeVisible();
  const commands = [
    { type: 'project/create', id: `p-${tag}`, name: `Home e2e ${tag}` },
    { type: 'site/create', projectId: `p-${tag}`, id: `s-${tag}`, name: `Site ${tag}` },
    { type: 'room/create', siteId: `s-${tag}`, id: `r-${tag}`, floorAreaId: `fa-${tag}`, name: `IDF-${tag}` },
  ].map((command, i) => ({ commandId: `home-setup-${tag}-${i}`, command }));
  const setup = await ada.request.post('/api/commands', { headers: { 'x-glasshouse': '1' }, data: { clientId: `e2e-home-${tag}`, commands } });
  expect(await setup.json()).toMatchObject({ rejected: null });

  // Ada opens the room (it becomes her last one); then Eddie changes it.
  await ada.goto(`/rooms/r-${tag}/plan`);
  await expect(ada.getByLabel('Width')).toBeVisible();
  await eddie.goto(`/rooms/r-${tag}/plan`);
  await expect(eddie.getByLabel('Width')).toBeEnabled();
  await eddie.getByLabel('Width').fill('7');
  await eddie.getByLabel('Width').blur();
  await expect(eddie.getByRole('region', { name: /You're editing this room/ })).toBeVisible();

  await ada.getByRole('link', { name: 'Glasshouse' }).first().click();
  const strip = ada.getByRole('region', { name: 'Pick up where you left off' });
  await expect(strip).toContainText(`IDF-${tag} · Site ${tag}`);
  await expect(strip).toContainText(/edited by Eddie Editor (just now|1 minute ago)/);
  await strip.getByRole('link', { name: `Continue to IDF-${tag}` }).click();
  await expect(ada).toHaveURL(new RegExp(`/rooms/r-${tag}/plan`));
  await adaCtx.close();
  await eddieCtx.close();
});
