import { expect, type Locator, type Page } from '@playwright/test';

/** The project tree: docked on Home, the catalog and users pages; inside a room, the drawer (or docked once pinned). */
export const projectTree = (page: Page): Locator => page.getByRole('complementary', { name: /^(Projects|โปรเจกต์)$/ });

/** The title block's Projects button, shown on room screens while the tree isn't pinned. */
export const projectsButton = (page: Page): Locator => page.locator('.title-block').getByRole('button', { name: /^(Projects|โปรเจกต์)/ });

/** Makes the project tree visible wherever the page is, opening the drawer from inside a room. */
export async function showProjects(page: Page): Promise<Locator> {
  const tree = projectTree(page);
  await expect(tree.or(projectsButton(page)).first()).toBeVisible();
  if (!(await tree.isVisible())) await projectsButton(page).click();
  await expect(tree).toBeVisible();
  return tree;
}

/** Opens a room by its row in the project tree, from Home or from inside another room. */
export async function openRoom(page: Page, name: string | RegExp, { last = false }: { last?: boolean } = {}): Promise<void> {
  const link = (await showProjects(page)).getByRole('link', { name });
  await (last ? link.last() : link).click();
}
