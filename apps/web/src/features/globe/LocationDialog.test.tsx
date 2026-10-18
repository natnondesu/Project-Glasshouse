import { createWorkspace, findSite } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { resetAuthStore, useAuthStore } from '../../auth/authStore';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import countries from './data/countries-50m.topo.json';
import provinces from './data/thailand-provinces-10m.topo.json';
import { useLocationStore } from './locationStore';

// The outlines load as in a browser (jsdom can't fetch them), so Home's map is there to place on.
vi.mock('./geoData', async (importOriginal) => {
  const real = await importOriginal<typeof import('./geoData')>();
  return { ...real, loadGeo: () => Promise.resolve(real.parseGeo(countries as never, provinces as never)) };
});

beforeEach(() => {
  localStorage.clear();
  resetAuthStore();
  resetWorkspaceStore();
  useLocationStore.getState().done();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.replace(createWorkspace());
  for (const command of [
    { type: 'project/create', id: 'p', name: 'Acme' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'Warehouse 2' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa', name: 'MDF' },
  ] as const) {
    const problem = s.dispatch(command);
    if (problem) throw new Error(problem.message);
  }
});

const open = (path = '/') => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
const tree = () => within(screen.getByRole('complementary', { name: 'Projects' }));
const location = () => findSite(useWorkspaceStore.getState().workspace, 's')!.site.location;

it('sets a location from a pasted Google Maps link, showing what it read first', async () => {
  const user = userEvent.setup();
  open();
  await user.click(tree().getByRole('button', { name: 'Location of Warehouse 2' }));
  const dialog = screen.getByRole('dialog', { name: 'Where is Warehouse 2?' });
  const field = within(dialog).getByRole('textbox', { name: 'Google Maps link or coordinates' });
  expect(field).toHaveFocus();
  const save = within(dialog).getByRole('button', { name: 'Save location' });
  expect(save).toBeDisabled();
  await user.type(field, 'Bangna');
  expect(within(dialog).getByRole('status')).toHaveTextContent('No coordinates found.');
  expect(field).toHaveAttribute('aria-invalid', 'true');
  await user.clear(field);
  await user.click(field);
  await user.paste('https://www.google.com/maps/place/X/@13.6,100.6,15z/data=!3d13.6681!4d100.6052');
  expect(within(dialog).getByRole('status')).toHaveTextContent('Reads as 13.66810° N, 100.60520° E');
  await user.click(save);
  expect(location()).toEqual({ lat: 13.6681, lon: 100.6052 });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('explains short links, and takes a site off the map', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'site/locate', siteId: 's', location: { lat: 1, lon: 2 } });
  open();
  await user.click(tree().getByRole('button', { name: 'Location of Warehouse 2' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('On the map at 1.00000° N, 2.00000° E');
  await user.click(within(dialog).getByRole('textbox'));
  await user.paste('https://maps.app.goo.gl/Ab12');
  expect(within(dialog).getByRole('status')).toHaveTextContent("Short links (maps.app.goo.gl) can't be read here");
  await user.click(within(dialog).getByRole('button', { name: 'Take off the map' }));
  expect(location()).toBeUndefined();
});

it('goes to Home to place a site on the map from inside a room', async () => {
  const user = userEvent.setup();
  localStorage.setItem('glasshouse:tree-pinned', 'true');
  const router = createMemoryRouter(routes, { initialEntries: ['/rooms/r/plan'] });
  render(<RouterProvider router={router} />);
  await user.click(tree().getByRole('button', { name: 'Location of Warehouse 2' }));
  await user.click(screen.getByRole('button', { name: 'Place on the map' }));
  expect(router.state.location.pathname).toBe('/');
  expect(useLocationStore.getState().placing).toBe('s');
  expect(await screen.findByRole('region', { name: 'Place Warehouse 2 on the map' })).toBeInTheDocument();
});

it('offers no Location action to viewers, nor on an archived site', async () => {
  const user = userEvent.setup();
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u', name: 'Vee', email: 'v@x', role: 'viewer', mustChangePassword: false } });
  const { unmount } = open();
  expect(tree().queryByRole('button', { name: 'Location of Warehouse 2' })).toBeNull();
  unmount();
  resetAuthStore();
  useWorkspaceStore.getState().dispatch({ type: 'site/archive', siteId: 's', by: 'Ada', at: '2026-10-18T00:00:00.000Z' });
  open();
  await user.click(tree().getByRole('checkbox', { name: /Show archived/ }));
  expect(tree().getByRole('button', { name: 'Restore Warehouse 2' })).toBeInTheDocument();
  expect(tree().queryByRole('button', { name: 'Location of Warehouse 2' })).toBeNull();
});
