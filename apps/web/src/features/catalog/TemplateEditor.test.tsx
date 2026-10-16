import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { blankTemplate, TemplateEditor } from './TemplateEditor';

it('offers the Misc category for passive gear', () => {
  render(<TemplateEditor mode="create" initial={{ ...blankTemplate(), category: 'misc' }} onDone={() => {}} />);
  expect(screen.getByRole('option', { name: 'Misc' })).toBeInTheDocument();
});

it('defines port groups on a template and previews the port names', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  const { resetWorkspaceStore, useWorkspaceStore } = await import('../../store/workspaceStore');
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
  const user = userEvent.setup();
  const t = { ...blankTemplate(), label: 'Edge switch', category: 'network' as const };
  render(<TemplateEditor mode="create" initial={t} onDone={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Add port group' }));
  const count = screen.getByLabelText('Group 1 count');
  await user.clear(count);
  await user.type(count, '48');
  await user.type(screen.getByLabelText('Group 1 name prefix'), 'Gi1/0/');
  expect(screen.getByText('48 ports: Gi1/0/1 – Gi1/0/48')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add port group' }));
  await user.selectOptions(screen.getByLabelText('Group 2 type'), 'sfp_plus');
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  const saved = useWorkspaceStore.getState().workspace.catalog.find((x) => x.id === t.id);
  expect(saved?.ports).toEqual([
    { count: 48, prefix: 'Gi1/0/', start: 1, media: 'rj45', speed: '1G' },
    { count: 1, prefix: 'Gi1/0/', start: 49, media: 'sfp_plus', speed: '1G' },
  ]);
});

it('lays a group out in two rows, odd on top, and draws the front panel as it will look', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  const { within } = await import('@testing-library/react');
  const { resetWorkspaceStore, useWorkspaceStore } = await import('../../store/workspaceStore');
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
  const user = userEvent.setup();
  const t = { ...blankTemplate(), label: 'Access switch', category: 'network' as const, ports: [{ count: 8, prefix: 'Gi', start: 1, media: 'rj45' as const, speed: '1G' }] };
  render(<TemplateEditor mode="create" initial={t} onDone={() => {}} />);
  const panel = screen.getByRole('region', { name: 'Front panel' });
  const order = () => within(panel).getAllByText(/^\d+$/).map((n) => n.textContent);
  expect(order()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  await user.selectOptions(screen.getByLabelText('Group 1 layout'), '2 rows · odd on top');
  // Top row first: the odd jacks, then the even ones under them.
  expect(order()).toEqual(['1', '3', '5', '7', '2', '4', '6', '8']);
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(useWorkspaceStore.getState().workspace.catalog.find((x) => x.id === t.id)?.ports?.[0]).toMatchObject({ rows: 2, order: 'odd_top' });
});
