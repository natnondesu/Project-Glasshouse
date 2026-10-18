import { expect, test } from '@playwright/test';

// Dev mode has no sign-in, so everyone is an admin and the server keeps no claims; roles and claims are in e2e-auth.
test('an archive is stored on the server, survives a reload, and shows up in another tab', async ({ browser, request }) => {
  // Unique per run, so a retry never collides with what an earlier attempt left behind.
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ids = { project: `arc-p-${run}`, site: `arc-s-${run}`, room: `arc-r-${run}` };
  const names = { project: `Archive server ${run}`, room: `Archive room ${run}` };
  const post = async (clientId: string, commands: { type: string; [key: string]: unknown }[]) =>
    (await request.post('/api/commands', { data: { clientId, commands: commands.map((command, i) => ({ commandId: `${clientId}-${i}`, command })) } })).json();

  try {
    const one = await (await browser.newContext()).newPage();
    const two = await (await browser.newContext()).newPage();
    await one.goto('/');
    await two.goto('/');
    await expect(one.getByText('Connected to the Glasshouse server')).toBeVisible();
    expect(
      await post(`arc-setup-${run}`, [
        { type: 'project/create', id: ids.project, name: names.project },
        { type: 'site/create', projectId: ids.project, id: ids.site, name: 'Archive site' },
        { type: 'room/create', siteId: ids.site, id: ids.room, floorAreaId: `arc-fa-${run}`, name: names.room },
      ]),
    ).toMatchObject({ rejected: null });

    const room = new RegExp(`^${names.room}`);
    const tree = one.getByRole('complementary', { name: 'Projects' });
    await tree.getByRole('button', { name: `Archive ${names.room}` }).click();
    await one.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
    await expect(tree.getByRole('link', { name: room })).toHaveCount(0);

    // The other tab hears about it live.
    await expect(two.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: room })).toHaveCount(0);
    await expect
      .poll(async () => {
        const ws = await (await request.get('/api/workspace')).json();
        const project = ws.workspace.projects.find((p: { id: string }) => p.id === ids.project);
        return project?.sites[0]?.rooms[0]?.archivedAt ?? null;
      })
      .not.toBeNull();

    // An edit sent straight to the server is refused with the reason.
    const refused = await post(`arc-edit-${run}`, [{ type: 'room/rename', roomId: ids.room, name: 'Nope' }]);
    expect(refused.rejected).toMatchObject({ error: { code: 'archived', message: `Room ${names.room} is archived. Restore it to make changes.` } });

    await one.reload();
    const reloaded = one.getByRole('complementary', { name: 'Projects' });
    await expect(reloaded.getByRole('link', { name: room })).toHaveCount(0);
    await reloaded.getByRole('checkbox', { name: /Show archived/ }).check();
    await reloaded.getByRole('link', { name: room }).click();
    await expect(one.getByRole('status').filter({ hasText: /^Archived .*Read-only\./ })).toBeVisible();
    await one.getByRole('status').getByRole('button', { name: 'Restore' }).click();
    await expect(one.getByLabel('Width')).toBeEnabled();
    await expect(two.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: room })).toBeVisible();
  } finally {
    // One server serves every spec: leave nothing behind for the ones that count rooms on the home screen, even after a failure.
    // An archived project can't be deleted until it is restored, so restore first (a no-op refusal when it isn't archived).
    await post(`arc-cleanup-a-${run}`, [{ type: 'room/restore', roomId: ids.room }]);
    await post(`arc-cleanup-b-${run}`, [{ type: 'project/delete', projectId: ids.project }]);
  }
});
