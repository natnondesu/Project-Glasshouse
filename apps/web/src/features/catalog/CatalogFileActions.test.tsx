import { exportCatalog, seedTemplates } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
});

const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/catalog'] })} />);

it('exports the catalog as a file', async () => {
  const user = userEvent.setup();
  const blobs: Blob[] = [];
  URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return 'blob:x';
  });
  URL.revokeObjectURL = vi.fn();
  open();
  await user.click(screen.getByRole('button', { name: 'Export catalog' }));
  const json = JSON.parse(await blobs[0]!.text());
  expect(json).toMatchObject({ format: 'glasshouse.catalog' });
  expect(json.templates).toHaveLength(6);
});

it('imports a catalog file after showing what will change', async () => {
  const user = userEvent.setup();
  open();
  const seed = seedTemplates();
  const file = exportCatalog([{ ...seed[0]!, label: 'Core switch 48p' }, { ...seed[1]!, id: 'tpl-ups-3u', label: 'UPS 3U', category: 'power', heightU: 3 }], '2026-10-15T00:00:00.000Z');
  await user.upload(screen.getByLabelText('Choose a catalog file'), new File([JSON.stringify(file)], 'catalog.json'));
  const confirm = await screen.findByRole('group', { name: 'Confirm catalog import' });
  expect(confirm).toHaveTextContent('1 new (UPS 3U) · 1 updated (Core switch 48p) · 0 unchanged');
  await user.click(within(confirm).getByRole('button', { name: 'Import' }));
  const catalog = useWorkspaceStore.getState().workspace.catalog;
  expect(catalog.map((t) => t.label)).toContain('UPS 3U');
  expect(catalog.find((t) => t.id === 'tpl-switch-1u')!.label).toBe('Core switch 48p');
});

it('explains a file that is not a catalog and changes nothing', async () => {
  const user = userEvent.setup();
  open();
  const before = useWorkspaceStore.getState().workspace.catalog;
  await user.upload(screen.getByLabelText('Choose a catalog file'), new File(['{"nope":1}'], 'x.json'));
  expect(await screen.findByRole('alert')).toHaveTextContent("This isn't a Glasshouse catalog file.");
  expect(useWorkspaceStore.getState().workspace.catalog).toBe(before);
});
