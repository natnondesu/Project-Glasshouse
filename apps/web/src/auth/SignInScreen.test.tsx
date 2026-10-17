import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { messagesFor, useLangStore } from '../i18n';
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

const CODES = ['cancelled', 'expired', 'unavailable', 'refused', 'exists', 'switched_off', 'generic'] as const;

it.each(CODES)('words the company sign-in code %s itself, in English', (code) => {
  window.history.replaceState(null, '', `/?signin_error=${code}`);
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: false, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent(messagesFor('en').auth.signinError[code]);
  window.history.replaceState(null, '', '/');
});

it('words every code in Thai when the page is in Thai', async () => {
  await useLangStore.getState().setLang('th');
  const th = messagesFor('th').auth.signinError;
  for (const code of CODES) {
    window.history.replaceState(null, '', `/?signin_error=${code}`);
    useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: false, sso: true } });
    const { unmount } = render(<SignInScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent(th[code]);
    expect(th[code]).not.toBe(messagesFor('en').auth.signinError[code]);
    unmount();
  }
  await useLangStore.getState().setLang('en');
  window.history.replaceState(null, '', '/');
});

it.each(['Your account is closed. Call 555-0100 to reopen', 'constructor', '__proto__', 'toString'])('shows the generic message, never the raw text, for an unknown value (%s)', (value) => {
  window.history.replaceState(null, '', `/?signin_error=${encodeURIComponent(value)}`);
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: false, sso: true } });
  render(<SignInScreen />);
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent(messagesFor('en').auth.signinError.generic);
  expect(alert).not.toHaveTextContent(value);
  window.history.replaceState(null, '', '/');
});

it('says why the server could not be asked, and Try again asks again', async () => {
  const init = vi.fn(async () => {});
  useAuthStore.setState({ status: 'signed-out', config: null, error: 'The Glasshouse server answered 502', init });
  render(<SignInScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent('answered 502');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(init).toHaveBeenCalledTimes(1);
});

it('returns to the same page minus the refusal, and clears the refusal from the address bar', () => {
  window.history.replaceState(null, '', '/?signin_error=x&a=1#h');
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: false, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('link', { name: 'Sign in with your company account' })).toHaveAttribute('href', `/auth/oidc/start?returnTo=${encodeURIComponent('/?a=1#h')}`);
  expect(window.location.search + window.location.hash).toBe('?a=1#h');
  window.history.replaceState(null, '', '/');
});

it('mentions edits waiting to be sent', () => {
  sessionStorage.setItem('glasshouse:unsent', JSON.stringify({ userId: 'u1', clientId: 'c', savedAt: Date.now(), commands: [{ commandId: '1', command: { type: 'project/create', id: 'p', name: 'P' } }] }));
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: false } });
  render(<SignInScreen />);
  expect(screen.getByText(/1 change you made wasn’t sent yet/)).toBeInTheDocument();
  sessionStorage.clear();
});
