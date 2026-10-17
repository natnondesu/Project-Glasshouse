import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { WorkspaceService } from '../workspaceService';
import { PgCommandStore } from './pgStore';

let container: StartedPostgreSqlContainer;
// The log stores only id and name; read-back entries carry role viewer and verified true (a record, not a credential).
const actor = { id: 'dev:Ploy', name: 'Ploy', role: 'viewer' as const, verified: true };
// Creating a project needs Editor, so the service is driven as an editor; the log keeps the same id and name.
const editor = { ...actor, role: 'editor' as const };

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
});
afterAll(async () => {
  await container?.stop();
});

it('keeps commands and snapshots across a restart, and migrations run twice safely', async () => {
  const url = container.getConnectionUri();
  const store = await PgCommandStore.connect(url);
  const svc = await WorkspaceService.open(store, { snapshotEvery: 2 });
  for (const [i, name] of ['Riverside', 'Northgate', 'Bangna'].entries()) {
    await svc.submit({ clientId: 'a', commandId: String(i), command: { type: 'project/create', id: `p${i}`, name } }, editor);
  }
  await store.close();

  const again = await PgCommandStore.connect(url);
  const reopened = await WorkspaceService.open(again);
  expect(reopened.state.seq).toBe(3);
  expect(reopened.state.workspace.projects.map((p) => p.name)).toEqual(['Riverside', 'Northgate', 'Bangna']);
  expect(await again.findCommand('a', '0')).toMatchObject({ seq: 1, actor });
  expect((await again.commandsAfter(1, 10)).map((c) => c.seq)).toEqual([2, 3]);
  await again.close();
});

it('refuses a repeated seq and a repeated client command id', async () => {
  const store = await PgCommandStore.connect(container.getConnectionUri());
  const base = { clientId: 'z', actor, command: { type: 'project/create' as const, id: 'pz', name: 'Z' } };
  await store.append({ ...base, seq: 1000, commandId: 'x' });
  await expect(store.append({ ...base, seq: 1000, commandId: 'y' })).rejects.toThrow();
  await expect(store.append({ ...base, seq: 1001, commandId: 'x' })).rejects.toThrow();
  await store.close();
});

const approval = (seq: number) => ({ seq, roomId: 'r', revision: 1, contentHash: 'a'.repeat(64), approverId: 'u-r', approverName: 'Rae', approvedAt: '2026-10-18T09:00:00.000Z' });
const approvalBase = { clientId: 'q', actor, command: { type: 'project/create' as const, id: 'pq', name: 'Q' } };

it('reads back an approval written with its command', async () => {
  const store = await PgCommandStore.connect(container.getConnectionUri());
  await store.append({ ...approvalBase, seq: 2000, commandId: 'a' }, approval(2000));
  expect(await store.listApprovals()).toContainEqual(approval(2000));
  await store.close();
});

it('refuses to change or remove a logged command or an approval, for any role', async () => {
  const url = container.getConnectionUri();
  const store = await PgCommandStore.connect(url);
  await store.append({ ...approvalBase, seq: 2100, commandId: 'b' }, approval(2100));
  await store.close();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await expect(client.query("update commands set actor_name = 'x'")).rejects.toThrow(/append-only/);
    await expect(client.query('delete from commands')).rejects.toThrow(/append-only/);
    await expect(client.query('delete from approvals')).rejects.toThrow(/append-only/);
    await expect(client.query("update approvals set approver_name = 'x'")).rejects.toThrow(/append-only/);
    await expect(client.query('truncate approvals')).rejects.toThrow(/append-only/);
    await expect(client.query('truncate commands cascade')).rejects.toThrow(/append-only/);
  } finally {
    await client.end();
  }
});

it('rolls the command back when its approval cannot be written', async () => {
  const store = await PgCommandStore.connect(container.getConnectionUri());
  // The approval points at a seq with no command, so its foreign key fails after the command insert.
  await expect(store.append({ ...approvalBase, seq: 2200, commandId: 'c' }, approval(2201))).rejects.toThrow();
  expect(await store.findCommand('q', 'c')).toBeNull();
  expect(await store.commandsAfter(2199, 10)).toEqual([]);
  await store.close();
});
