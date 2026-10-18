import { expect, type Page } from '@playwright/test';

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Account menu for / }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Glasshouse' })).toBeVisible();
}
