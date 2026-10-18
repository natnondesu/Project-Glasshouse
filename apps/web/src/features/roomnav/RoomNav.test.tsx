import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { useLangStore } from '../../i18n/lang';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const send = (command: Parameters<ReturnType<typeof useWorkspaceStore.getState>['dispatch']>[0]) => {
  const problem = useWorkspaceStore.getState().dispatch(command);
  if (problem) throw new Error(problem.message);
};

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
  send({ type: 'project/create', id: 'p', name: 'Northgate' });
  send({ type: 'site/create', projectId: 'p', id: 's', name: 'Site A' });
  send({ type: 'site/create', projectId: 'p', id: 's2', name: 'Site B' });
  send({ type: 'room/create', siteId: 's', id: 'r1', floorAreaId: 'f1', name: 'MDF-1' });
  send({ type: 'room/create', siteId: 's', id: 'r2', floorAreaId: 'f2', name: 'MDF-2' });
  send({ type: 'room/create', siteId: 's2', id: 'r3', floorAreaId: 'f3', name: 'Comms' });
  send({ type: 'project/create', id: 'q', name: 'Riverside' });
  send({ type: 'site/create', projectId: 'q', id: 'qs', name: 'Campus' });
  send({ type: 'room/create', siteId: 'qs', id: 'q1', floorAreaId: 'fq', name: 'Shaft L1' });
});
afterEach(async () => {
  await act(() => useLangStore.getState().setLang('en'));
});

const open = (path = '/rooms/r1/plan') => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
};
// The plan's panels have headers of their own: the title block is the app's.
const banner = () => within(document.querySelector<HTMLElement>('.title-block')!);
const tree = () => screen.queryByRole('complementary', { name: 'Projects' });
const projectsButton = () => banner().getByRole('button', { name: /^Projects/ });

describe('room screens', () => {
  it('open without the tree; Home keeps it docked', () => {
    const { unmount } = open();
    expect(tree()).toBeNull();
    unmount();
    open('/');
    expect(tree()).toBeInTheDocument();
    expect(banner().queryByRole('button', { name: /^Projects/ })).toBeNull();
  });

  it('keep the tree docked on a room that is not in the workspace, so the way out stays', () => {
    open('/rooms/gone/plan');
    expect(tree()).toBeInTheDocument();
    expect(tree()).not.toHaveClass('tree--drawer');
  });

  it('do not pin the tree for someone whose tree was open before', () => {
    localStorage.setItem('glasshouse:tree-open', 'true');
    open();
    expect(tree()).toBeNull();
  });
});

describe('the project drawer', () => {
  it('opens from the Projects button with focus on the open room, and Escape closes it back to the button', async () => {
    const user = userEvent.setup();
    open();
    await user.click(projectsButton());
    expect(projectsButton()).toHaveAttribute('aria-expanded', 'true');
    expect(tree()).toHaveClass('tree--drawer');
    expect(within(tree()!).getByRole('link', { name: /MDF-1/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(tree()).toBeNull();
    expect(projectsButton()).toHaveFocus();
  });

  it('closes when a room is picked, landing in that room', async () => {
    const user = userEvent.setup();
    const { router } = open();
    await user.click(projectsButton());
    await user.click(within(tree()!).getByRole('link', { name: /Shaft L1/ }));
    expect(router.state.location.pathname).toBe('/rooms/q1/plan');
    expect(tree()).toBeNull();
    expect(projectsButton()).toHaveFocus();
  });

  it('closes on a click outside it', async () => {
    const user = userEvent.setup();
    open();
    await user.click(projectsButton());
    await user.click(screen.getByRole('main'));
    expect(tree()).toBeNull();
  });

  it('toggles with [ but not while typing', async () => {
    const user = userEvent.setup();
    open();
    fireEvent.keyDown(document.body, { key: '[', code: 'BracketLeft' });
    expect(tree()).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '[', code: 'BracketLeft' });
    expect(tree()).toBeNull();
    await user.click(screen.getByLabelText('Width', { selector: 'input' }));
    fireEvent.keyDown(document.activeElement!, { key: '[', code: 'BracketLeft' });
    expect(tree()).toBeNull();
    expect(projectsButton()).toHaveAttribute('data-hint', expect.stringContaining('['));
  });

  it('pins: the tree docks, stays after a reload, and Unpin returns it to a drawer', async () => {
    const user = userEvent.setup();
    const { unmount } = open();
    await user.click(projectsButton());
    const pin = within(tree()!).getByRole('button', { name: 'Pin projects' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await user.click(pin);
    expect(tree()).not.toHaveClass('tree--drawer');
    expect(within(tree()!).getByRole('button', { name: 'Pin projects' })).toHaveAttribute('aria-pressed', 'true');
    unmount();
    open('/rooms/r2/plan');
    expect(tree()).toBeInTheDocument();
    expect(tree()).not.toHaveClass('tree--drawer');
    await user.click(within(tree()!).getByRole('button', { name: 'Pin projects' }));
    expect(tree()).toHaveClass('tree--drawer');
    await user.click(screen.getByRole('main'));
    expect(tree()).toBeNull();
  });

  it('keeps a new room named from Home: the drawer holds the rename, then gets out of the way', async () => {
    const user = userEvent.setup();
    const { router } = open('/');
    await user.click(within(tree()!).getByRole('button', { name: 'Add room to Site B' }));
    expect(router.state.location.pathname).toMatch(/^\/rooms\/.+\/plan$/);
    const name = within(tree()!).getByRole('textbox', { name: 'Room name' });
    expect(name).toHaveFocus();
    await user.clear(name);
    await user.type(name, 'IDF-2{Enter}');
    expect(tree()).toBeNull();
    expect(banner().getByRole('button', { name: 'IDF-2' })).toBeInTheDocument();
  });

  it('marks the Projects button when the workspace is not backed up', () => {
    open();
    expect(projectsButton()).toHaveAccessibleName('Projects, workspace not backed up');
    expect(projectsButton().querySelector('.projects-btn__dot')).not.toBeNull();
  });

  it('speaks Thai', async () => {
    open();
    await act(() => useLangStore.getState().setLang('th'));
    expect(banner().getByRole('button', { name: /^โปรเจกต์/ })).toBeInTheDocument();
  });
});

describe('the save status on room screens', () => {
  it('is short beside the breadcrumb, with the full sentence in its hint and for screen readers', () => {
    useWorkspaceStore.setState({ save: { kind: 'saved', at: new Date('2026-10-18T15:37:00') } });
    open();
    const status = document.querySelector<HTMLElement>('.title-block .save-status')!;
    expect(status).toHaveClass('save-status--compact');
    expect(status.querySelector('span[aria-hidden="true"]')).toHaveTextContent(/^Saved \d/);
    expect(status.querySelector('.visually-hidden')).toHaveTextContent(/^Saved in this browser · /);
    expect(status.dataset.hint).toMatch(/^Saved in this browser · /);
  });

  it('keeps a failed save in full and as an alert', () => {
    useWorkspaceStore.setState({ save: { kind: 'failed', reason: 'disk full' } });
    open();
    expect(banner().getByRole('alert')).toHaveTextContent("Couldn't save: disk full");
  });

  it('stays in full on Home', () => {
    open('/');
    expect(document.querySelector('.title-block .save-status')).not.toHaveClass('save-status--compact');
  });

  it('speaks Thai', async () => {
    useWorkspaceStore.setState({ save: { kind: 'saved', at: new Date('2026-10-18T15:37:00') } });
    open();
    await act(() => useLangStore.getState().setLang('th'));
    expect(document.querySelector('.title-block .save-status span[aria-hidden="true"]')).toHaveTextContent(/^บันทึกแล้ว /);
  });
});

describe('the breadcrumb switcher', () => {
  const crumbs = () => within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
  const switcher = () => screen.queryByRole('dialog', { name: 'Rooms in Northgate' });

  it('links the project home and lists this project’s rooms by site, the current one marked', async () => {
    const user = userEvent.setup();
    open();
    expect(crumbs().getByRole('link', { name: 'Northgate' })).toHaveAttribute('href', '/');
    await user.click(crumbs().getByRole('button', { name: 'MDF-1' }));
    const list = within(switcher()!);
    expect(list.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Site A', 'Site B']);
    expect(list.getByRole('menuitem', { name: /MDF-1/ })).toHaveAttribute('aria-current', 'page');
    expect(list.getByRole('menuitem', { name: /MDF-2/ })).toHaveTextContent('R01 DRAFT');
    expect(list.queryByRole('menuitem', { name: /Shaft L1/ })).toBeNull();
  });

  it('jumps to another room in one click', async () => {
    const user = userEvent.setup();
    const { router } = open();
    await user.click(crumbs().getByRole('button', { name: 'MDF-1' }));
    await user.click(within(switcher()!).getByRole('menuitem', { name: /Comms/ }));
    expect(router.state.location.pathname).toBe('/rooms/r3/plan');
    expect(switcher()).toBeNull();
  });

  it('works from the keyboard: ArrowDown opens, arrows move, Enter opens, Escape and Tab close', async () => {
    const user = userEvent.setup();
    const { router } = open();
    const room = crumbs().getByRole('button', { name: 'MDF-1' });
    room.focus();
    await user.keyboard('{ArrowDown}');
    expect(within(switcher()!).getByRole('menuitem', { name: /MDF-1/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(switcher()).toBeNull();
    expect(room).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Tab}');
    expect(switcher()).toBeNull();
    room.focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(within(switcher()!).getByRole('menuitem', { name: /Comms/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/rooms/r3/plan');
  });

  it('opens on the site’s own rooms from the site crumb', async () => {
    const user = userEvent.setup();
    open('/rooms/r3/plan');
    await user.click(crumbs().getByRole('button', { name: 'Site B' }));
    expect(within(switcher()!).getByRole('menuitem', { name: /Comms/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(crumbs().getByRole('button', { name: 'Site B' })).toHaveFocus();
  });

  it('offers a filter past eight rooms, and Enter opens the first match', async () => {
    for (let i = 3; i <= 9; i++) send({ type: 'room/create', siteId: 's2', id: `x${i}`, floorAreaId: `fx${i}`, name: `Shaft ${i}` });
    const user = userEvent.setup();
    const { router } = open();
    await user.click(crumbs().getByRole('button', { name: 'MDF-1' }));
    const filter = within(switcher()!).getByRole('searchbox', { name: 'Filter rooms' });
    expect(filter).toHaveFocus();
    await user.type(filter, 'shaft 7');
    expect(within(switcher()!).getAllByRole('menuitem')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/rooms/x7/plan');
  });

  it('leaves archived rooms out unless it is the open one', async () => {
    send({ type: 'room/archive', roomId: 'r2', by: '', at: '2026-10-18T09:00:00.000Z' });
    const user = userEvent.setup();
    open();
    await user.click(crumbs().getByRole('button', { name: 'MDF-1' }));
    expect(within(switcher()!).queryByRole('menuitem', { name: /MDF-2/ })).toBeNull();
  });
});
