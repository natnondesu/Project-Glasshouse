import type { Role } from '../../auth/authApi';
import { messagesFor, useLangStore } from '../../i18n';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  source: 'oidc' | 'local';
  active: boolean;
  mustChangePassword: boolean;
  /** An admin set the name: company sign-in no longer overwrites it. */
  nameLocked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const HEADERS = { 'content-type': 'application/json', 'x-glasshouse': '1' };
/** A POST with no body must not claim a JSON content-type: Fastify answers 400 to an empty JSON body. */
const BODILESS_HEADERS = { 'x-glasshouse': '1' };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const text = messagesFor(useLangStore.getState().lang).users;
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(text.unreachable);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? text.requestFailed(res.status));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const listUsers = (): Promise<AdminUser[]> => call('/api/admin/users');
export const createUser = (input: { email: string; displayName: string; role: Role }) =>
  call<{ user: AdminUser; temporaryPassword: string }>('/api/admin/users', { method: 'POST', headers: HEADERS, body: JSON.stringify(input) });
export const updateUser = (id: string, patch: { role?: Role; active?: boolean; displayName?: string }) =>
  call<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(patch) });
export const resetPassword = (id: string) => call<{ temporaryPassword: string }>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', headers: BODILESS_HEADERS });
export const deleteUser = (id: string) => call<void>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', headers: BODILESS_HEADERS });
