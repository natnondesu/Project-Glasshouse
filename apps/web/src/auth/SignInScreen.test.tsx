import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from './authStore';
import { SignInScreen } from './SignInScreen';

beforeEach(() => resetAuthStore());
afterEach(() => vi.restoreAllMocks());

it('offers the company sign-in and the password form the server allows', () => {
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('link', { name: 'Sign in with your company account' })).toHaveAttribute('href', expect.stringMatching(/^\/auth\/oidc\/start\?returnTo=/));
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
});

it('shows the server’s reason when a password sign-in fails, and why the session ended', async () => {
  useAuthStore.setState({ status: 'signed-out', sessionEnded: true, config: { mode: 'on', localLogin: true, sso: false } });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'That email and password don’t match an account.' } }), { status: 401 }));
  render(<SignInScreen />);
  expect(screen.getByText(/Your session ended/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Email'), 'p@company.test');
  await userEvent.type(screen.getByLabelText('Password'), 'wrong-password-1');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('don’t match');
});

it('shows a company sign-in refusal passed back in the URL', () => {
  window.history.replaceState(null, '', '/?signin_error=Your%20Glasshouse%20account%20is%20switched%20off.');
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: false, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent('switched off');
  window.history.replaceState(null, '', '/');
});
