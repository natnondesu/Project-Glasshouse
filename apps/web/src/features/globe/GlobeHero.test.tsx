import { createWorkspace, withSample, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
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
import { parseGeo } from './geoData';

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

const open = (path = '/') => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { ...render(<RouterProvider router={router} />), router };
};
const siteId = (name: string): string => useWorkspaceStore.getState().workspace.projects.flatMap((p) => p.sites).find((s) => s.name === name)!.id;
/** The floating site card's heading (the numbers' heading names the site too). */
const card = (name: string): HTMLElement => {
  const heading = document.getElementById('home-site-name');
  expect(heading).toHaveTextContent(name);
  return heading!;
};
const showNotPlaced = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /^Not placed yet/ }));
const map = () => screen.findByRole('application', { name: /^Map\./ });
const crumbs = () => screen.getByRole('navigation', { name: 'Map level' });
const silenceBoundary = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Home’s globe hero', () => {
  it('shows the workspace, a picked site’s card and its rooms at once, and says the map is on its way', async () => {
    load(sample());
    open(`/?scope=site:${siteId('Bangna campus')}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Workspace' })).toBeInTheDocument();
    expect(card('Bangna campus')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rooms in Bangna campus' })).toBeInTheDocument();
    expect(screen.getByText('Loading the map…')).toBeInTheDocument();
    await map();
    expect(screen.queryByText('Loading the map…')).toBeNull();
  });

  it('says honestly when the map is unavailable, and keeps the card and the rooms', async () => {
    silenceBoundary();
    geo.fail = true;
    load(sample());
    open(`/?scope=site:${siteId('Bangna campus')}`);
    expect(await screen.findByText('Map unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(card('Bangna campus')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rooms in Bangna campus' })).toBeInTheDocument();
  });

  it('opens a region scope out to everything when the map can’t say which sites it holds', async () => {
    silenceBoundary();
    geo.fail = true;
    load(sample());
    const { router } = open('/?scope=country:TH');
    expect(await screen.findByText('Map unavailable')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Everywhere/ })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(''));
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

  it('opens on the whole world without view parameters, counting everything until a place is picked', async () => {
    load(sample());
    open();
    await map();
    expect(within(crumbs()).getByRole('button', { name: 'World' })).toHaveAttribute('aria-current', 'location');
    // The world view: no country crumb, one count for the country, no scale bar.
    expect(within(crumbs()).queryByRole('button', { name: 'Thailand' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thailand — 3 sites. Show them' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Scale bar/ })).toBeNull();
    expect(screen.getByText(/Map data: Natural Earth · sample sites at illustrative spots/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Everywhere · 3 sites' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'All rooms' })).toBeInTheDocument();
    // No site picked: no card on the map.
    expect(screen.queryByRole('button', { name: /^Close / })).toBeNull();
  });

  it('opens a filtered address framed on its view, as before', async () => {
    load(sample());
    open('/?q=shaft');
    await map();
    // Framed on where the sites are: Thailand is in the crumbs, Bangkok's sites share one count.
    expect(within(crumbs()).getByRole('button', { name: 'Thailand' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bangkok — 1 of 3 sites match. Show them' })).toBeInTheDocument();
  });

  it('comes back to the world by the logo after a room, and Back from the room restores the filtered view', async () => {
    const user = userEvent.setup();
    const ws = sample();
    load(ws);
    const mdf = ws.projects[0]!.sites[0]!.rooms.find((r) => r.name === 'MDF-1')!;
    const { router } = open(`/?q=mdf&scope=site:${siteId('Bangna campus')}`);
    await map();
    await act(() => router.navigate(`/rooms/${mdf.id}/plan`));
    await act(() => router.navigate(-1));
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ q: 'mdf', scope: `site:${siteId('Bangna campus')}` });
    expect(screen.getByRole('combobox', { name: 'Search sites and rooms' })).toHaveValue('mdf');
    expect(card('Bangna campus')).toBeInTheDocument();
    await map();
    expect(within(crumbs()).getByRole('button', { name: 'Bangna campus' })).toHaveAttribute('aria-current', 'location');
    // Into the room again, then the logo: the plain Home is the world view.
    await act(() => router.navigate(`/rooms/${mdf.id}/plan`));
    await user.click(screen.getAllByRole('link', { name: 'Glasshouse' })[0]!);
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('');
    await map();
    expect(within(crumbs()).getByRole('button', { name: 'World' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('button', { name: 'Thailand — 3 sites. Show them' })).toBeInTheDocument();
    expect(document.getElementById('home-site-name')).toBeNull();
  });

  it('flies back out to the world when the logo is clicked on a Home that wandered in', async () => {
    const user = userEvent.setup();
    load(sample());
    const { router } = open();
    await map();
    await user.click(screen.getByRole('button', { name: 'Thailand — 3 sites. Show them' }));
    await user.click(await screen.findByRole('button', { name: 'Bangkok — 3 sites. Show them' }));
    await waitFor(() => expect(router.state.location.search).toBe('?scope=province%3ATH-10'));
    expect(screen.getByRole('img', { name: /^Scale bar/ })).toBeInTheDocument();
    await user.click(screen.getAllByRole('link', { name: 'Glasshouse' })[0]!);
    expect(router.state.location.search).toBe('');
    expect(await screen.findByRole('button', { name: 'Thailand — 3 sites. Show them' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Scale bar/ })).toBeNull();
    expect(within(crumbs()).getByRole('button', { name: 'World' })).toHaveAttribute('aria-current', 'location');
    // Wandering by hand (no scope change), then the logo on the plain address: still the world again.
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await waitFor(() => expect(screen.getByRole('img', { name: /^Scale bar/ })).toBeInTheDocument());
    await user.click(screen.getAllByRole('link', { name: 'Glasshouse' })[0]!);
    await waitFor(() => expect(screen.queryByRole('img', { name: /^Scale bar/ })).toBeNull());
  });

  it('picks the last room in a site’s card when that site is picked', async () => {
    const ws = sample();
    load(ws);
    const comms = ws.projects[1]!.sites[1]!.rooms[0]!;
    localStorage.setItem('glasshouse:last-room', comms.id);
    open(`/?scope=site:${siteId('Riverside Annex')}`);
    expect(card('Riverside Annex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Comms Room in 3D' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('flies in from the keyboard: the count splits into sites, a site is picked, the breadcrumb follows', async () => {
    const user = userEvent.setup();
    load(sample());
    open();
    await map();
    screen.getByRole('button', { name: 'Thailand — 3 sites. Show them' }).focus();
    await user.keyboard('{Enter}');
    (await screen.findByRole('button', { name: 'Bangkok — 3 sites. Show them' })).focus();
    await user.keyboard('{Enter}');
    const campus = await screen.findByRole('button', { name: /^Riverside Campus, Sample · Riverside Campus, 4 rooms$/ });
    // The count held all of Bangkok's sites: the numbers and rooms follow it there.
    expect(screen.getByRole('heading', { level: 2, name: 'Bangkok · 3 sites' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rooms in Bangkok' })).toBeInTheDocument();
    expect(within(crumbs()).getByRole('button', { name: 'Bangkok' })).toHaveAttribute('aria-current', 'location');
    campus.focus();
    await user.keyboard('{Enter}');
    expect(card('Riverside Campus')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Numbers for Riverside Campus' })).toBeInTheDocument();
    expect(campus).toHaveAttribute('aria-pressed', 'true');
    const trail = within(crumbs()).getAllByRole('button').map((b) => b.textContent);
    expect(trail).toEqual(['World', 'Thailand', 'Bangkok', 'Riverside Campus']);
    expect(within(crumbs()).getByRole('button', { name: 'Riverside Campus' })).toHaveAttribute('aria-current', 'location');
    // Back out to the world: one marker for the country.
    within(crumbs()).getByRole('button', { name: 'World' }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: 'Thailand — 3 sites. Show them' })).toBeInTheDocument();
    expect(within(crumbs()).getByRole('button', { name: 'World' })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('heading', { level: 2, name: 'Everywhere · 3 sites' })).toBeInTheDocument();
  });

  it('scopes the numbers and the rooms to a country from its count, and Show all clears it', async () => {
    const user = userEvent.setup();
    load(sample());
    const { router } = open();
    await map();
    await user.click(within(crumbs()).getByRole('button', { name: 'World' }));
    await user.click(await screen.findByRole('button', { name: 'Thailand — 3 sites. Show them' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Thailand · 3 sites' })).toBeInTheDocument();
    const rooms = screen.getByRole('region', { name: 'Rooms in Thailand' });
    expect(within(rooms).getAllByRole('article')).toHaveLength(7);
    await waitFor(() => expect(router.state.location.search).toBe('?scope=country%3ATH'));
    await user.click(within(rooms).getByRole('button', { name: 'Show all' }));
    expect(screen.getByRole('region', { name: 'All rooms' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('floats a picked site’s card over the map, and closing it steps up to the site’s province', async () => {
    const user = userEvent.setup();
    load(sample());
    open(`/?scope=site:${siteId('Bangna campus')}`);
    await map();
    const rooms = screen.getByRole('region', { name: 'Rooms in Bangna campus' });
    expect(within(rooms).getAllByRole('article')).toHaveLength(2);
    // One site in scope: rooms can be added to it.
    expect(within(rooms).getByRole('button', { name: /^New room in Bangna campus/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close Bangna campus' }));
    expect(document.getElementById('home-site-name')).toBeNull();
    expect(screen.getByRole('region', { name: 'Rooms in Bangkok' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^New room in/ })).toBeNull();
  });

  it('switches the room in the card by its row or by next, never by itself', async () => {
    const user = userEvent.setup();
    load(sample());
    open(`/?scope=site:${siteId('Bangna campus')}`);
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
    const user = userEvent.setup();
    const { unmount } = open();
    await map();
    expect(screen.getByText('No site is on the map yet.')).toBeInTheDocument();
    await showNotPlaced(user);
    const list = screen.getByRole('region', { name: /Not placed yet/ });
    expect(within(list).getByRole('button', { name: 'Place Warehouse 2 on the map' })).toBeInTheDocument();
    unmount();
    useAuthStore.setState({ status: 'signed-in', user: { id: 'u', name: 'Vee', email: 'v@x', role: 'viewer', mustChangePassword: false } });
    open();
    await showNotPlaced(user);
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
    await showNotPlaced(user);
    await user.click(screen.getByRole('button', { name: 'Place Warehouse 2 on the map' }));
    const banner = screen.getByRole('region', { name: 'Place Warehouse 2 on the map' });
    expect(banner).toHaveTextContent('Zoom in to the province first');
    // Place mode takes focus to the map, so the keys work at once.
    const view = screen.getByRole('application');
    expect(view).toHaveFocus();
    for (let i = 0; i < 10 && !banner.textContent?.includes('Click again'); i++) await user.keyboard('+');
    expect(banner).toHaveTextContent('Click again to move the pin');
    await user.keyboard('{Enter}');
    // The world view opens over South-East Asia (12° N, 100° E), and zooming with the keys keeps its middle: the pin
    // lands exactly there.
    const [lat, lon] = [12, 100];
    expect(banner).toHaveTextContent(`${lat.toFixed(5)}° N, ${lon.toFixed(5)}° E`);
    await user.click(within(banner).getByRole('button', { name: 'Save location' }));
    const site = useWorkspaceStore.getState().workspace.projects.find((p) => p.id === 'p')!.sites[0]!;
    expect(site.location!.lat).toBeCloseTo(lat, 5);
    expect(site.location!.lon).toBeCloseTo(lon, 5);
    expect(screen.queryByRole('button', { name: /^Not placed yet/ })).toBeNull();
    expect(card('Warehouse 2')).toBeInTheDocument();
    // The Place button left with the list: focus goes to the site's new pin.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Warehouse 2, Acme, 0 rooms' })).toHaveFocus());
  });

  it('leaves Place mode on Escape from anywhere and gives focus back to the Not placed yet button', async () => {
    const user = userEvent.setup();
    load(sample());
    send({ type: 'project/create', id: 'p', name: 'Acme' });
    send({ type: 'site/create', projectId: 'p', id: 's', name: 'Warehouse 2' });
    open();
    await map();
    await showNotPlaced(user);
    const placeButton = screen.getByRole('button', { name: /^Not placed yet/ });
    await user.click(screen.getByRole('button', { name: 'Place Warehouse 2 on the map' }));
    expect(screen.getByRole('region', { name: 'Place Warehouse 2 on the map' })).toBeInTheDocument();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Place Warehouse 2 on the map' })).toBeNull();
    await waitFor(() => expect(placeButton).toHaveFocus());
  });

  it('keeps Place mode under StrictMode’s double effects', async () => {
    load(sample());
    send({ type: 'project/create', id: 'p', name: 'Acme' });
    send({ type: 'site/create', projectId: 'p', id: 's', name: 'Warehouse 2' });
    useLocationStore.getState().place('s');
    render(
      <StrictMode>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
      </StrictMode>,
    );
    expect(await screen.findByRole('region', { name: 'Place Warehouse 2 on the map' })).toBeInTheDocument();
    expect(useLocationStore.getState().placing).toBe('s');
  });

  it('lists sites that zooming can never split, instead of flying in', async () => {
    const user = userEvent.setup();
    load(createWorkspace());
    send({ type: 'project/create', id: 'p', name: 'Acme' });
    // About 50 m apart: still under 40 px at the closest zoom.
    send({ type: 'site/create', projectId: 'p', id: 'a', name: 'Hall A' });
    send({ type: 'site/create', projectId: 'p', id: 'b', name: 'Hall B' });
    send({ type: 'site/locate', siteId: 'a', location: { lat: 18.7883, lon: 98.9853 } });
    send({ type: 'site/locate', siteId: 'b', location: { lat: 18.7887, lon: 98.9855 } });
    open();
    await map();
    // From the world view each count flies closer, until no zoom can split the two.
    for (let i = 0; i < 8 && !screen.queryByRole('group', { name: 'These sites share one spot' }); i++) await user.click(screen.getByRole('button', { name: /— 2 sites\. Show them$/ }));
    const chooser = screen.getByRole('group', { name: 'These sites share one spot' });
    expect(within(chooser).getByRole('button', { name: 'Hall A' })).toHaveFocus();
    await user.click(within(chooser).getByRole('button', { name: 'Hall B' }));
    expect(card('Hall B')).toBeInTheDocument();
  });

  it('brings a site into view and picks it once its location is saved in the dialog', async () => {
    const user = userEvent.setup();
    load(sample());
    send({ type: 'project/create', id: 'p', name: 'Acme' });
    send({ type: 'site/create', projectId: 'p', id: 's', name: 'Sydney office' });
    open();
    await map();
    await user.click(screen.getByRole('button', { name: 'Location of Sydney office' }));
    await user.type(screen.getByRole('textbox', { name: 'Google Maps link or coordinates' }), '-33.8688, 151.2093');
    await user.click(screen.getByRole('button', { name: 'Save location' }));
    expect(card('Sydney office')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Sydney office, Acme, 0 rooms' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('zooms with a plain wheel only while the pointer is over the map and it has focus', async () => {
    load(sample());
    open();
    const view = await map();
    const root = view.parentElement!;
    // The world view has no scale bar; any zoom in brings one.
    const scale = () => screen.queryByRole('img', { name: /^Scale bar/ })?.getAttribute('aria-label') ?? null;
    const before = scale();
    fireEvent.pointerEnter(root);
    fireEvent.wheel(root, { deltaY: -400 });
    expect(scale()).toBe(before);
    expect(screen.getByText(/scroll to zoom, or click the map first/)).toBeInTheDocument();
    expect(screen.getByText(/^Hold (Ctrl|Cmd) and scroll/)).toBeInTheDocument();
    fireEvent.pointerDown(view, { button: 0, pointerId: 1 });
    view.focus();
    fireEvent.wheel(root, { deltaY: -800 });
    const zoomed = scale();
    expect(zoomed).not.toBe(before);
    // Leaving the map disarms it, even though focus stays inside.
    fireEvent.pointerLeave(root);
    fireEvent.pointerEnter(root);
    fireEvent.wheel(root, { deltaY: -400 });
    expect(scale()).toBe(zoomed);
    // Firefox reports lines, not pixels: it zooms all the same.
    fireEvent.wheel(root, { deltaY: -10, deltaMode: 1, ctrlKey: true });
    expect(scale()).not.toBe(zoomed);
  });

  it('leaves the wheel to the site card floating on the map, so its room list scrolls, even with the map armed', async () => {
    load(sample());
    open(`/?scope=site:${siteId('Bangna campus')}`);
    const view = await map();
    const root = view.parentElement!;
    const scale = () => screen.getByRole('img', { name: /^Scale bar/ }).getAttribute('aria-label');
    fireEvent.pointerEnter(root);
    fireEvent.pointerDown(view, { button: 0, pointerId: 1 });
    view.focus();
    const before = scale();
    const card = document.querySelector<HTMLElement>('.globe-sitecard')!;
    const wheel = new WheelEvent('wheel', { deltaY: -400, bubbles: true, cancelable: true });
    card.querySelector('h2')!.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(scale()).toBe(before);
    expect(screen.queryByText(/scroll to zoom, or click the map first/)).toBeNull();
  });

  it('rings the selected pin without the pulse under reduced motion', async () => {
    load(sample());
    open(`/?scope=site:${siteId('Bangna campus')}`);
    await map();
    const pin = await screen.findByRole('button', { name: /^Bangna campus,/ });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    expect(pin.closest('li')!.querySelector('.globe-marker__pulse')).toBeNull();
  });

  it('narrows the pins, the numbers and the rooms as the search is typed, without moving the globe', async () => {
    const user = userEvent.setup();
    load(sample());
    const { router } = open();
    await map();
    const scale = screen.queryByRole('img', { name: /^Scale bar/ })?.getAttribute('aria-label');
    const marker = () => screen.getByRole('button', { name: /^Thailand — / }).closest('li')!.style.transform;
    const before = marker();
    const trail = within(crumbs()).getAllByRole('button').map((b) => b.textContent);
    await user.keyboard('/');
    expect(screen.getByRole('combobox', { name: 'Search sites and rooms' })).toHaveFocus();
    await user.keyboard('shaft');
    expect(screen.getByRole('button', { name: 'Thailand — 1 of 3 sites match. Show them' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Everywhere · 1 site · matching “shaft”' })).toBeInTheDocument();
    const rooms = screen.getByRole('region', { name: 'All rooms' });
    expect(within(rooms).getAllByRole('article').map((a) => within(a).getByRole('heading').textContent)).toEqual(['Shaft L1', 'Shaft L2', 'Shaft L3']);
    // The globe hasn't moved: same zoom, same marker position, same crumbs.
    expect(screen.queryByRole('img', { name: /^Scale bar/ })?.getAttribute('aria-label')).toBe(scale);
    expect(marker()).toBe(before);
    expect(within(crumbs()).getAllByRole('button').map((b) => b.textContent)).toEqual(trail);
    // Assistive tech hears what is left.
    const results = document.querySelector('.home-results')!;
    expect(results).toHaveAttribute('role', 'status');
    await waitFor(() => expect(results).toHaveTextContent('3 rooms in 1 site'));
    await waitFor(() => expect(router.state.location.search).toBe('?q=shaft'));
    // Show 1 match flies to it.
    await user.click(screen.getByRole('button', { name: 'Show 1 match' }));
    await waitFor(() => expect(screen.queryByRole('img', { name: /^Scale bar/ })?.getAttribute('aria-label')).not.toBe(scale));
    // Escape closes the dropdown, a second Escape clears it.
    await user.click(screen.getByRole('combobox', { name: 'Search sites and rooms' }));
    await user.keyboard('{Escape}{Escape}');
    expect(screen.getByRole('heading', { level: 2, name: 'Everywhere · 3 sites' })).toBeInTheDocument();
    await user.keyboard('mdf{Enter}');
    expect(router.state.location.pathname).toMatch(/^\/rooms\/.+\/plan$/);
  });

  it('fades the pins a search doesn’t keep, and Enter on a site picks it', async () => {
    const user = userEvent.setup();
    load(sample());
    open(`/?scope=province:TH-10`);
    await map();
    expect(await screen.findByRole('button', { name: /^Bangna campus,/ })).toBeInTheDocument();
    await user.type(screen.getByRole('combobox', { name: 'Search sites and rooms' }), 'riverside campus');
    expect(screen.getByRole('button', { name: /^Bangna campus,/ }).closest('li')).toHaveClass('is-dim');
    expect(document.querySelectorAll('.globe-marker:not(.is-dim)').length).toBeGreaterThan(0);
    // A faded pin says so to assistive tech.
    expect(screen.getByRole('button', { name: /^Bangna campus, .*, no match$/ })).toBeInTheDocument();
    const scale = screen.getByRole('img', { name: /^Scale bar/ }).getAttribute('aria-label');
    await user.keyboard('{Enter}');
    expect(card('Riverside Campus')).toBeInTheDocument();
    // Enter on a site flies to it.
    await waitFor(() => expect(screen.getByRole('img', { name: /^Scale bar/ }).getAttribute('aria-label')).not.toBe(scale));
  });

  it('reads the search, the scope and the chip from the address, and offers Clear filters when nothing matches', async () => {
    const user = userEvent.setup();
    load(sample());
    const { router } = open('/?q=shaft&rooms=approved');
    expect(screen.getByRole('combobox', { name: 'Search sites and rooms' })).toHaveValue('shaft');
    const rooms = screen.getByRole('region', { name: 'All rooms' });
    expect(within(rooms).getByRole('button', { name: /^Approved/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(rooms).getByRole('button', { name: /^All/ })).toHaveTextContent('3');
    expect(within(rooms).getAllByRole('article')).toHaveLength(1);
    await user.click(within(rooms).getByRole('button', { name: /^Needs attention/ }));
    expect(within(rooms).getByText('No rooms match “shaft” here.')).toBeInTheDocument();
    await user.click(within(rooms).getByRole('button', { name: 'Clear filters' }));
    expect(within(rooms).getAllByRole('article')).toHaveLength(7);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('follows the address when it changes from outside: the logo resets Home, back and forward restore the view', async () => {
    const user = userEvent.setup();
    load(sample());
    const { router } = open('/?q=shaft');
    expect(screen.getByRole('combobox', { name: 'Search sites and rooms' })).toHaveValue('shaft');
    await user.click(screen.getAllByRole('link', { name: 'Glasshouse' })[0]!);
    expect(screen.getByRole('combobox', { name: 'Search sites and rooms' })).toHaveValue('');
    const rooms = () => screen.getByRole('region', { name: 'All rooms' });
    expect(within(rooms()).getAllByRole('article')).toHaveLength(7);
    await user.click(within(rooms()).getByRole('button', { name: /^Draft/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?rooms=draft'));
    await user.click(within(rooms()).getByRole('button', { name: /^Approved/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?rooms=approved'));
    await act(() => router.navigate(-1));
    expect(within(rooms()).getByRole('button', { name: /^Draft/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(rooms()).getAllByRole('article')).toHaveLength(5);
    await act(() => router.navigate(1));
    expect(within(rooms()).getByRole('button', { name: /^Approved/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes the card with Escape and gives focus to the site’s pin', async () => {
    const user = userEvent.setup();
    load(sample());
    open(`/?scope=site:${siteId('Bangna campus')}`);
    await map();
    screen.getByRole('button', { name: 'Close Bangna campus' }).focus();
    await user.keyboard('{Escape}');
    expect(document.getElementById('home-site-name')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Bangna campus,/ })).toHaveFocus());
  });

  it('leads the Before approval count to the rooms that need attention', async () => {
    const user = userEvent.setup();
    load(sample());
    open();
    await user.click(screen.getByRole('button', { name: /^3 blocking/ }));
    const rooms = screen.getByRole('region', { name: 'All rooms' });
    expect(within(rooms).getByRole('button', { name: /^Needs attention/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(rooms).getAllByRole('article')).toHaveLength(2);
  });

  it('speaks Thai on the map: province and country names from the data and the browser', async () => {
    load(sample());
    await act(() => useLangStore.getState().setLang('th'));
    open();
    await screen.findByRole('application');
    await userEvent.click(screen.getByRole('button', { name: 'ไทย — 3 ไซต์ ดูทั้งหมด' }));
    expect(within(screen.getByRole('navigation', { name: 'ระดับแผนที่' })).getByRole('button', { name: 'ไทย' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'กรุงเทพมหานคร — 3 ไซต์ ดูทั้งหมด' })).toBeInTheDocument();
  });

  describe('with motion', () => {
    beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })));
    const marker = () => screen.getByRole('button', { name: 'Thailand — 3 sites. Show them' }).closest('li')!;
    // React follows the pointer through over/out events; leave/enter go to native listeners too.
    const enter = (el: HTMLElement): void => {
      fireEvent.pointerOver(el, { relatedTarget: document.body });
      fireEvent.pointerEnter(el);
    };
    const leave = (el: HTMLElement): void => {
      fireEvent.pointerOut(el, { relatedTarget: document.body });
      fireEvent.pointerLeave(el);
    };
    const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
    /** Turning: the marker moves within a second and a half (jsdom's frames are slow). Still: it holds for half a second. */
    const moves = async (): Promise<boolean> => {
      await wait(120);
      const start = marker().style.transform;
      for (let t = 0; t < 1500; t += 100) {
        await wait(100);
        if (marker().style.transform !== start) return true;
      }
      return false;
    };
    const still = async (): Promise<boolean> => {
      await wait(150);
      const start = marker().style.transform;
      await wait(500);
      return marker().style.transform === start;
    };

    it('pulses the selected pin while its site is picked', async () => {
      load(sample());
      open(`/?scope=site:${siteId('Bangna campus')}`);
      const pin = await screen.findByRole('button', { name: /^Bangna campus,/ });
      expect(pin.closest('li')!.querySelector('.globe-marker__pulse')).not.toBeNull();
      expect(screen.getByRole('button', { name: /^Riverside Campus,/ }).closest('li')!.querySelector('.globe-marker__pulse')).toBeNull();
    });

    it('turns the world view slowly, and stops for a pointer, focus or the pause button', async () => {
      const user = userEvent.setup();
      load(sample());
      open();
      const view = await map();
      const root = view.parentElement!;
      await user.click(within(crumbs()).getByRole('button', { name: 'World' }));
      leave(root);
      (document.activeElement as HTMLElement).blur();
      await screen.findByRole('button', { name: 'Thailand — 3 sites. Show them' }, { timeout: 3000 });
      await wait(1600);
      expect(await moves()).toBe(true);
      enter(root);
      expect(await still()).toBe(true);
      leave(root);
      expect(await moves()).toBe(true);
      act(() => view.focus());
      expect(await still()).toBe(true);
      act(() => view.blur());
      const pause = screen.getByRole('button', { name: 'Stop the globe turning' });
      await user.click(pause);
      leave(root);
      act(() => (document.activeElement as HTMLElement).blur());
      expect(await still()).toBe(true);
      expect(screen.getByRole('button', { name: 'Turn the globe' })).toHaveAttribute('aria-pressed', 'true');
    }, 15_000);
  });
});
