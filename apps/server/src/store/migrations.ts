import type pg from 'pg';

/** Embedded, so the bundled server needs no SQL files on disk. Append only; never edit a shipped migration. */
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '001_command_log',
    sql: `
      create table commands (
        seq bigint primary key,
        client_id text not null,
        command_id text not null,
        actor_id text not null,
        actor_name text not null,
        command jsonb not null,
        received_at timestamptz not null default now(),
        unique (client_id, command_id)
      );
      create table snapshots (
        seq bigint primary key,
        schema_version integer not null,
        workspace jsonb not null,
        created_at timestamptz not null default now()
      );`,
  },
  {
    name: '002_identity',
    sql: `
      create table users (
        id text primary key,
        email text not null,
        display_name text not null,
        role text not null check (role in ('viewer', 'editor', 'reviewer', 'admin')),
        source text not null check (source in ('oidc', 'local')),
        oidc_subject text unique,
        password_hash text,
        must_change_password boolean not null default false,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        last_login_at timestamptz
      );
      create unique index users_email_lower on users (lower(email));
      create table sessions (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        created_at timestamptz not null,
        last_seen_at timestamptz not null,
        expires_at timestamptz not null
      );
      create index sessions_user on sessions (user_id);`,
  },
];

const LOCK_KEY = 727274;

export async function migrate(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Two servers starting together must not both run a migration.
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      await client.query('begin');
      try {
        await client.query(m.sql);
        await client.query('insert into schema_migrations (name) values ($1)', [m.name]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Database migration ${m.name} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch((e: unknown) => console.error('Releasing the migration lock failed', e));
    client.release();
  }
}
