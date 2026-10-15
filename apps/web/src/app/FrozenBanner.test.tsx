import { createObject, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { routes } from './routes';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' } } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: '', at: '2026-10-14T00:00:00.000Z' } });
});

it('makes the plan read-only while In review, until a new draft starts', async () => {
  const user = userEvent.setup();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  expect(screen.getByText(/Revision 01 is In review/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Place rack' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Measure' })).toBeInTheDocument();
  expect(screen.getByLabelText('Width')).toBeDisabled();
  expect(screen.getByText('Read-only')).toBeInTheDocument();
  expect(screen.queryByText('Changes save as you type')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Start new draft' }));
  expect(screen.queryByText(/is In review/)).toBeNull();
  expect(screen.getByLabelText('Width')).toBeEnabled();
  expect(screen.getByText('Changes save as you type')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Place rack' })).toBeInTheDocument();
});

it('locks the elevation palette while frozen', () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation'] })} />);
  expect(screen.getByText(/Revision 01 is In review/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add Server 2U to RK-01' })).toBeNull();
});
