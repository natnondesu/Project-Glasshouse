import type { Role } from '../../auth/authApi';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  source: 'oidc' | 'local';
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const HEADERS = { 'content-type': 'application/json', 'x-glasshouse': '1' };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `The server answered ${res.status}.`);
  }
  return (await res.json()) as T;
}

export const listUsers = (): Promise<AdminUser[]> => call('/api/admin/users');
export const createUser = (input: { email: string; displayName: string; role: Role }) =>
  call<{ user: AdminUser; temporaryPassword: string }>('/api/admin/users', { method: 'POST', headers: HEADERS, body: JSON.stringify(input) });
export const updateUser = (id: string, patch: { role?: Role; active?: boolean; displayName?: string }) =>
  call<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(patch) });
export const resetPassword = (id: string) => call<{ temporaryPassword: string }>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', headers: HEADERS });
