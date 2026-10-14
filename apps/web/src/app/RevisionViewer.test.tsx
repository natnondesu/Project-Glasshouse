import { createObject, type Rack, type Template } from '@glasshouse/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { routes } from './routes';

const AT = '2026-10-14T00:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = s.workspace.catalog.find((x) => x.id === 'tpl-server-2u') as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: 'Ploy', at: AT } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: 'Nok', at: AT } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/new-draft', at: AT } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 7 } } });
});

it('opens an older revision read-only from the review history and returns to current', async () => {
  const user = userEvent.setup();
  const router = createMemoryRouter(routes, { initialEntries: ['/rooms/r/review'] });
  render(<RouterProvider router={router} />);
  await user.click(screen.getByRole('link', { name: 'View R01' }));
  expect(router.state.location.search).toBe('?rev=1');
  expect(screen.getByRole('status')).toHaveTextContent('Viewing R01 (Approved), an older revision. Read-only.');
  expect(screen.getByLabelText('Width')).toHaveValue('5.00');
  expect(screen.getByLabelText('Width')).toBeDisabled();
  // Tabs keep the revision while you look around.
  await user.click(screen.getByRole('link', { name: 'Elevation' }));
  expect(router.state.location.search).toBe('?rev=1');
  await user.click(screen.getByRole('link', { name: 'Back to current (R02)' }));
  expect(router.state.location.search).toBe('');
});

it('does not undo the current draft while an older revision is on screen', () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan?rev=1'] })} />);
  fireEvent.keyDown(window, { key: 'z', metaKey: true });
  const ws = useWorkspaceStore.getState().workspace;
  expect(ws.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[1]!.content.survey.width).toBe(7);
});
