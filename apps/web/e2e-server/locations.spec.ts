import { expect, test } from '@playwright/test';

// A site's location is an ordinary command: placed in one tab, it reaches the server and every other tab live.
test('a site placed in one tab shows on the other tab’s globe, and the server keeps it', async ({ browser, request }) => {
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ids = { project: `loc-p-${run}`, site: `loc-s-${run}` };
  const site = `Depot ${run}`;
  const post = async (clientId: string, commands: { type: string; [key: string]: unknown }[]) =>
    (await request.post('/api/commands', { data: { clientId, commands: commands.map((command, i) => ({ commandId: `${clientId}-${i}`, command })) } })).json();

  try {
    expect(
      await post(`loc-setup-${run}`, [
        { type: 'project/create', id: ids.project, name: `Locations ${run}` },
        { type: 'site/create', projectId: ids.project, id: ids.site, name: site },
      ]),
    ).toMatchObject({ rejected: null });
    const one = await (await browser.newContext()).newPage();
    const two = await (await browser.newContext()).newPage();
    await one.goto('/');
    await two.goto('/');
    await two.getByRole('button', { name: /^Not placed yet/ }).click();
    await expect(two.getByRole('region', { name: /Not placed yet/ }).getByRole('button', { name: new RegExp(site) }).first()).toBeVisible();
    // The map's outlines load from the server itself, under its content security policy.
    await expect(two.getByRole('application', { name: /^Map\./ })).toBeVisible();

    await one.getByRole('complementary', { name: 'Projects' }).getByRole('button', { name: `Location of ${site}` }).click();
    const dialog = one.getByRole('dialog', { name: `Where is ${site}?` });
    await dialog.getByRole('textbox').fill('-33.8688, 151.2093');
    await dialog.getByRole('button', { name: 'Save location' }).click();

    // The tab that saved it picks the site and brings it into view (Sydney, far from the opening frame).
    await expect(one.locator('#home-site-name')).toHaveText(site);
    await expect(one.getByRole('button', { name: new RegExp(`^${site}, `) })).toHaveAttribute('aria-pressed', 'true');
    // The other tab sees it leave its list (other specs share this server, so only this site's entry is checked).
    await expect(two.getByRole('region', { name: /Not placed yet/ }).getByRole('button', { name: new RegExp(site) })).toHaveCount(0);
    await expect
      .poll(async () => {
        const ws = await (await request.get('/api/workspace')).json();
        return ws.workspace.projects.find((p: { id: string }) => p.id === ids.project)?.sites[0]?.location;
      })
      .toEqual({ lat: -33.8688, lon: 151.2093 });
  } finally {
    // One server serves every spec: leave nothing behind for the ones that count what is on the home screen.
    await post(`loc-cleanup-${run}`, [{ type: 'project/delete', projectId: ids.project }]);
  }
});
