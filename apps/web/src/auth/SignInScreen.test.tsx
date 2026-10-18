import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { messagesFor, useLangStore } from '../i18n';
import { resetAuthStore, useAuthStore } from './authStore';
import { SignInScreen } from './SignInScreen';

beforeEach(() => resetAuthStore());
afterEach(async () => {
  vi.restoreAllMocks();
  await useLangStore.getState().setLang('en');
});

it('offers the company sign-in and the password form the server allows', () => {
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('link', { name: 'Continue with company account' })).toHaveAttribute('href', expect.stringMatching(/^\/auth\/oidc\/start\?returnTo=/));
  expect(screen.getByLabelText('Work email')).toBeInTheDocument();
  expect(screen.getByText('OR WITH EMAIL')).toBeInTheDocument();
});

it('shows only the company button, no form and no divider, when passwords are switched off', () => {
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: false, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('link', { name: 'Continue with company account' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Work email')).toBeNull();
  expect(screen.queryByText('OR WITH EMAIL')).toBeNull();
});

it('shows only the password form, no company button and no divider, when the company sign-in is off', () => {
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: false } });
  render(<SignInScreen />);
  expect(screen.queryByRole('link', { name: 'Continue with company account' })).toBeNull();
  expect(screen.queryByText('OR WITH EMAIL')).toBeNull();
  expect(screen.getByLabelText('Work email')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toBeInTheDocument();
});

it('wears the brand: the lockup, the headline, the four steps and one page heading', () => {
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('img', { name: 'Glasshouse' })).toHaveAttribute('src', '/brand/glasshouse-lockup-horizontal-dark.svg');
  expect(screen.getByText(/Survey the room\./)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['01Survey', '02Plan', '03Approve', '04Install']);
  expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Sign in to Glasshouse']);
  expect(screen.getByText('Use your work account.')).toBeInTheDocument();
});

it('says a forgotten password is the admin’s to reset, without a link, a remember box or a help link', () => {
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: false } });
  render(<SignInScreen />);
  expect(screen.getByText('Forgot it? Ask an admin to reset it.')).toBeInTheDocument();
  expect(screen.getByText('No account yet? Ask your workspace admin for an invite.')).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('link', { name: /help|forgot/i })).toBeNull();
});

it('reveals and hides the password with a real button', async () => {
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: false } });
  render(<SignInScreen />);
  const field = screen.getByLabelText('Password');
  expect(field).toHaveAttribute('type', 'password');
  await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(field).toHaveAttribute('type', 'text');
  await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(field).toHaveAttribute('type', 'password');
});

it('shows Signing in… and disables the button while the server answers, then marks both fields when it refuses', async () => {
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: false } });
  let refuse: (r: Response) => void = () => {};
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((resolve) => (refuse = resolve)));
  render(<SignInScreen />);
  await userEvent.type(screen.getByLabelText('Work email'), 'p@company.test');
  await userEvent.type(screen.getByLabelText('Password'), 'wrong-password-1{Enter}');
  const busy = screen.getByRole('button', { name: 'Signing in…' });
  expect(busy).toBeDisabled();
  expect(screen.getByLabelText('Work email')).not.toHaveAttribute('aria-invalid');
  refuse(new Response(JSON.stringify({ error: { message: 'That email and password don’t match an account.' } }), { status: 401 }));
  expect(await screen.findByRole('alert')).toHaveTextContent('don’t match');
  expect(screen.getByLabelText('Work email')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

it('leaves the fields unmarked when the refusal is not about the credentials', () => {
  window.history.replaceState(null, '', '/?signin_error=expired');
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent('expired');
  expect(screen.getByLabelText('Work email')).not.toHaveAttribute('aria-invalid');
  window.history.replaceState(null, '', '/');
});

it('speaks Thai, copy included, when the page is in Thai', async () => {
  await useLangStore.getState().setLang('th');
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('link', { name: 'ดำเนินการต่อด้วยบัญชีบริษัท' })).toBeInTheDocument();
  expect(screen.getByText('หรือใช้อีเมล')).toBeInTheDocument();
  expect(screen.getByLabelText('อีเมลที่ทำงาน')).toBeInTheDocument();
  expect(screen.getByText('ลืมรหัสผ่าน? ขอให้ผู้ดูแลรีเซ็ตให้')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'แสดงรหัสผ่าน' })).toBeInTheDocument();
  await useLangStore.getState().setLang('en');
});

it('shows the server’s reason when a password sign-in fails, and why the session ended', async () => {
  useAuthStore.setState({ status: 'signed-out', sessionEnded: true, config: { mode: 'on', localLogin: true, sso: false } });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'That email and password don’t match an account.' } }), { status: 401 }));
  render(<SignInScreen />);
  expect(screen.getByText(/Your session ended/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Work email'), 'p@company.test');
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
  expect(screen.getByRole('link', { name: 'Continue with company account' })).toHaveAttribute('href', `/auth/oidc/start?returnTo=${encodeURIComponent('/?a=1#h')}`);
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
