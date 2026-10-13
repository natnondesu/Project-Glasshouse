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
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
});

it('undoes with ⌘Z even when focus has fallen back to the page body', () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  useWorkspaceStore.getState().dispatch({ type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 8 } } });
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
  expect(currentRevision(findRoom(useWorkspaceStore.getState().workspace, 'r')!.room.plan).content.survey.width).toBe(5);
});
