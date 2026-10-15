import type { Page } from '@playwright/test';

/** Toolbar groups open their list on click; pick a tool from it by its name there. */
export async function pickTool(page: Page, face: string, item: string): Promise<void> {
  await page.getByRole('button', { name: face, exact: true }).click();
  await page.getByRole('menuitemradio', { name: item, exact: true }).click();
}
