import { DuplicateUserError, type IdentityStore, type Session, type User, type UserPatch } from './types';

const sameEmail = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Tests and the e2e server: the same rules as Postgres, gone on restart. */
export class MemoryIdentityStore implements IdentityStore {
  private users: User[] = [];
  private sessions = new Map<string, Session>();

  async findUserById(id: string) {
    return structuredClone(this.users.find((u) => u.id === id) ?? null);
  }
  async findUserByEmail(email: string) {
    return structuredClone(this.users.find((u) => sameEmail(u.email, email)) ?? null);
  }
  async findUserBySubject(subject: string) {
    return structuredClone(this.users.find((u) => u.oidcSubject === subject) ?? null);
  }
  async listUsers() {
    return structuredClone([...this.users].sort((a, b) => a.displayName.localeCompare(b.displayName)));
  }
  async createUser(user: User) {
    if (this.users.some((u) => u.id === user.id || sameEmail(u.email, user.email) || (user.oidcSubject !== null && u.oidcSubject === user.oidcSubject))) {
      throw new DuplicateUserError(`A user with this email or sign-in already exists: ${user.email}`);
    }
    this.users = [...this.users, structuredClone(user)];
  }
  async updateUser(id: string, patch: UserPatch) {
    const current = this.users.find((u) => u.id === id);
    if (!current) return null;
    if (patch.email && this.users.some((u) => u.id !== id && sameEmail(u.email, patch.email!))) throw new DuplicateUserError(`Email already in use: ${patch.email}`);
    if (patch.oidcSubject && this.users.some((u) => u.id !== id && u.oidcSubject === patch.oidcSubject)) throw new DuplicateUserError('That sign-in is already linked to another user.');
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as UserPatch;
    const next = { ...current, ...defined };
    this.users = this.users.map((u) => (u.id === id ? next : u));
    return structuredClone(next);
  }
  async deleteUser(id: string) {
    if (!this.users.some((u) => u.id === id)) return false;
    this.users = this.users.filter((u) => u.id !== id);
    await this.deleteUserSessions(id);
    return true;
  }
  async countActiveAdmins() {
    return this.users.filter((u) => u.active && u.role === 'admin').length;
  }
  async createSession(session: Session) {
    this.sessions.set(session.tokenHash, structuredClone(session));
  }
  async findSession(tokenHash: string) {
    return structuredClone(this.sessions.get(tokenHash) ?? null);
  }
  async touchSession(tokenHash: string, lastSeenAt: string) {
    const s = this.sessions.get(tokenHash);
    if (s) this.sessions.set(tokenHash, { ...s, lastSeenAt });
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async deleteUserSessions(userId: string) {
    for (const [k, s] of this.sessions) if (s.userId === userId) this.sessions.delete(k);
  }
  async deleteExpiredSessions(nowIso: string) {
    let n = 0;
    for (const [k, s] of this.sessions) {
      if (s.expiresAt <= nowIso) {
        this.sessions.delete(k);
        n += 1;
      }
    }
    return n;
  }
  async close() {}
}
