import { createObject, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const MESSAGE = 'Reserved range U10–U13 in RK-01 has unknown demand.';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'reserved/add', rackId: 'rk', range: { id: 'rsv', label: 'Core', bottomU: 10, heightU: 4, demand: { kind: 'unknown' }, notes: '' } } });
  s.dispatch({ type: 'review', roomId: 'r', command: { type: 'review/acknowledge', reservedRangeId: 'rsv', reason: 'Customer will not share', by: 'Somchai', at: '2026-10-14T00:00:00.000Z' } });
});

it.each(['plan', 'elevation'])('the %s checks agree with Review once unknown demand is acknowledged', (view) => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/r/${view}`] })} />);
  expect(screen.queryByText(MESSAGE)).toBeNull();
});
