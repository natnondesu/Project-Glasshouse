import { messagesFor, useLangStore } from '../i18n';

export type Role = 'viewer' | 'editor' | 'reviewer' | 'admin';
export type AuthConfig = { mode: 'dev' } | { mode: 'on'; localLogin: boolean; sso: boolean };
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

/** The server says the session is gone (or must change its password): the sync client stops and keeps its edits. */
export class AuthError extends Error {
  constructor(
    readonly code: 'unauthorised' | 'password_change_required',
    message: string,
  ) {
    super(message);
  }
}

const text = () => messagesFor(useLangStore.getState().lang).auth;
const JSON_HEADERS = { 'content-type': 'application/json', 'x-glasshouse': '1' };
const messageOf = async (res: Response, fallback: string): Promise<string> => {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
};

export async function getAuthConfig(): Promise<AuthConfig> {
  const res = await fetch('/auth/config');
  if (!res.ok) throw new Error(text().serverAnswered(res.status));
  return (await res.json()) as AuthConfig;
}

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch('/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(text().serverAnswered(res.status));
  return (await res.json()) as AuthUser;
}

/** A refused password sign-in, with the status so the screen can tell wrong credentials (401) from everything else. */
export class LoginRefusedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'LoginRefusedError';
  }
}

export async function login(email: string, password: string): Promise<{ mustChangePassword: boolean }> {
  const res = await fetch('/auth/login', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new LoginRefusedError(await messageOf(res, text().signInFailed), res.status);
  return (await res.json()) as { mustChangePassword: boolean };
}

export async function changePassword(current: string, next: string): Promise<void> {
  const res = await fetch('/auth/password', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ current, next }) });
  if (!res.ok) throw new Error(await messageOf(res, text().passwordFailed));
}

export async function logout(): Promise<void> {
  const res = await fetch('/auth/logout', { method: 'POST', headers: { 'x-glasshouse': '1' } });
  if (!res.ok && res.status !== 401) throw new Error(await messageOf(res, text().signOutFailed));
}

export const ssoUrl = (returnTo: string): string => `/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}`;
