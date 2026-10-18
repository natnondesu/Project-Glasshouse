import { findRoom } from '@glasshouse/domain';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import type { Role } from '../../auth/authApi';
import { resetAuthStore, useAuthStore } from '../../auth/authStore';
import { useLangStore } from '../../i18n/lang';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const AT = '2026-10-18T09:00:00.000Z';
const send = (command: Parameters<ReturnType<typeof useWorkspaceStore.getState>['dispatch']>[0]) => {
  const problem = useWorkspaceStore.getState().dispatch(command);
  if (problem) throw new Error(problem.message);
};

beforeEach(() => {
  localStorage.clear();
  resetAuthStore();
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
  send({ type: 'project/create', id: 'p', name: 'Northgate' });
  send({ type: 'site/create', projectId: 'p', id: 's', name: 'Site A' });
  send({ type: 'site/create', projectId: 'p', id: 's2', name: 'Site B' });
  send({ type: 'room/create', siteId: 's', id: 'r1', floorAreaId: 'fa-1', name: 'MDF-1' });
  send({ type: 'room/create', siteId: 's', id: 'r2', floorAreaId: 'fa-2', name: 'Server room B' });
  send({ type: 'room/create', siteId: 's', id: 'r3', floorAreaId: 'fa-3', name: 'Edge' });
});
afterEach(async () => {
  await act(() => useLangStore.getState().setLang('en'));
});

const open = (path = '/') => {
  // Inside a room the tree is a drawer until pinned; these tests read the tree beside the open room.
  if (path.startsWith('/rooms/')) localStorage.setItem('glasshouse:tree-pinned', 'true');
  return render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
};
const tree = () => screen.getByRole('complementary', { name: /^(Projects|โปรเจกต์)$/ });
const inTree = () => within(tree());
const signInAs = (role: Role): void => useAuthStore.setState({ status: 'signed-in', user: { id: 'u', name: 'Ada', email: 'a@x', role, mustChangePassword: false } });

it('archives a room after a confirmation, hides it, and brings it back from Show archived', async () => {
  const user = userEvent.setup();
  open();
  await user.click(inTree().getByRole('button', { name: 'Archive MDF-1' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Archive MDF-1?' });
  expect(dialog).toHaveAccessibleDescription('It becomes read-only and hidden. You can restore it any time.');
  await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

  expect(findRoom(useWorkspaceStore.getState().workspace, 'r1')?.room).toMatchObject({ archivedAt: expect.any(String) });
  expect(inTree().queryByRole('link', { name: /MDF-1/ })).toBeNull();
  expect(inTree().getByRole('link', { name: /Edge/ })).toBeInTheDocument();

  await user.click(inTree().getByRole('checkbox', { name: /Show archived/ }));
  const row = inTree().getByRole('link', { name: /MDF-1/ });
  expect(row).toHaveTextContent('Archived');
  expect(row.closest('li')).toHaveClass('tree-row--archived');
  // Archived means read-only: nothing to rename or add to, but it can come back.
  expect(inTree().queryByRole('button', { name: 'Rename MDF-1' })).toBeNull();

  await user.click(inTree().getByRole('button', { name: 'Restore MDF-1' }));
  expect(findRoom(useWorkspaceStore.getState().workspace, 'r1')?.room).not.toHaveProperty('archivedAt');
  expect(inTree().getByRole('link', { name: /MDF-1/ }).closest('li')).not.toHaveClass('tree-row--archived');
});

it('says what an archive takes with it, for a site and for a project', async () => {
  const user = userEvent.setup();
  open();
  await user.click(inTree().getByRole('button', { name: 'Archive Site A' }));
  const site = screen.getByRole('alertdialog', { name: 'Archive Site A and its 3 rooms?' });
  expect(site).toHaveAccessibleDescription('They become read-only and hidden. You can restore them any time.');
  await user.click(within(site).getByRole('button', { name: 'Cancel' }));
  expect(useWorkspaceStore.getState().workspace.projects[0]!.sites[0]).not.toHaveProperty('archivedAt');

  await user.click(inTree().getByRole('button', { name: 'Archive Northgate' }));
  expect(screen.getByRole('alertdialog', { name: 'Archive Northgate and its 2 sites and 3 rooms?' })).toBeInTheDocument();
});

it('archives a site with its rooms, and counts rooms archived on their own apart', async () => {
  const user = userEvent.setup();
  send({ type: 'room/archive', roomId: 'r3', by: 'Few', at: AT });
  open();
  await user.click(inTree().getByRole('button', { name: 'Archive Site A' }));
  expect(screen.getByRole('alertdialog', { name: 'Archive Site A and its 2 rooms?' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Archive' }));
  expect(inTree().queryByRole('button', { name: /Collapse Site A/ })).toBeNull();
  expect(inTree().getByRole('button', { name: /Collapse Site B/ })).toBeInTheDocument();
  await user.click(inTree().getByRole('checkbox', { name: /Show archived/ }));
  expect(inTree().getByRole('link', { name: /Server room B/ }).closest('li')).toHaveClass('tree-row--archived');
});

it('offers "Restore Site A first" for a room whose site is archived', async () => {
  const user = userEvent.setup();
  send({ type: 'site/archive', siteId: 's', by: 'Few', at: AT });
  open();
  await user.click(inTree().getByRole('checkbox', { name: /Show archived/ }));
  const restore = inTree().getByRole('button', { name: /^Restore MDF-1/ });
  expect(restore).toHaveAttribute('aria-disabled', 'true');
  expect(restore).toHaveAccessibleName(/Restore Site Site A first\./);
  await user.click(restore);
  expect(inTree().getByRole('alert')).toHaveTextContent('Restore Site Site A first.');
  expect(findRoom(useWorkspaceStore.getState().workspace, 'r1')).toBeTruthy();
  await user.click(inTree().getByRole('button', { name: 'Restore Site A' }));
  expect(useWorkspaceStore.getState().workspace.projects[0]!.sites[0]).not.toHaveProperty('archivedAt');
  expect(inTree().getByRole('link', { name: /MDF-1/ })).toBeInTheDocument();
});

it('remembers Show archived in this browser', async () => {
  const user = userEvent.setup();
  send({ type: 'room/archive', roomId: 'r1', by: '', at: AT });
  const view = open();
  await user.click(inTree().getByRole('checkbox', { name: /Show archived/ }));
  expect(localStorage.getItem('glasshouse:tree-show-archived')).toBe('true');
  view.unmount();
  open();
  expect(inTree().getByRole('checkbox', { name: /Show archived/ })).toBeChecked();
  expect(inTree().getByRole('link', { name: /MDF-1/ })).toBeInTheDocument();
});

it('works when storage is blocked: the choice just lasts for this visit', async () => {
  const user = userEvent.setup();
  send({ type: 'room/archive', roomId: 'r1', by: '', at: AT });
  const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  try {
    open();
    expect(inTree().queryByRole('link', { name: /MDF-1/ })).toBeNull();
    await user.click(inTree().getByRole('checkbox', { name: /Show archived/ }));
    expect(inTree().getByRole('link', { name: /MDF-1/ })).toBeInTheDocument();
  } finally {
    getItem.mockRestore();
    setItem.mockRestore();
  }
});

it('keeps the toggle on screen while it is checked, even with nothing archived', async () => {
  const user = userEvent.setup();
  send({ type: 'room/archive', roomId: 'r1', by: '', at: AT });
  open();
  await user.click(inTree().getByRole('checkbox', { name: /Show archived/ }));
  await user.click(inTree().getByRole('button', { name: 'Restore MDF-1' }));
  expect(inTree().getByRole('checkbox', { name: /Show archived/ })).toBeChecked();
  await user.click(inTree().getByRole('checkbox', { name: /Show archived/ }));
  expect(inTree().queryByRole('checkbox', { name: /Show archived/ })).toBeNull();
});

it('shows the toggle, with how many are archived, only once something is', async () => {
  const user = userEvent.setup();
  open();
  expect(inTree().queryByRole('checkbox', { name: /Show archived/ })).toBeNull();
  await user.click(inTree().getByRole('button', { name: 'Archive Edge' }));
  await user.click(screen.getByRole('button', { name: 'Archive' }));
  expect(inTree().getByRole('checkbox', { name: /Show archived/ })).toHaveAccessibleName(/^Show archived\s?1$/);
});

it('never hides the room that is open, or the way to it', () => {
  send({ type: 'site/archive', siteId: 's', by: 'Few', at: AT });
  open('/rooms/r1/plan');
  expect(inTree().getByRole('link', { name: /MDF-1/ })).toHaveAttribute('aria-current', 'page');
  expect(inTree().getByRole('button', { name: 'Collapse Site A' })).toBeInTheDocument();
  expect(inTree().queryByRole('link', { name: /Edge/ })).toBeNull();
});

it.each([
  ['viewer', false],
  ['editor', false],
  ['reviewer', false],
  ['admin', true],
] as const)('signed in as %s, archive actions are present: %s', (role, present) => {
  signInAs(role);
  send({ type: 'room/archive', roomId: 'r3', by: 'Few', at: AT });
  open('/rooms/r3/plan');
  for (const name of ['Archive Northgate', 'Archive Site A', 'Archive MDF-1', 'Restore Edge']) {
    expect(inTree().queryByRole('button', { name }) !== null, name).toBe(present);
  }
});

it('shows everyone the archived items when asked, with no actions for a viewer', async () => {
  const user = userEvent.setup();
  signInAs('viewer');
  send({ type: 'room/archive', roomId: 'r1', by: 'Few', at: AT });
  open();
  await user.click(inTree().getByRole('checkbox', { name: /Show archived/ }));
  expect(inTree().getByRole('link', { name: /MDF-1/ })).toHaveTextContent('Archived');
  expect(inTree().queryByRole('button', { name: /Restore MDF-1/ })).toBeNull();
});

it('keeps an archived item from being deleted until it is restored, and says so', async () => {
  const user = userEvent.setup();
  signInAs('editor');
  send({ type: 'room/archive', roomId: 'r1', by: '', at: AT });
  open('/rooms/r1/plan');
  expect(inTree().queryByRole('button', { name: 'Rename MDF-1' })).toBeNull();
  const blocked = inTree().getByRole('button', { name: /^Delete MDF-1/ });
  expect(blocked).toHaveAttribute('aria-disabled', 'true');
  expect(blocked).toHaveAccessibleName('Delete MDF-1. Restore Room MDF-1 before deleting it.');
  await user.click(blocked);
  expect(inTree().getByRole('alert')).toHaveTextContent('Restore Room MDF-1 before deleting it.');
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  expect(findRoom(useWorkspaceStore.getState().workspace, 'r1')).toBeTruthy();
  // Live neighbours still delete.
  expect(inTree().getByRole('button', { name: 'Delete Edge' })).not.toHaveAttribute('aria-disabled');
});

it('names the archived parent when a room is only archived through it, and lets an admin delete after restoring', async () => {
  const user = userEvent.setup();
  send({ type: 'site/archive', siteId: 's', by: '', at: AT });
  open('/rooms/r1/plan');
  expect(inTree().getByRole('button', { name: /^Delete MDF-1/ })).toHaveAccessibleName('Delete MDF-1. Restore Site Site A before deleting room MDF-1.');
  expect(inTree().getByRole('button', { name: /^Delete Site A/ })).toHaveAccessibleName('Delete Site A. Restore Site Site A before deleting it.');
  await user.click(inTree().getByRole('button', { name: 'Restore Site A' }));
  await user.click(inTree().getByRole('button', { name: 'Delete MDF-1' }));
  await user.click(inTree().getByRole('button', { name: 'Delete' }));
  expect(findRoom(useWorkspaceStore.getState().workspace, 'r1')).toBeNull();
});

it('speaks Thai: the badge, the toggle and the confirmation', async () => {
  const user = userEvent.setup();
  send({ type: 'room/archive', roomId: 'r1', by: '', at: AT });
  open();
  await act(() => useLangStore.getState().setLang('th'));
  await user.click(inTree().getByRole('checkbox', { name: /แสดงที่เก็บถาวร/ }));
  expect(inTree().getByRole('link', { name: /MDF-1/ })).toHaveTextContent('เก็บถาวร');
  await user.click(inTree().getByRole('button', { name: 'เก็บ Site A ถาวร' }));
  expect(screen.getByRole('alertdialog', { name: 'เก็บ Site A พร้อม 2 ห้อง ถาวรหรือไม่?' })).toHaveAccessibleDescription('ทั้งหมดจะอ่านได้อย่างเดียวและถูกซ่อน กู้คืนได้ทุกเมื่อ');
});

it('says in Thai why archived work cannot be deleted', async () => {
  const user = userEvent.setup();
  send({ type: 'room/archive', roomId: 'r1', by: '', at: AT });
  open('/rooms/r1/plan');
  await act(() => useLangStore.getState().setLang('th'));
  await user.click(inTree().getByRole('button', { name: /^ลบ MDF-1/ }));
  expect(inTree().getByRole('alert')).toHaveTextContent('กู้คืนห้อง MDF-1 ก่อนจึงจะลบได้');
});
