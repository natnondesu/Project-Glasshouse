import { currentRevision, findRoom } from '@glasshouse/domain';
import { fireEvent, render } from '@testing-library/react';
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
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' });
});

it('undoes with ⌘Z even when focus has fallen back to the page body', () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  useWorkspaceStore.getState().dispatch({ type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 8 } } });
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
  expect(currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.survey.width).toBe(5);
});

const bannerText = () => document.querySelector('.read-only-banner')?.textContent ?? null;

it.each(['connecting', 'offline'] as const)('shows the offline banner, never the other-tab one, while read-only and %s in server mode', (connection) => {
  const s = useWorkspaceStore.getState();
  s.setConnection(connection);
  s.setReadOnly(true);
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  expect(bannerText()).toMatch(/Lost the connection/);
  expect(bannerText()).not.toMatch(/another tab/);
});

it('still shows the other-tab banner for a read-only local tab', () => {
  useWorkspaceStore.getState().setReadOnly(true);
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  expect(bannerText()).toMatch(/another tab/);
});
