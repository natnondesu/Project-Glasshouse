import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { showProjects } from '../e2e/nav';

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill(name);
  await page.keyboard.press('Enter');
}

async function serverProjects(request: APIRequestContext): Promise<{ id: string; name: string }[]> {
  const ws = await (await request.get('/api/workspace')).json();
  return ws.workspace.projects;
}

// The tab shows an edit before the server has stored it; wait until the server knows the project.
async function projectIdOnServer(request: APIRequestContext, name: string): Promise<string> {
  let id = '';
  await expect
    .poll(async () => {
      id = (await serverProjects(request)).find((p) => p.name === name)?.id ?? '';
      return id;
    })
    .not.toBe('');
  return id;
}

async function serverRooms(request: APIRequestContext, projectName: string): Promise<{ site: string; name: string; width: number; areaW: number }[]> {
  const ws = await (await request.get('/api/workspace')).json();
  const project = ws.workspace.projects.find((p: { name: string }) => p.name === projectName);
  return (project?.sites ?? []).flatMap((s: { name: string; rooms: { name: string; plan: { revisions: { content: { survey: { width: number; floorAreas: { w: number }[] } } }[] } }[] }) =>
    s.rooms.map((r) => ({ site: s.name, name: r.name, width: r.plan.revisions[r.plan.revisions.length - 1]!.content.survey.width, areaW: r.plan.revisions[r.plan.revisions.length - 1]!.content.survey.floorAreas[0]!.w })),
  );
}

async function areaWidthOnServer(request: APIRequestContext, projectName: string): Promise<number | undefined> {
  return (await serverRooms(request, projectName))[0]?.areaW;
}

test('two people edit the same workspace and see each other live; a reload keeps everything', async ({ browser }) => {
  const ploy = await (await browser.newContext()).newPage();
  const nok = await (await browser.newContext()).newPage();
  await ploy.goto('/');
  await nok.goto('/');
  await expect(ploy.getByText('Connected to the Glasshouse server')).toBeVisible();

  await createProject(ploy, 'Riverside');
  const nokTree = nok.getByRole('complementary', { name: 'Projects' });
  await expect(nokTree.getByText('Riverside')).toBeVisible();

  await createProject(nok, 'Northgate');
  await expect(ploy.getByRole('complementary', { name: 'Projects' }).getByText('Northgate')).toBeVisible();
  await expect(ploy.getByText(/Saved to the server/)).toBeVisible();

  await ploy.reload();
  const tree = ploy.getByRole('complementary', { name: 'Projects' });
  await expect(tree.getByText('Riverside')).toBeVisible();
  await expect(tree.getByText('Northgate')).toBeVisible();
});

test('a deletion made elsewhere disappears here without a reload', async ({ page, request }) => {
  await page.goto('/');
  await createProject(page, 'Bangna');
  // Someone else deletes the project directly through the API while this tab still shows it.
  const bangnaId = await projectIdOnServer(request, 'Bangna');
  await request.post('/api/commands', { data: { clientId: 'other', commands: [{ commandId: 'del', command: { type: 'project/delete', projectId: bangnaId } }] } });
  await expect(page.getByRole('complementary', { name: 'Projects' }).getByText('Bangna')).toHaveCount(0);
});

test('a project file exported from one place imports into the server and is stored there', async ({ page, request }, testInfo) => {
  await page.goto('/');
  const tree = page.getByRole('complementary', { name: 'Projects' });
  await createProject(page, 'Migrated');
  await page.getByRole('button', { name: 'Add site to Migrated' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site A');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site A' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('MDF-1');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('footprint')).toBeVisible();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project file' }).click();
  const saved = testInfo.outputPath('migrated.json');
  await (await downloading).saveAs(saved);

  const migratedId = await projectIdOnServer(request, 'Migrated');
  await request.post('/api/commands', { data: { clientId: 'other', commands: [{ commandId: 'del-migrated', command: { type: 'project/delete', projectId: migratedId } }] } });
  // Still on the room's page, now a not-found page: the tree docks there, with its import.
  await expect(tree.getByText('Migrated')).toHaveCount(0);

  await page.getByLabel('Choose a project file').setInputFiles(saved);
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();

  // The room is back, so its page is a room again and the tree a drawer.
  await expect((await showProjects(page)).getByText('Migrated')).toBeVisible();
  await expect.poll(async () => (await serverProjects(request)).some((p) => p.name === 'Migrated')).toBe(true);
  // The import carried the site and the room with it.
  await expect.poll(async () => (await serverRooms(request, 'Migrated')).map((r) => `${r.site}/${r.name}`)).toEqual(['Site A/MDF-1']);
});

test('floor edits and undo work in a room created this session, and survive a reload', async ({ page, request }) => {
  await page.goto('/');
  await createProject(page, 'Undo test');
  await page.getByRole('button', { name: 'Add site to Undo test' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site U');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site U' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('Room U');
  await page.keyboard.press('Enter');
  const area = page.getByRole('textbox', { name: 'W', exact: true });
  await expect(area).toHaveValue(/^5(\.00)?$/);
  const notice = page.getByText("A change didn't go through");

  // The room's floor area was made in this session: edits by its ID must reach the same area on the server.
  await area.fill('3');
  await area.press('Enter');
  await expect.poll(async () => await areaWidthOnServer(request, 'Undo test')).toBe(3);

  // Undo is a keyboard shortcut on the page, not inside the field.
  await page.getByRole('main').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(area).toHaveValue(/^5(\.00)?$/);
  await expect.poll(async () => await areaWidthOnServer(request, 'Undo test')).toBe(5);
  await expect(notice).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'W', exact: true })).toHaveValue(/^5(\.00)?$/);
  await expect(notice).toHaveCount(0);
});
