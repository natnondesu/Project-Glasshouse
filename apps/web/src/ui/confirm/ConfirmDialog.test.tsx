import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { confirmAction } from './confirmStore';
import { ConfirmDialog } from './ConfirmDialog';

const ask = () => confirmAction({ title: 'Delete RK-01?', body: 'RK-01 and its 3 Devices are removed.', confirmLabel: 'Delete' });

it('confirms with Enter on the focused Delete button', async () => {
  const user = userEvent.setup();
  render(<ConfirmDialog />);
  let answer: Promise<boolean> = Promise.resolve(false);
  act(() => void (answer = ask()));
  const dialog = screen.getByRole('alertdialog', { name: 'Delete RK-01?' });
  expect(dialog).toHaveAccessibleDescription('RK-01 and its 3 Devices are removed.');
  expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(await answer).toBe(true);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('cancels on Escape, keeps Tab inside, and a second ask cancels the first', async () => {
  const user = userEvent.setup();
  render(<ConfirmDialog />);
  let first: Promise<boolean> = Promise.resolve(true);
  act(() => void (first = ask()));
  await user.keyboard('{Tab}');
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.keyboard('{Tab}');
  expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  let second: Promise<boolean> = Promise.resolve(true);
  act(() => void (second = ask()));
  expect(await first).toBe(false);
  await user.keyboard('{Escape}');
  expect(await second).toBe(false);
});
