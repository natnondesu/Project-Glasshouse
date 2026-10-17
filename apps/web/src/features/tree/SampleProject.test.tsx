import { SAMPLE_PROJECT_NAME, SHOWCASE_PROJECT_NAME } from '@glasshouse/domain';
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
  expect(useWorkspaceStore.getState().workspace.projects.map((p) => p.name)).toEqual([SAMPLE_PROJECT_NAME, SHOWCASE_PROJECT_NAME]);
  expect(tree().getByText(SAMPLE_PROJECT_NAME).closest('li')).toHaveTextContent('SAMPLE');
  expect(tree().getByRole('link', { name: /Server room A/ })).toHaveTextContent('R01 APPROVED');
  expect(tree().queryByRole('button', { name: 'Load sample project' })).toBeNull();
});

it('offers the showcase to a workspace that already has the first sample, and adds only that', async () => {
  const user = userEvent.setup();
  const { createSampleProject } = await import('@glasshouse/domain');
  const first = createSampleProject('2026-10-17T00:00:00.000Z');
  if (!first.ok) throw new Error(first.error.message);
  const s = useWorkspaceStore.getState();
  s.replace({ ...s.workspace, projects: [first.value] });
  render(<RouterProvider router={createMemoryRouter(routes)} />);
  await user.click(tree().getByRole('button', { name: 'Add the sample Riverside Campus' }));
  expect(useWorkspaceStore.getState().workspace.projects.map((p) => p.name)).toEqual([SAMPLE_PROJECT_NAME, SHOWCASE_PROJECT_NAME]);
  expect(tree().queryByRole('button', { name: /^(Add the sample|Load sample)/ })).toBeNull();
});
