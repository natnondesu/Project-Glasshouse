import pg from 'pg';
import { migrate } from '../store/migrations';
import { DuplicateUserError, type IdentityStore, type RemovedSignIn, type Role, type Session, type User, type UserPatch } from './types';

interface UserRow {
  id: string; email: string; display_name: string; role: Role; source: 'oidc' | 'local'; oidc_subject: string | null;
  password_hash: string | null; must_change_password: boolean; name_locked: boolean; active: boolean; created_at: Date; last_login_at: Date | null;
}
interface RemovalRow { subject_hash: string | null; email_hash: string; removed_at: Date; removed_by: string }
interface SessionRow { token_hash: string; user_id: string; created_at: Date; last_seen_at: Date; expires_at: Date }

const toUser = (r: UserRow): User => ({
  id: r.id, email: r.email, displayName: r.display_name, role: r.role, source: r.source, oidcSubject: r.oidc_subject,
  passwordHash: r.password_hash, mustChangePassword: r.must_change_password, nameLocked: r.name_locked, active: r.active,
  createdAt: r.created_at.toISOString(), lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
});
const toSession = (r: SessionRow): Session => ({
  tokenHash: r.token_hash, userId: r.user_id, createdAt: r.created_at.toISOString(), lastSeenAt: r.last_seen_at.toISOString(), expiresAt: r.expires_at.toISOString(),
});
const COLUMN: Record<keyof UserPatch, string> = {
  email: 'email', displayName: 'display_name', role: 'role', active: 'active', passwordHash: 'password_hash',
  mustChangePassword: 'must_change_password', nameLocked: 'name_locked', lastLoginAt: 'last_login_at', oidcSubject: 'oidc_subject',
};
const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === UNIQUE_VIOLATION;

export class PgIdentityStore implements IdentityStore {
  private constructor(private readonly pool: pg.Pool) {}

  static async connect(url: string): Promise<PgIdentityStore> {
    const pool = new pg.Pool({ connectionString: url, max: 3 });
    pool.on('error', (e) => console.error('Postgres connection error (identity)', e));
    try {
      await migrate(pool);
    } catch (e) {
      await pool.end();
      throw e;
    }
    return new PgIdentityStore(pool);
  }

  private async one(sql: string, params: unknown[]): Promise<User | null> {
    const r = await this.pool.query<UserRow>(sql, params);
    return r.rows[0] ? toUser(r.rows[0]) : null;
  }
  findUserById(id: string) {
    return this.one('select * from users where id = $1', [id]);
  }
  findUserByEmail(email: string) {
    return this.one('select * from users where lower(email) = lower($1)', [email]);
  }
  findUserBySubject(subject: string) {
    return this.one('select * from users where oidc_subject = $1', [subject]);
  }
  async listUsers() {
    return (await this.pool.query<UserRow>('select * from users order by display_name')).rows.map(toUser);
  }
  async createUser(u: User) {
    try {
      await this.pool.query(
        `insert into users (id, email, display_name, role, source, oidc_subject, password_hash, must_change_password, name_locked, active, created_at, last_login_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [u.id, u.email, u.displayName, u.role, u.source, u.oidcSubject, u.passwordHash, u.mustChangePassword, u.nameLocked, u.active, u.createdAt, u.lastLoginAt],
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw new DuplicateUserError(`A user with this email or sign-in already exists: ${u.email}`);
      throw e;
    }
  }
  async updateUser(id: string, patch: UserPatch) {
    const keys = (Object.keys(patch) as (keyof UserPatch)[]).filter((k) => patch[k] !== undefined);
    if (keys.length === 0) return this.findUserById(id);
    const sets = keys.map((k, i) => `${COLUMN[k]} = $${i + 2}`).join(', ');
    try {
      return await this.one(`update users set ${sets} where id = $1 returning *`, [id, ...keys.map((k) => patch[k])]);
    } catch (e) {
      if (isUniqueViolation(e)) throw new DuplicateUserError('That email or sign-in is already used by another user.');
      throw e;
    }
  }
  async deleteUser(id: string, removal: RemovedSignIn) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // sessions.user_id is ON DELETE CASCADE, so the sign-ins go in the same statement.
      const deleted = ((await client.query('delete from users where id = $1', [id])).rowCount ?? 0) > 0;
      if (deleted) {
        await client.query('insert into removed_signins (subject_hash, email_hash, removed_at, removed_by) values ($1, $2, $3, $4)', [removal.subjectHash, removal.emailHash, removal.removedAt, removal.removedBy]);
      }
      await client.query('commit');
      return deleted;
    } catch (e) {
      await client.query('rollback').catch((err: unknown) => console.error('Rolling back the user deletion failed', err));
      throw e;
    } finally {
      client.release();
    }
  }
  async findRemoval(subjectHash: string | null, emailHash: string | null) {
    const r = await this.pool.query<RemovalRow>(
      'select subject_hash, email_hash, removed_at, removed_by from removed_signins where ($1::text is not null and subject_hash = $1) or ($2::text is not null and email_hash = $2) limit 1',
      [subjectHash, emailHash],
    );
    const row = r.rows[0];
    return row ? { subjectHash: row.subject_hash, emailHash: row.email_hash, removedAt: row.removed_at.toISOString(), removedBy: row.removed_by } : null;
  }
  async clearRemovals(emailHash: string) {
    return (await this.pool.query('delete from removed_signins where email_hash = $1', [emailHash])).rowCount ?? 0;
  }
  async countActiveAdmins() {
    const r = await this.pool.query<{ n: string }>("select count(*) as n from users where active and role = 'admin'");
    return Number(r.rows[0]?.n ?? 0);
  }
  async createSession(s: Session) {
    await this.pool.query('insert into sessions (token_hash, user_id, created_at, last_seen_at, expires_at) values ($1, $2, $3, $4, $5)', [s.tokenHash, s.userId, s.createdAt, s.lastSeenAt, s.expiresAt]);
  }
  async findSession(tokenHash: string) {
    const r = await this.pool.query<SessionRow>('select * from sessions where token_hash = $1', [tokenHash]);
    return r.rows[0] ? toSession(r.rows[0]) : null;
  }
  async touchSession(tokenHash: string, lastSeenAt: string) {
    await this.pool.query('update sessions set last_seen_at = $2 where token_hash = $1', [tokenHash, lastSeenAt]);
  }
  async deleteSession(tokenHash: string) {
    await this.pool.query('delete from sessions where token_hash = $1', [tokenHash]);
  }
  async deleteUserSessions(userId: string) {
    await this.pool.query('delete from sessions where user_id = $1', [userId]);
  }
  async deleteExpiredSessions(nowIso: string) {
    return (await this.pool.query('delete from sessions where expires_at <= $1', [nowIso])).rowCount ?? 0;
  }
  async close() {
    await this.pool.end();
  }
}
