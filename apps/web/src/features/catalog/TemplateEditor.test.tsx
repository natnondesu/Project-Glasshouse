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
