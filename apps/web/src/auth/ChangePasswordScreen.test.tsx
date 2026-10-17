import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { ChangePasswordScreen } from './ChangePasswordScreen';

afterEach(() => vi.restoreAllMocks());

it('checks the new password matches, then changes it and signs in', async () => {
  const init = vi.spyOn(useAuthStore.getState(), 'init').mockResolvedValue();
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  render(<ChangePasswordScreen />);
  await userEvent.type(screen.getByLabelText('Temporary password'), 'temp-password-1');
  await userEvent.type(screen.getByLabelText('New password'), 'a-new-long-password');
  await userEvent.type(screen.getByLabelText('New password again'), 'a-different-one!');
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(screen.getByRole('alert')).toHaveTextContent('don’t match');
  expect(fetchSpy).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText('New password again'));
  await userEvent.type(screen.getByLabelText('New password again'), 'a-new-long-password');
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(fetchSpy).toHaveBeenCalledWith('/auth/password', expect.objectContaining({ method: 'POST' }));
  expect(init).toHaveBeenCalled();
});
