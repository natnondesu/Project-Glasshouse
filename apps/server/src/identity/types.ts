export const ROLES = ['viewer', 'editor', 'reviewer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Roles are cumulative: each includes everything below it. */
export const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, reviewer: 2, admin: 3 };
export const atLeast = (role: Role, needed: Role): boolean => ROLE_RANK[role] >= ROLE_RANK[needed];
export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  source: 'oidc' | 'local';
  oidcSubject: string | null;
  passwordHash: string | null;
  mustChangePassword: boolean;
  /** An admin set the name: company sign-ins stop overwriting it. */
  nameLocked: boolean;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export type UserPatch = Partial<Pick<User, 'email' | 'displayName' | 'role' | 'active' | 'passwordHash' | 'mustChangePassword' | 'nameLocked' | 'lastLoginAt' | 'oidcSubject'>>;

/** Only a hash of the cookie token is stored, so a database leak doesn't hand out live sessions. */
export interface Session {
  tokenHash: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

/** What a deleted account leaves behind so its company sign-in stays blocked until an admin adds the person again. Hashes only. */
export interface RemovedSignIn {
  subjectHash: string | null;
  emailHash: string;
  removedAt: string;
  /** User id of the admin who deleted the account. */
  removedBy: string;
}

export class DuplicateUserError extends Error {}

export interface IdentityStore {
  findUserById(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserBySubject(subject: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  createUser(user: User): Promise<void>;
  updateUser(id: string, patch: UserPatch): Promise<User | null>;
  /** Removes the row and its sessions and records the removal in one step; false when nobody had that id. */
  deleteUser(id: string, removal: RemovedSignIn): Promise<boolean>;
  /** A removal matching the sign-in's subject or verified email hash, if any. */
  findRemoval(subjectHash: string | null, emailHash: string | null): Promise<RemovedSignIn | null>;
  /** Forgets removals for this email (and the subject recorded with it): an admin added the person again. */
  clearRemovals(emailHash: string): Promise<number>;
  countActiveAdmins(): Promise<number>;
  createSession(session: Session): Promise<void>;
  findSession(tokenHash: string): Promise<Session | null>;
  touchSession(tokenHash: string, lastSeenAt: string): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  deleteExpiredSessions(nowIso: string): Promise<number>;
  close(): Promise<void>;
}
