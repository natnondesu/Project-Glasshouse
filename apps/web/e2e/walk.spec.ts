import { openRoom } from './nav';
import { expect, test } from '@playwright/test';

test('walks the room at eye height after choosing where to start, stands at a rack, and leaves with Esc', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox' && !!process.env.CI, "Playwright's Firefox has no WebGL in the CI image");
  await page.goto('/');
  await openRoom(page, /Server room A/);
  await page.getByRole('link', { name: '3D' }).click();
  await page.getByRole('button', { name: 'Walk' }).click();
  // First, where to stand: a spot on the floor, or the door.
  await expect(page.getByText(/Click the floor where you want to stand/)).toBeVisible();
  await page.getByRole('button', { name: 'Start at the door' }).click();
  await expect(page.getByText('Eye height 1.6 m')).toBeVisible();
  await expect(page.getByText(/Click the floor to walk there/)).toBeVisible();
  // The rack list is somewhere to go while walking.
  await expect(page.getByText('Pick a rack to stand in front of it.')).toBeVisible();
  await page.getByRole('complementary', { name: 'Racks in this room' }).getByRole('button').first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Walk' })).toBeVisible();
  await expect(page.getByText('Eye height 1.6 m')).toBeHidden();
});
