import { createWorkspace, withSample, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { resetAuthStore, useAuthStore } from '../../auth/authStore';
import { useLangStore } from '../../i18n/lang';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import countries from './data/countries-50m.topo.json';
import provinces from './data/thailand-provinces-10m.topo.json';
import { useLocationStore } from './locationStore';

const geo = vi.hoisted(() => ({ fail: false }));
vi.mock('./geoData', async (importOriginal) => {
  const real = await importOriginal<typeof import('./geoData')>();
  return { ...real, loadGeo: () => (geo.fail ? Promise.reject(new Error('offline')) : Promise.resolve(real.parseGeo(countries as never, provinces as never))) };
});

const AT = '2026-10-18T00:00:00.000Z';
const send = (command: WorkspaceCommand): void => {
  const problem = useWorkspaceStore.getState().dispatch(command);
  if (problem) throw new Error(problem.message);
};
const load = (ws: Workspace): void => useWorkspaceStore.getState().replace(ws);
const sample = (): Workspace => {
  const r = withSample(createWorkspace(), AT);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

beforeEach(() => {
  geo.fail = false;
  localStorage.clear();
  resetAuthStore();
  resetWorkspaceStore();
  useLocationStore.getState().done();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
  // Flights are jump cuts under reduced motion: the tests read where the camera lands, not how it gets there.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.spyOn(console, 'error').mockRestore();
  await act(() => useLangStore.getState().setLang('en'));
});

const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);
const map = () => screen.findByRole('application', { name: /^Map\./ });
const crumbs = () => screen.getByRole('navigation', { name: 'Map level' });
const silenceBoundary = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Home’s globe hero', () => {
  it('shows the site card at once and says the map is on its way', async () => {
    load(sample());
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Bangna campus' })).toBeInTheDocument();
    expect(screen.getByText('Loading the map…')).toBeInTheDocument();
    await map();
    expect(screen.queryByText('Loading the map…')).toBeNull();
  });

  it('says honestly when the map is unavailable, and keeps the card and the rooms', async () => {
    silenceBoundary();
    geo.fail = true;
    load(sample());
    open();
    expect(await screen.findByText('Map unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Bangna campus' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Bangna campus/ })).toBeInTheDocument();
  });

  it('offers the Location dialog when Place on the map was chosen but the map can’t load', async () => {
    silenceBoundary();
    geo.fail = true;
    load(sample());
    send({ type: 'project/create', id: 'p', name: 'Acme' });
    send({ type: 'site/create', projectId: 'p', id: 's', name: 'Warehouse 2' });
    useLocationStore.getState().place('s');
    open();
    expect(await screen.findByRole('dialog', { name: 'Where is Warehouse 2?' })).toBeInTheDocument();
  });

  it('opens framed on the country of the sites with the last room’s site selected and its room in the card', async () => {
    const ws = sample();
    load(ws);
    const comms = ws.projects[1]!.sites[1]!.rooms[0]!;
    localStorage.setItem('glasshouse:last-room', comms.id);
    open();
    await map();
    expect(screen.getByRole('heading', { level: 1, name: 'Riverside Annex' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Comms Room in 3D' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(crumbs()).getByRole('button', { name: 'Thailand' })).toHaveAttribute('aria-current', 'location');
    // All three sample sites sit in Bangkok: one count marker, named for the province.
    expect(screen.getByRole('button', { name: 'Bangkok — 3 sites. Show them' })).toBeInTheDocument();
    expect(screen.getByText(/Outlines: Natural Earth · sample sites at illustrative spots/)).toBeInTheDocument();
  });

  it('flies in from the keyboard: the count splits into sites, a site is picked, the breadcrumb follows', async () => {
    const user = userEvent.setup();
    load(sample());
    open();
    await map();
    screen.getByRole('button', { name: 'Bangkok — 3 sites. Show them' }).focus();
    await user.keyboard('{Enter}');
    const campus = await screen.findByRole('button', { name: /^Riverside Campus, Sample · Riverside Campus, 4 rooms$/ });
    expect(screen.getByRole('button', { name: /^Bangna campus,/ })).toHaveAttribute('aria-pressed', 'true');
    campus.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 1, name: 'Riverside Campus' })).toBeInTheDocument();
    expect(campus).toHaveAttribute('aria-pressed', 'true');
    const trail = within(crumbs()).getAllByRole('button').map((b) => b.textContent);
    expect(trail).toEqual(['World', 'Thailand', 'Bangkok', 'Riverside Campus']);
    expect(within(crumbs()).getByRole('button', { name: 'Riverside Campus' })).toHaveAttribute('aria-current', 'location');
    // Back out to the world: one marker for the country.
    within(crumbs()).getByRole('button', { name: 'World' }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Thailand — 3 sites. Show them' })).toBeInTheDocument();
    expect(within(crumbs()).getByRole('button', { name: 'World' })).toHaveAttribute('aria-current', 'location');
  });

  it('switches the room in the card by its row or by next, never by itself', async () => {
    const user = userEvent.setup();
    load(sample());
    open();
    expect(screen.getByRole('button', { name: 'Show Server room A in 3D' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Next room' }));
    expect(screen.getByRole('button', { name: 'Show MDF-1 in 3D' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /^Resolve 2 items/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show Server room A in 3D' }));
    expect(screen.getByRole('link', { name: /^Open Server room A/ })).toBeInTheDocument();
  });

  it('lists sites without a location under the map, with Place for editors only', async () => {
    load(createWorkspace());
    send({ type: 'project/create', id: 'p', name: 'Acme' });
    send({ type: 'site/create', projectId: 'p', id: 's', name: 'Warehouse 2' });
    const { unmount } = open();
    await map();
    expect(screen.getByText('No site is on the map yet.')).toBeInTheDocument();
    const list = screen.getByRole('region', { name: /Not placed yet/ });
    expect(within(list).getByRole('button', { name: 'Place Warehouse 2 on the map' })).toBeInTheDocument();
    unmount();
    useAuthStore.setState({ status: 'signed-in', user: { id: 'u', name: 'Vee', email: 'v@x', role: 'viewer', mustChangePassword: false } });
    open();
    const viewerList = screen.getByRole('region', { name: /Not placed yet/ });
    expect(within(viewerList).queryByRole('button', { name: /^Place/ })).toBeNull();
    expect(viewerList).toHaveTextContent('An editor can place them.');
  });

  it('places a site from the keyboard: zoom to a province, drop the pin at the crosshair, save', async () => {
    const user = userEvent.setup();
    load(sample());
    send({ type: 'project/create', id: 'p', name: 'Acme' });
    send({ type: 'site/create', projectId: 'p', id: 's', name: 'Warehouse 2' });
    open();
    await map();
    await user.click(screen.getByRole('button', { name: 'Place Warehouse 2 on the map' }));
    expect(screen.getByRole('region', { name: 'Place Warehouse 2 on the map' })).toHaveTextContent('Zoom in to the province first');
    const view = screen.getByRole('application');
    view.focus();
    for (let i = 0; i < 6; i++) await user.keyboard('+');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save location' }));
    const site = useWorkspaceStore.getState().workspace.projects.find((p) => p.id === 'p')!.sites[0]!;
    expect(site.location?.lat).toBeCloseTo(13.04, 0);
    expect(site.location?.lon).toBeCloseTo(101.5, 0);
    expect(screen.queryByRole('region', { name: /Not placed yet/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Warehouse 2' })).toBeInTheDocument();
  });

  it('speaks Thai on the map: province and country names from the data and the browser', async () => {
    load(sample());
    await act(() => useLangStore.getState().setLang('th'));
    open();
    await screen.findByRole('application');
    expect(within(screen.getByRole('navigation', { name: 'ระดับแผนที่' })).getByRole('button', { name: 'ไทย' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'กรุงเทพมหานคร — 3 ไซต์ ดูทั้งหมด' })).toBeInTheDocument();
  });
});
