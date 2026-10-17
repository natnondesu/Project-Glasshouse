import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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
  await expect(tree.getByText('Migrated')).toHaveCount(0);

  await page.getByLabel('Choose a project file').setInputFiles(saved);
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();

  await expect(tree.getByText('Migrated')).toBeVisible();
  await expect.poll(async () => (await serverProjects(request)).some((p) => p.name === 'Migrated')).toBe(true);
});
