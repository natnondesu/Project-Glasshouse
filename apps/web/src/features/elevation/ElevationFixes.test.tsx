import { createObject, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = (id: string) => s.workspace.catalog.find((x) => x.id === id) as Template;
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'ch', rackId: 'rk', bottomU: 1, template: t('tpl-chassis-6u') } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/update', id: 'ch', patch: { name: 'Deepvision Test Chassis' } } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'reserved/add', rackId: 'rk', range: { id: 'rsv', label: 'Customer core switching for the north wing', bottomU: 20, heightU: 12, demand: { kind: 'unknown' }, notes: '' } } });
});

const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation'] })} />);

it('keeps long device and reserved-range names inside their blocks, with the full name on hover', () => {
  const { container } = open();
  const name = container.querySelector('[data-elev-id="ch"] .dev__name')!;
  expect(name.textContent).toMatch(/…$/);
  expect(container.querySelector('[data-elev-id="ch"] > title')?.textContent).toContain('Deepvision Test Chassis');
  const sub = container.querySelector('[data-elev-id="rsv"] .rsv__sub')!;
  expect(sub.textContent).toMatch(/…$/);
});

it('collapses the catalog and remembers it', async () => {
  const user = userEvent.setup();
  const { unmount } = open();
  await user.click(screen.getByRole('button', { name: 'Collapse catalog' }));
  expect(screen.queryByRole('button', { name: /^Add Network switch/ })).toBeNull();
  unmount();
  open();
  expect(screen.getByRole('button', { name: 'Expand catalog' })).toHaveAttribute('aria-expanded', 'false');
});
