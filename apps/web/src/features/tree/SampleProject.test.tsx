import { SAMPLE_PROJECT_NAME } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
});

// Home repeats rooms as cards: ask the tree itself.
const tree = () => within(screen.getByRole('complementary', { name: 'Projects' }));

it('loads the Sample Project on request, labels it, and stops offering it once present', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes)} />);
  await user.click(tree().getByRole('button', { name: 'Load sample project' }));
  expect(useWorkspaceStore.getState().workspace.projects.map((p) => p.name)).toEqual([SAMPLE_PROJECT_NAME]);
  expect(tree().getByText(SAMPLE_PROJECT_NAME).closest('li')).toHaveTextContent('SAMPLE');
  expect(tree().getByRole('link', { name: /Server room A/ })).toHaveTextContent('R01 APPROVED');
  expect(tree().queryByRole('button', { name: 'Load sample project' })).toBeNull();
});
