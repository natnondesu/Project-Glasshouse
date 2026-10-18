import { expect, test } from '@playwright/test';

// Dev mode has no sign-in, so everyone is an admin and the server keeps no claims; roles and claims are in e2e-auth.
test('an archive is stored on the server, survives a reload, and shows up in another tab', async ({ browser, request }) => {
  const one = await (await browser.newContext()).newPage();
  const two = await (await browser.newContext()).newPage();
  await one.goto('/');
  await two.goto('/');
  await expect(one.getByText('Connected to the Glasshouse server')).toBeVisible();
  const commands = [
    { type: 'project/create', id: 'arc-p', name: 'Archive server e2e' },
    { type: 'site/create', projectId: 'arc-p', id: 'arc-s', name: 'Archive site' },
    { type: 'room/create', siteId: 'arc-s', id: 'arc-r', floorAreaId: 'arc-fa', name: 'Archive room' },
  ].map((command, i) => ({ commandId: `arc-setup-${i}`, command }));
  expect(await (await request.post('/api/commands', { data: { clientId: 'arc-setup', commands } })).json()).toMatchObject({ rejected: null });

  const tree = one.getByRole('complementary', { name: 'Projects' });
  await tree.getByRole('button', { name: 'Archive Archive room' }).click();
  await one.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  await expect(tree.getByRole('link', { name: /^Archive room/ })).toHaveCount(0);

  // The other tab hears about it live.
  await expect(two.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /^Archive room/ })).toHaveCount(0);
  await expect.poll(async () => {
    const ws = await (await request.get('/api/workspace')).json();
    const project = ws.workspace.projects.find((p: { id: string }) => p.id === 'arc-p');
    return project?.sites[0]?.rooms[0]?.archivedAt ?? null;
  }).not.toBeNull();

  // An edit sent straight to the server is refused with the reason.
  const refused = await (await request.post('/api/commands', { data: { clientId: 'arc-edit', commands: [{ commandId: 'arc-edit-1', command: { type: 'room/rename', roomId: 'arc-r', name: 'Nope' } }] } })).json();
  expect(refused.rejected).toMatchObject({ error: { code: 'archived', message: 'Room Archive room is archived. Restore it to make changes.' } });

  await one.reload();
  const reloaded = one.getByRole('complementary', { name: 'Projects' });
  await expect(reloaded.getByRole('link', { name: /^Archive room/ })).toHaveCount(0);
  await reloaded.getByRole('checkbox', { name: /Show archived/ }).check();
  await reloaded.getByRole('link', { name: /^Archive room/ }).click();
  await expect(one.getByRole('status').filter({ hasText: /^Archived .*Read-only\./ })).toBeVisible();
  await one.getByRole('status').getByRole('button', { name: 'Restore' }).click();
  await expect(one.getByLabel('Width')).toBeEnabled();
  await expect(two.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /^Archive room/ })).toBeVisible();

  // One server serves every spec: leave nothing behind for the ones that count rooms on the home screen.
  const cleanup = await (await request.post('/api/commands', { data: { clientId: 'arc-cleanup', commands: [{ commandId: 'arc-cleanup-1', command: { type: 'project/delete', projectId: 'arc-p' } }] } })).json();
  expect(cleanup.rejected).toBeNull();
});
