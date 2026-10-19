import { apply, createWorkspace, withSample, type Workspace } from '@glasshouse/domain';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { resetAuthStore } from '../../auth/authStore';
import { useLangStore } from '../../i18n/lang';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import countries from '../globe/data/countries-50m.topo.json';
import provinces from '../globe/data/thailand-provinces-10m.topo.json';

vi.mock('../globe/geoData', async (importOriginal) => {
  const real = await importOriginal<typeof import('../globe/geoData')>();
  return { ...real, loadGeo: () => Promise.resolve(real.parseGeo(countries as never, provinces as never)) };
});

const sample = (): Workspace => {
  const r = withSample(createWorkspace(), '2026-10-18T00:00:00.000Z');
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const withThai = (): Workspace => {
  const steps = [
    { type: 'project/create', id: 'p-th', name: 'ศูนย์ข้อมูล บางนา' },
    { type: 'site/create', projectId: 'p-th', id: 's-th', name: 'อาคารสำนักงานใหญ่' },
    { type: 'room/create', siteId: 's-th', id: 'r-th', floorAreaId: 'fa-th', name: 'ห้องเซิร์ฟเวอร์ ชั้น 3' },
  ] as const;
  return steps.reduce((w, c) => {
    const r = apply(w, c);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, sample());
};

beforeEach(() => {
  localStorage.clear();
  resetAuthStore();
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
  useWorkspaceStore.getState().replace(sample());
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await act(() => useLangStore.getState().setLang('en'));
});

const open = (path = '/') => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
};
const box = () => screen.getByRole('combobox', { name: 'Search sites, rooms and projects' });
const list = () => screen.getByRole('listbox', { name: 'Search results' });
const activeOption = (): HTMLElement | null => {
  const id = box().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};
const roomOf = (name: string) =>
  useWorkspaceStore
    .getState()
    .workspace.projects.flatMap((p) => p.sites.flatMap((s) => s.rooms))
    .find((r) => r.name === name)!;

describe('Home’s search dropdown', () => {
  it('lists what it finds as you type, grouped into sites, rooms and projects, the matches marked', async () => {
    const user = userEvent.setup();
    open();
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    await user.type(box(), 'riverside');
    await waitFor(() => expect(box()).toHaveAttribute('aria-expanded', 'true'));
    expect(box()).toHaveAttribute('aria-controls', list().id);
    expect(within(list()).getAllByRole('group').map((g) => g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent)).toEqual(['Sites2', 'Rooms5', 'Projects1']);
    const sites = within(list()).getByRole('group', { name: /^Sites/ });
    const campus = within(sites).getAllByRole('option')[0]!;
    expect(campus).toHaveTextContent('Riverside Campus');
    expect(campus).toHaveTextContent('Sample · Riverside Campus · 4 rooms');
    expect(campus.querySelector('mark')).toHaveTextContent(/^Riverside$/);
    const room = within(within(list()).getByRole('group', { name: /^Rooms/ })).getAllByRole('option')[0]!;
    expect(room).toHaveTextContent('Server Room');
    expect(room).toHaveTextContent('Riverside Campus · Sample · Riverside Campus');
    expect(room).toHaveTextContent('R02 DRAFT');
    // What holds approval, in the Review badge's terms.
    expect(room).toHaveTextContent('2 blocking');
    expect(room).toHaveTextContent('1 to acknowledge');
    expect(within(within(list()).getByRole('group', { name: /^Projects/ })).getByRole('option')).toHaveTextContent('Sample · Riverside Campus2 sites · 5 rooms');
    expect(within(list()).getByRole('option', { name: 'Show all 2 matches on the map' })).toBeInTheDocument();
    // The page still narrows as you type, and says what is left.
    expect(screen.getByRole('heading', { level: 2, name: 'Everywhere · 2 sites · matching “riverside”' })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.home-results')).toHaveTextContent('5 rooms in 2 sites'));
  });

  it('caps a group and offers the rest, which widens the rooms to everywhere and goes to them', async () => {
    const user = userEvent.setup();
    open(`/?rooms=draft`);
    await user.type(box(), 'sample');
    const rooms = await within(await screen.findByRole('listbox', { name: 'Search results' })).findByRole('group', { name: /^Rooms/ });
    expect(within(rooms).getAllByRole('option')).toHaveLength(6);
    await user.click(within(rooms).getByRole('option', { name: 'Show all 7 in Rooms' }));
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    const grid = screen.getByRole('region', { name: 'All rooms' });
    expect(within(grid).getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(grid).getAllByRole('article')).toHaveLength(7);
    expect(document.getElementById('home-rooms-h')).toHaveFocus();
  });

  it('moves through the options with the arrows, Enter picks one: a site flies there and opens its card', async () => {
    const user = userEvent.setup();
    open();
    await user.type(box(), 'riverside');
    await screen.findByRole('listbox', { name: 'Search results' });
    expect(activeOption()).toBeNull();
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent(/^Riverside Campus/);
    expect(activeOption()).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
    expect(activeOption()).toHaveTextContent(/^Riverside Annex/);
    // Up from the first wraps to the last: the map.
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(activeOption()).toHaveTextContent('Show all 2 matches on the map');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(box()).toHaveValue('riverside');
    expect(box()).toHaveFocus();
    expect(document.getElementById('home-site-name')).toHaveTextContent('Riverside Annex');
  });

  it('picks a room on the globe: its site’s card opens with that room picked', async () => {
    const user = userEvent.setup();
    open();
    await user.type(box(), 'shaft l2');
    await screen.findByRole('listbox', { name: 'Search results' });
    await user.keyboard('{ArrowDown}');
    expect(activeOption()).toHaveTextContent(/^Shaft L2/);
    await user.keyboard('{Enter}');
    expect(document.getElementById('home-site-name')).toHaveTextContent('Riverside Campus');
    expect(screen.getByRole('button', { name: 'Show Shaft L2 in 3D' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a project scopes to its sites', async () => {
    const user = userEvent.setup();
    open();
    await user.type(box(), 'riverside');
    await user.click(within(await screen.findByRole('group', { name: /^Projects/ })).getByRole('option'));
    expect(screen.getByRole('region', { name: 'Rooms in Riverside Campus, Riverside Annex' })).toBeInTheDocument();
    expect(document.getElementById('home-site-name')).toBeNull();
  });

  it('reaches each room’s Open with the right arrow, and goes back with the left', async () => {
    const user = userEvent.setup();
    const router = open();
    await user.type(box(), 'shaft l2');
    await screen.findByRole('listbox', { name: 'Search results' });
    await user.keyboard('{ArrowDown}{ArrowRight}');
    const openLink = screen.getByRole('link', { name: 'Open Shaft L2' });
    expect(openLink).toHaveFocus();
    expect(box()).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(box()).toHaveFocus();
    expect(activeOption()).toHaveTextContent(/^Shaft L2/);
    await user.keyboard('{ArrowRight}{Enter}');
    expect(router.state.location.pathname).toBe(`/rooms/${roomOf('Shaft L2').id}/plan`);
  });

  it('Enter with nothing highlighted still goes to the top match', async () => {
    const user = userEvent.setup();
    const router = open();
    await user.type(box(), 'mdf');
    await screen.findByRole('listbox', { name: 'Search results' });
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe(`/rooms/${roomOf('MDF-1').id}/plan`);
  });

  it('Escape closes the list, a second Escape clears the search; Tab and a click outside close it', async () => {
    const user = userEvent.setup();
    open();
    await user.type(box(), 'mdf');
    await screen.findByRole('listbox', { name: 'Search results' });
    await user.keyboard('{Escape}');
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box()).toHaveValue('mdf');
    await user.keyboard('{Escape}');
    expect(box()).toHaveValue('');
    await user.type(box(), 'mdf');
    await screen.findByRole('listbox', { name: 'Search results' });
    await user.tab();
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(box());
    await screen.findByRole('listbox', { name: 'Search results' });
    await user.click(screen.getByRole('heading', { level: 1, name: 'Workspace' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box()).toHaveValue('mdf');
  });

  it('says plainly when nothing matches, with a hint and Clear', async () => {
    const user = userEvent.setup();
    open();
    await user.type(box(), 'xyz');
    expect(await screen.findByText('No site, room or project matches “xyz”')).toBeInTheDocument();
    expect(screen.getByText('Check the spelling, or search by a site or room name.')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(box()).toHaveValue('');
    expect(box()).toHaveFocus();
  });

  it('finds Thai names typed without tone marks, and speaks Thai', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.getState().replace(withThai());
    await act(() => useLangStore.getState().setLang('th'));
    open();
    const thai = screen.getByRole('combobox', { name: 'ค้นหาไซต์ ห้อง และโปรเจกต์' });
    await user.type(thai, 'หองเซิรฟเวอร');
    const listbox = await screen.findByRole('listbox', { name: 'ผลการค้นหา' });
    const option = within(within(listbox).getByRole('group', { name: /^ห้อง/ })).getByRole('option');
    expect(option).toHaveTextContent('ห้องเซิร์ฟเวอร์ ชั้น 3');
    expect(option.querySelector('mark')).toHaveTextContent('ห้องเซิร์ฟเวอร์');
    // Not on the map: no way to show it there.
    expect(within(listbox).queryByRole('option', { name: /แผนที่/ })).toBeNull();
  });
});
