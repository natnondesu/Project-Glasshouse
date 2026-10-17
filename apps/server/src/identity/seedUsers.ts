import { randomUUID } from 'node:crypto';
import { hashPassword, passwordProblem } from './passwords';
import { isRole, type IdentityStore, type Role } from './types';

export interface SeedUser {
  email: string;
  password: string;
  role: Role;
  displayName: string;
}

/** "email:password:role:Name; …" — for the in-memory e2e server only (config refuses it with Postgres). */
export function parseSeedUsers(text: string): SeedUser[] {
  return text.split(';').map((entry) => entry.trim()).filter(Boolean).map((entry, index) => {
    const [email, password, role, ...name] = entry.split(':');
    const displayName = name.join(':').trim();
    if (!email || !password || !isRole(role) || !displayName) throw new Error(`GLASSHOUSE_SEED_USERS entries are email:password:role:Name — entry ${index + 1} is malformed.`);
    const problem = passwordProblem(password);
    if (problem) throw new Error(`Seed user ${email}: ${problem}`);
    return { email: email.trim(), password, role, displayName };
  });
}

export async function seedUsers(store: IdentityStore, users: SeedUser[], now: string): Promise<void> {
  for (const u of users) {
    await store.createUser({
      id: randomUUID(), email: u.email, displayName: u.displayName, role: u.role, source: 'local', oidcSubject: null,
      passwordHash: await hashPassword(u.password), mustChangePassword: false, nameLocked: false, active: true, createdAt: now, lastLoginAt: null,
    });
  }
}
