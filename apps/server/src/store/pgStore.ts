import type { Workspace, WorkspaceCommand } from '@glasshouse/domain';
import pg from 'pg';
import type { CommandStore, LoggedCommand, StoredSnapshot } from './commandStore';
import { migrate } from './migrations';

const SNAPSHOTS_KEPT = 3;

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
  private constructor(private readonly pool: pg.Pool) {}

  static async connect(url: string): Promise<PgCommandStore> {
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    pool.on('error', (e) => console.error('Postgres connection error', e));
    await migrate(pool);
    return new PgCommandStore(pool);
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

  async append(e: LoggedCommand): Promise<void> {
    await this.pool.query(`insert into commands (${COLUMNS}) values ($1, $2, $3, $4, $5, $6)`, [
      e.seq, e.clientId, e.commandId, e.actor.id, e.actor.name, JSON.stringify(e.command),
    ]);
  }

  async saveSnapshot(seq: number, workspace: Workspace): Promise<void> {
    await this.pool.query(
      `insert into snapshots (seq, schema_version, workspace) values ($1, $2, $3)
       on conflict (seq) do update set workspace = excluded.workspace, schema_version = excluded.schema_version, created_at = now()`,
      [seq, workspace.schemaVersion, JSON.stringify(workspace)],
    );
    await this.pool.query('delete from snapshots where seq not in (select seq from snapshots order by seq desc limit $1)', [SNAPSHOTS_KEPT]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
