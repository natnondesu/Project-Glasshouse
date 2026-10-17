import { createWorkspace, apply, exportProjectFile } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { downloadJson } from '../ui/files';
import { ClaimLostDialog } from './ClaimLostDialog';
import { resetClaimsStore, useClaimsStore } from './claimsStore';

vi.mock('../ui/files', () => ({ downloadJson: vi.fn() }));

const projectFile = () => {
  const made = apply(createWorkspace(), { type: 'project/create', id: 'p', name: 'Riverside' });
  if (!made.ok) throw new Error(made.error.message);
  const file = exportProjectFile(made.value, 'p', '2026-10-18T00:00:00.000Z');
  if (!file.ok) throw new Error(file.error.message);
  return file.value;
};

beforeEach(() => {
  resetClaimsStore();
  vi.mocked(downloadJson).mockClear();
  // jsdom has no <dialog> modal support; the component falls back to the open attribute.
  HTMLDialogElement.prototype.showModal = undefined as never;
  useClaimsStore.getState().setLost({ roomId: 'r', roomName: 'MDF-1', holderName: 'Ada', changes: 2, file: projectFile() });
});

it('names the room, who took over and how many changes were not saved', () => {
  render(<ClaimLostDialog />);
  expect(screen.getByRole('dialog', { name: 'MDF-1 is being edited by someone else' })).toBeInTheDocument();
  expect(screen.getByText(/Ada took over\. Your last 2 changes to this room weren't saved/)).toBeInTheDocument();
});

it('says "wasn\'t saved" for a single change', () => {
  useClaimsStore.getState().setLost({ ...useClaimsStore.getState().lost!, changes: 1 });
  render(<ClaimLostDialog />);
  expect(screen.getByText(/Your last change to this room wasn't saved/)).toBeInTheDocument();
});

it('puts focus on Download my version, not Dismiss', () => {
  render(<ClaimLostDialog />);
  expect(screen.getByRole('button', { name: 'Download my version' })).toHaveFocus();
});

it('downloads this tab version as a Glasshouse project file', async () => {
  render(<ClaimLostDialog />);
  await userEvent.click(screen.getByRole('button', { name: 'Download my version' }));
  expect(downloadJson).toHaveBeenCalledWith('Riverside - MDF-1 - my version.json', expect.objectContaining({ format: 'glasshouse.project' }));
});

it('closes and forgets the copy on Dismiss', async () => {
  render(<ClaimLostDialog />);
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(useClaimsStore.getState().lost).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});
