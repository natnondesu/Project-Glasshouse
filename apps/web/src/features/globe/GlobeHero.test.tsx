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
    const placeButton = screen.getByRole('button', { name: 'Place Warehouse 2 on the map' });
    await user.click(placeButton);
    const banner = screen.getByRole('region', { name: 'Place Warehouse 2 on the map' });
    expect(banner).toHaveTextContent('Zoom in to the province first');
    // Place mode takes focus to the map, so the keys work at once.
    const view = screen.getByRole('application');
    expect(view).toHaveFocus();
    for (let i = 0; i < 6; i++) await user.keyboard('+');
    expect(banner).toHaveTextContent('Click again to move the pin');
    await user.keyboard('{Enter}');
    // The opening frame is Thailand's box, and zooming with the keys keeps its middle: the pin lands exactly there.
    const thailand = parseGeo(countries as never, provinces as never).countries.find((c) => c.code === 'TH')!;
    const [[w, south], [e, north]] = thailand.box;
    const lat = (south + north) / 2;
    const lon = (w + e) / 2;
    expect(banner).toHaveTextContent(`${lat.toFixed(5)}° N, ${lon.toFixed(5)}° E`);
    await user.click(within(banner).getByRole('button', { name: 'Save location' }));
    const site = useWorkspaceStore.getState().workspace.projects.find((p) => p.id === 'p')!.sites[0]!;
    expect(site.location!.lat).toBeCloseTo(lat, 5);
    expect(site.location!.lon).toBeCloseTo(lon, 5);
    expect(screen.queryByRole('region', { name: /Not placed yet/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Warehouse 2' })).toBeInTheDocument();
    // The Place button left with the list: focus goes to the site's new pin.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Warehouse 2, Acme, 0 rooms' })).toHaveFocus());
  });

  it('leaves Place mode on Escape from anywhere and gives focus back to the Place button', async () => {
    const user = userEvent.setup();
    load(sample());
    send({ type: 'project/create', id: 'p', name: 'Acme' });
    send({ type: 'site/create', projectId: 'p', id: 's', name: 'Warehouse 2' });
    open();
    await map();
    const placeButton = screen.getByRole('button', { name: 'Place Warehouse 2 on the map' });
    await user.click(placeButton);
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
    await user.click(screen.getByRole('button', { name: /— 2 sites\. Show them$/ }));
    const chooser = screen.getByRole('group', { name: 'These sites share one spot' });
    expect(within(chooser).getByRole('button', { name: 'Hall A' })).toHaveFocus();
    await user.click(within(chooser).getByRole('button', { name: 'Hall B' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Hall B' })).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { level: 1, name: 'Sydney office' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Sydney office, Acme, 0 rooms' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('zooms with a plain wheel only while the pointer is over the map and it has focus', async () => {
    load(sample());
    open();
    const view = await map();
    const root = view.parentElement!;
    const scale = () => screen.getByRole('img', { name: /^Scale bar/ }).getAttribute('aria-label');
    const before = scale();
    fireEvent.pointerEnter(root);
    fireEvent.wheel(root, { deltaY: -400 });
    expect(scale()).toBe(before);
    expect(screen.getByText(/scroll to zoom, or click the map first/)).toBeInTheDocument();
    expect(screen.getByText(/^Hold (Ctrl|Cmd) and scroll/)).toBeInTheDocument();
    fireEvent.pointerDown(view, { button: 0, pointerId: 1 });
    view.focus();
    fireEvent.wheel(root, { deltaY: -400 });
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

  it('speaks Thai on the map: province and country names from the data and the browser', async () => {
    load(sample());
    await act(() => useLangStore.getState().setLang('th'));
    open();
    await screen.findByRole('application');
    expect(within(screen.getByRole('navigation', { name: 'ระดับแผนที่' })).getByRole('button', { name: 'ไทย' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'กรุงเทพมหานคร — 3 ไซต์ ดูทั้งหมด' })).toBeInTheDocument();
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
