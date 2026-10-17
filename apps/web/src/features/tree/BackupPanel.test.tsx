import { createWorkspace, exportBackup } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';
import { BackupPanel } from './BackupPanel';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

it('reminds, backs up and records the time', async () => {
  const user = userEvent.setup();
  render(<BackupPanel />);
  expect(screen.getByText('Not backed up yet.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Back up workspace' }));
  expect(URL.createObjectURL).toHaveBeenCalled();
  expect(useWorkspaceStore.getState().workspace.lastBackupAt).not.toBeNull();
  expect(screen.getByText('Backed up today.')).toBeInTheDocument();
});

it('restores only after confirmation, and a bad file changes nothing', async () => {
  const user = userEvent.setup();
  render(<BackupPanel />);
  const before = useWorkspaceStore.getState().workspace;
  await user.upload(screen.getByLabelText('Choose a backup file'), new File(['{"nope":true}'], 'b.json'));
  expect(await screen.findByRole('alert')).toHaveTextContent("This isn't a Glasshouse workspace backup.");
  expect(useWorkspaceStore.getState().workspace).toBe(before);

  const backup = exportBackup(createWorkspace(), '2026-10-01T00:00:00.000Z');
  await user.upload(screen.getByLabelText('Choose a backup file'), new File([JSON.stringify(backup)], 'b.json'));
  const confirm = await screen.findByRole('group', { name: 'Confirm restore' });
  expect(confirm).toHaveTextContent('0 projects');
  expect(useWorkspaceStore.getState().workspace).toBe(before);
  await user.click(screen.getByRole('button', { name: 'Replace workspace' }));
  expect(useWorkspaceStore.getState().workspace.projects).toEqual([]);
});

it('refuses a restore in the words for why the tab is read-only', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().setReadOnly(true, 'view-only');
  render(<BackupPanel />);
  const backup = exportBackup(createWorkspace(), '2026-10-01T00:00:00.000Z');
  await user.upload(screen.getByLabelText('Choose a backup file'), new File([JSON.stringify(backup)], 'b.json'));
  await user.click(await screen.findByRole('button', { name: 'Replace workspace' }));
  expect(screen.getByRole('alert')).toHaveTextContent('You can view this workspace. Ask an admin for edit access.');
  expect(useWorkspaceStore.getState().workspace.projects).toHaveLength(1);
});
