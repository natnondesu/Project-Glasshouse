import type { Workspace, WorkspaceCommand } from '@glasshouse/domain';
import pg from 'pg';
import type { ApprovalRecord, CommandStore, LoggedCommand, StoredSnapshot } from './commandStore';
import { migrate } from './migrations';

const SNAPSHOTS_KEPT = 3;
/** Distinct from the migration lock (727274): held for the whole life of the process. */
const INSTANCE_LOCK_KEY = 727275;

/**
 * A query that hangs (a stuck lock, a half-dead connection) fails after this instead of blocking the command queue forever.
 * Every statement is far below it: a snapshot write or a log replay is a single indexed statement or a bounded read.
 */
export const STATEMENT_TIMEOUT_MS = 30_000;

export const poolConfig = (url: string, statementTimeoutMs = STATEMENT_TIMEOUT_MS): pg.PoolConfig => ({
  connectionString: url,
  max: 6,
  // A readiness ping must fail rather than hang when the pool cannot get a connection.
  connectionTimeoutMillis: 5000,
  statement_timeout: statementTimeoutMs,
});

export class InstanceLockError extends Error {}

const defaultLockLost = (error: unknown): void => {
  console.error('Lost the database connection that holds the single-instance lock; exiting so the container restarts cleanly.', error);
  process.exit(1);
};

interface CommandRow {
  seq: string;
  client_id: string;
  command_id: string;
  actor_id: string;
  actor_name: string;
  command: WorkspaceCommand;
}

const toLogged = (r: CommandRow): LoggedCommand => ({
  seq: Number(r.seq),
  clientId: r.client_id,
  commandId: r.command_id,
  actor: { id: r.actor_id, name: r.actor_name, role: 'viewer', verified: true },
  command: r.command,
});

const COLUMNS = 'seq, client_id, command_id, actor_id, actor_name, command';

export class PgCommandStore implements CommandStore {
  private constructor(private readonly pool: pg.Pool, private readonly lock: pg.PoolClient) {}

  static async connect(url: string, { onLockLost = defaultLockLost }: { onLockLost?: (error: unknown) => void } = {}): Promise<PgCommandStore> {
    const pool = new pg.Pool(poolConfig(url));
    pool.on('error', (e) => console.error('Postgres connection error', e));
    let lock: pg.PoolClient | undefined;
    try {
      lock = await pool.connect();
      // Before migrating: a refused second (or newer) server must not touch the live database.
      const r = await lock.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [INSTANCE_LOCK_KEY]);
      if (!r.rows[0]?.ok) {
        throw new InstanceLockError('Another Glasshouse server is already running against this database. Only one may run at a time (P1 design): stop the other one first.');
      }
      await migrate(pool);
    } catch (e) {
      lock?.release(true);
      await pool.end().catch(() => undefined);
      throw e;
    }
    // If this connection drops, Postgres frees the lock and a second server could start: stop rather than run unguarded.
    lock.on('error', onLockLost);
    return new PgCommandStore(pool, lock);
  }

  async latestSnapshot(): Promise<StoredSnapshot | null> {
    const r = await this.pool.query<{ seq: string; workspace: unknown }>('select seq, workspace from snapshots order by seq desc limit 1');
    const row = r.rows[0];
    return row ? { seq: Number(row.seq), workspace: row.workspace } : null;
  }

  async commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]> {
    const r = await this.pool.query<CommandRow>(`select ${COLUMNS} from commands where seq > $1 order by seq limit $2`, [seq, limit]);
    return r.rows.map(toLogged);
  }

  async findCommand(clientId: string, commandId: string): Promise<LoggedCommand | null> {
    const r = await this.pool.query<CommandRow>(`select ${COLUMNS} from commands where client_id = $1 and command_id = $2`, [clientId, commandId]);
    return r.rows[0] ? toLogged(r.rows[0]) : null;
  }

  async append(e: LoggedCommand, approval: ApprovalRecord | null = null): Promise<void> {
    const client = await this.pool.connect();
    let discard: Error | undefined;
    try {
      await client.query('begin');
      await client.query(`insert into commands (${COLUMNS}) values ($1, $2, $3, $4, $5, $6)`, [
        e.seq, e.clientId, e.commandId, e.actor.id, e.actor.name, JSON.stringify(e.command),
      ]);
      if (approval) {
        await client.query(
          'insert into approvals (seq, room_id, revision, content_hash, approver_id, approver_name, approved_at) values ($1, $2, $3, $4, $5, $6, $7)',
          [approval.seq, approval.roomId, approval.revision, approval.contentHash, approval.approverId, approval.approverName, approval.approvedAt],
        );
      }
      await client.query('commit');
    } catch (err) {
      // The original error is the one to report. If the rollback fails too, the connection is broken: release(error) drops it from the pool.
      await client.query('rollback').catch((rollbackError: unknown) => {
        discard = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
      });
      throw err;
    } finally {
      client.release(discard);
    }
  }

  async listApprovals(): Promise<ApprovalRecord[]> {
    const r = await this.pool.query<{ seq: string; room_id: string; revision: number; content_hash: string; approver_id: string; approver_name: string; approved_at: string }>(
      'select seq, room_id, revision, content_hash, approver_id, approver_name, approved_at from approvals order by seq',
    );
    return r.rows.map((x) => ({ seq: Number(x.seq), roomId: x.room_id, revision: x.revision, contentHash: x.content_hash, approverId: x.approver_id, approverName: x.approver_name, approvedAt: x.approved_at }));
  }

  async saveSnapshot(seq: number, workspace: Workspace): Promise<void> {
    await this.pool.query(
      `insert into snapshots (seq, schema_version, workspace) values ($1, $2, $3)
       on conflict (seq) do update set workspace = excluded.workspace, schema_version = excluded.schema_version, created_at = now()`,
      [seq, workspace.schemaVersion, JSON.stringify(workspace)],
    );
    await this.pool.query('delete from snapshots where seq not in (select seq from snapshots order by seq desc limit $1)', [SNAPSHOTS_KEPT]);
  }

  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  async close(): Promise<void> {
    await this.lock.query('select pg_advisory_unlock($1)', [INSTANCE_LOCK_KEY]).catch(() => undefined);
    // Destroyed, not returned to the pool: the connection is closed, so the session lock is gone even if the unlock failed.
    this.lock.release(true);
    await this.pool.end();
  }
}
