import type { Locator, Page } from '@playwright/test';

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A toolbar group's button: "Racks tools", or "Wall rack — Racks tools" while one of its tools is in use. */
export const groupButton = (page: Page, group: string): Locator =>
  page.getByRole('toolbar', { name: 'Plan tools' }).getByRole('button', { name: new RegExp(`(^|— )${escape(group)} tools$`) });

/** A group's button opens its list; the tool is chosen from the list. */
export async function pickTool(page: Page, group: string, item: string): Promise<void> {
  await groupButton(page, group).click();
  await page.getByRole('menuitemradio', { name: item, exact: true }).click();
}
