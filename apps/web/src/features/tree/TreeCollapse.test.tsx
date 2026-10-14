import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'Site A' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r2', name: 'MDF-2' });
});

const open = (path = '/') => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);

it('collapses and expands projects and sites, and remembers it', async () => {
  const user = userEvent.setup();
  const { unmount } = open();
  await user.click(screen.getByRole('button', { name: 'Collapse Site A' }));
  expect(screen.queryByRole('link', { name: /MDF-1/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Collapse Northgate' }));
  expect(screen.queryByText('Site A')).toBeNull();
  unmount();
  open();
  expect(screen.queryByText('Site A')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Expand Northgate' }));
  expect(screen.getByRole('button', { name: 'Expand Site A' })).toHaveAttribute('aria-expanded', 'false');
});

it('keeps the open room visible even inside a collapsed site', async () => {
  const user = userEvent.setup();
  const { unmount } = open();
  await user.click(screen.getByRole('button', { name: 'Collapse Site A' }));
  unmount();
  open('/rooms/r/plan');
  expect(screen.getByRole('link', { name: /MDF-1/ })).toBeInTheDocument();
});

it('colours the revision chip by state: approved is green', () => {
  const s = useWorkspaceStore.getState();
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: '', at: '2026-10-14T00:00:00.000Z' } });
  open();
  expect(screen.getByText('R01 IN REVIEW')).toHaveClass('stamp--in_review');
  expect(screen.getByText('R01 DRAFT')).toHaveClass('stamp--draft');
});
