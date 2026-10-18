import { currentRevision, findRoom } from '@glasshouse/domain';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
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

it('keeps the lockup big enough in the header: a mark of at least 24 px and a lockup of at least 96 px, with its clear space', () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  const lockup = screen.getByRole('img', { name: 'Glasshouse' });
  const height = Number(lockup.getAttribute('height'));
  const width = Number(lockup.getAttribute('width'));
  // The lockup file is 266.13 x 72 and its mark is 48 of those 72 units, with a quarter-mark margin built into the file.
  expect(width).toBeGreaterThanOrEqual(96);
  expect((height * 48) / 72).toBeGreaterThanOrEqual(24);
  expect(width / height).toBeCloseTo(266.13 / 72, 1);
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

it('says the workspace is view-only for a viewer, and not that another tab is open', () => {
  const s = useWorkspaceStore.getState();
  s.setConnection('live');
  s.setReadOnly(true, 'view-only');
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  expect(bannerText()).toBe('You can view this workspace. Ask an admin for edit access.');
});

it('lets a lost connection outrank the view-only banner', () => {
  const s = useWorkspaceStore.getState();
  s.setConnection('offline');
  s.setReadOnly(true, 'view-only');
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);
  expect(bannerText()).toMatch(/Lost the connection/);
});

describe('plan tools while read-only', () => {
  const tools = () => within(screen.getByRole('toolbar', { name: 'Plan tools' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
  const plan = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] })} />);

  it.each(['view-only', 'offline'] as const)('offers only viewing tools to a %s workspace', (reason) => {
    useWorkspaceStore.getState().setReadOnly(true, reason);
    plan();
    expect(tools()).toEqual(['Select', 'Pan', 'Measure']);
    expect(screen.queryByText(/is Draft and frozen/)).toBeNull();
  });

  it('leaves the tools alone for the tab that lost the lock to another tab', () => {
    useWorkspaceStore.getState().setReadOnly(true);
    plan();
    expect(tools().length).toBeGreaterThan(3);
  });
});
