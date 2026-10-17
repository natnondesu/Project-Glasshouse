import { createWorkspace, apply, exportProjectFile } from '@glasshouse/domain';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { downloadJson } from '../ui/files';
import { ClaimLostDialog } from './ClaimLostDialog';
import { useConfirmStore } from '../ui/confirm/confirmStore';
import { clearClaimsStore, useClaimsStore, type ClaimLost } from './claimsStore';

vi.mock('../ui/files', () => ({ downloadJson: vi.fn() }));

const projectFile = () => {
  const made = apply(createWorkspace(), { type: 'project/create', id: 'p', name: 'Riverside' });
  if (!made.ok) throw new Error(made.error.message);
  const file = exportProjectFile(made.value, 'p', '2026-10-18T00:00:00.000Z');
  if (!file.ok) throw new Error(file.error.message);
  return file.value;
};

const lostOf = (patch: Partial<ClaimLost> = {}): ClaimLost => ({ roomId: 'r', roomName: 'MDF-1', holderName: 'Ada', changes: 2, file: projectFile(), ...patch });
const queue = () => useClaimsStore.getState().lost;
const answerConfirm = async (ok: boolean) => {
  await vi.waitFor(() => expect(useConfirmStore.getState().request).not.toBeNull());
  act(() => useConfirmStore.getState().answer(ok));
};

beforeEach(() => {
  clearClaimsStore();
  useConfirmStore.setState({ request: null, resolve: null });
  vi.mocked(downloadJson).mockClear();
  // jsdom has no <dialog> modal support; the component falls back to the open attribute.
  HTMLDialogElement.prototype.showModal = undefined as never;
  useClaimsStore.getState().pushLost(lostOf());
});

it('names the room, who took over and how many changes were not saved', () => {
  render(<ClaimLostDialog />);
  expect(screen.getByRole('dialog', { name: 'MDF-1 is being edited by someone else' })).toBeInTheDocument();
  expect(screen.getByText(/Ada took over\. Your last 2 changes to this room weren't saved/)).toBeInTheDocument();
});

it('says "wasn\'t saved" for a single change', () => {
  useClaimsStore.setState({ lost: [lostOf({ changes: 1 })] });
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

it('asks before Dismiss throws the copy away, and keeps it on no', async () => {
  render(<ClaimLostDialog />);
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(useConfirmStore.getState().request).toMatchObject({ title: 'Discard your version?', confirmLabel: 'Discard', tone: 'danger' });
  await answerConfirm(false);
  expect(queue()).toHaveLength(1);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('drops the copy on Dismiss once the person confirms the discard', async () => {
  render(<ClaimLostDialog />);
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  await answerConfirm(true);
  await vi.waitFor(() => expect(queue()).toHaveLength(0));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('closes without asking after the file was downloaded', async () => {
  render(<ClaimLostDialog />);
  await userEvent.click(screen.getByRole('button', { name: 'Download my version' }));
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(useConfirmStore.getState().request).toBeNull();
  expect(queue()).toHaveLength(0);
});

it('does not discard on Escape', () => {
  render(<ClaimLostDialog />);
  const dialog = screen.getByRole('dialog');
  const notPrevented = fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(notPrevented).toBe(false);
  expect(useConfirmStore.getState().request).toBeNull();
  expect(queue()).toHaveLength(1);
});

it('shows a second loss after the first is closed, and asks again for it', async () => {
  useClaimsStore.getState().pushLost(lostOf({ roomId: 'q', roomName: 'IDF-2', holderName: 'Bo' }));
  render(<ClaimLostDialog />);
  expect(screen.getByRole('dialog', { name: 'MDF-1 is being edited by someone else' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Download my version' }));
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.getByRole('dialog', { name: 'IDF-2 is being edited by someone else' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(useConfirmStore.getState().request).not.toBeNull();
});

it('queues a loss that arrives while the dialog is open', () => {
  render(<ClaimLostDialog />);
  act(() => useClaimsStore.getState().pushLost(lostOf({ roomId: 'q', roomName: 'IDF-2' })));
  expect(screen.getByRole('dialog', { name: 'MDF-1 is being edited by someone else' })).toBeInTheDocument();
  expect(queue()).toHaveLength(2);
});
