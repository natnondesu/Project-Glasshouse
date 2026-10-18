import type { Page } from '@playwright/test';

/** A toolbar group's face always picks its default tool; variants (and the default too) live in the flyout behind the group's arrow. */
export async function pickTool(page: Page, group: string, item: string): Promise<void> {
  await page.getByRole('button', { name: `More ${group} tools`, exact: true }).click();
  await page.getByRole('menuitemradio', { name: item, exact: true }).click();
}
