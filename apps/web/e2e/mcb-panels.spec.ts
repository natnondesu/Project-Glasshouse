import { expect, test, type Locator, type Page } from '@playwright/test';

async function openManager(page: Page, panel: string, room: RegExp): Promise<Locator> {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: room }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
  await page.getByRole('button', { name: new RegExp(`^${panel}, MCB panel`) }).focus();
  await page.getByRole('button', { name: 'Manage ways' }).click();
  const manager = page.getByRole('dialog', { name: `${panel} ways` });
  await expect(manager).toBeVisible();
  return manager;
}

const boxOf = async (manager: Locator, way: number) => (await manager.getByRole('button', { name: new RegExp(`^Way ${way},`) }).boundingBox())!;

test('a two-column panel puts way 2 at the top right, and Down left, then right moves it', async ({ page }) => {
  const manager = await openManager(page, 'MCB-01', /MDF-1/);
  await manager.getByLabel('Layout').selectOption('two_column');
  const one = await boxOf(manager, 1);
  const two = await boxOf(manager, 2);
  const three = await boxOf(manager, 3);
  expect(two.x).toBeGreaterThan(one.x + one.width - 1);
  expect(two.y).toBeCloseTo(one.y, 0);
  expect(three.x).toBeCloseTo(one.x, 0);
  expect(three.y).toBeGreaterThan(one.y);

  await manager.getByLabel('Numbering').selectOption('sequential');
  const movedTwo = await boxOf(manager, 2);
  const seven = await boxOf(manager, 7);
  expect(movedTwo.x).toBeCloseTo(one.x, 0);
  expect(movedTwo.y).toBeGreaterThan(one.y);
  // Twelve ways: six down the left, so way 7 starts the right-hand column.
  expect(seven.x).toBeGreaterThan(one.x + one.width - 1);
  expect(seven.y).toBeCloseTo(one.y, 0);
});

async function startDraft(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Projects' }).getByRole('link', { name: /Server room A/ }).click();
  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByRole('button', { name: 'Start new draft' }).click();
  await page.getByRole('link', { name: 'Plan' }).click();
  await expect(page.getByTestId('zoom-value')).not.toHaveText('100 px/m');
}

test('a panel not in use with a feed on it raises a blocking check and approval is refused', async ({ page }) => {
  await startDraft(page);
  await page.getByRole('button', { name: /^MCB-02, MCB panel/ }).focus();
  await page.getByRole('button', { name: 'Manage ways' }).click();
  const manager = page.getByRole('dialog', { name: 'MCB-02 ways' });
  await manager.getByRole('switch', { name: 'In use' }).click();
  await expect(manager.getByRole('status')).toContainText('feeds are still wired to this panel');
  await expect(page.locator('.obj--off')).toHaveCount(1);
  const message = 'Feed B of RK-01 is wired to MCB-02, which is marked not in use.';
  await expect(page.getByRole('region', { name: /Checks/ }).getByText(message)).toBeVisible();

  await page.getByRole('link', { name: /^Review/ }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByRole('button', { name: 'Confirm submit' }).click();
  await expect(page.getByText(message).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve revision' })).toBeDisabled();
});

test('a rack\'s feed source picker shows a panel that is not in use disabled', async ({ page }) => {
  await startDraft(page);
  await page.getByRole('button', { name: /^MCB-02, MCB panel/ }).focus();
  await page.getByRole('button', { name: 'Manage ways' }).click();
  await page.getByRole('dialog', { name: 'MCB-02 ways' }).getByRole('switch', { name: 'In use' }).click();
  await page.getByRole('button', { name: 'RK-01, Rack' }).focus();
  const source = page.getByRole('group', { name: 'Power feeds' }).getByLabel('Feed A source');
  await expect(source.getByRole('option', { name: 'MCB-02 (not in use)' })).toBeDisabled();
  await expect(source.getByRole('option', { name: 'MCB-01' })).toBeEnabled();
});

test('keys pressed on a breaker tile stay in the panel: the panel never moves or asks to be removed, and Escape closes it', async ({ page }) => {
  const manager = await openManager(page, 'MCB-01', /MDF-1/);
  const placement = page.getByRole('complementary', { name: 'MCB-01 details' }).getByRole('group', { name: 'Placement' });
  const x = placement.getByRole('textbox', { name: 'X' });
  const y = placement.getByRole('textbox', { name: 'Y' });
  const [x0, y0] = [await x.inputValue(), await y.inputValue()];
  await manager.getByRole('button', { name: /^Way 1,/ }).click();
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'r', 'Delete']) await page.keyboard.press(key);
  await expect(manager.getByRole('button', { name: /^Way 2,/ })).toBeFocused();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(x).toHaveValue(x0);
  await expect(y).toHaveValue(y0);
  await page.keyboard.press('Escape');
  await expect(manager).toBeHidden();
});
