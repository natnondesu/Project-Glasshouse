import { SAMPLE_PROJECT_NAME } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
});

it('loads the Sample Project on request, labels it, and stops offering it once present', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes)} />);
  await user.click(screen.getByRole('button', { name: 'Load sample project' }));
  expect(useWorkspaceStore.getState().workspace.projects.map((p) => p.name)).toEqual([SAMPLE_PROJECT_NAME]);
  expect(screen.getByText(SAMPLE_PROJECT_NAME).closest('li')).toHaveTextContent('SAMPLE');
  expect(screen.getByRole('link', { name: /Server room A/ })).toHaveTextContent('R01 APPROVED');
  expect(screen.queryByRole('button', { name: 'Load sample project' })).toBeNull();
});
