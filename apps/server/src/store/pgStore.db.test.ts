import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { WorkspaceService } from '../workspaceService';
import { PgCommandStore } from './pgStore';

let container: StartedPostgreSqlContainer;
const actor = { id: 'dev:Ploy', name: 'Ploy' };

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
});
afterAll(async () => {
  await container?.stop();
});

it('keeps commands and snapshots across a restart, and migrations run twice safely', async () => {
  const url = container.getConnectionUri();
  const store = await PgCommandStore.connect(url);
  const svc = await WorkspaceService.open(store, { snapshotEvery: 2 });
  for (const [i, name] of ['Riverside', 'Northgate', 'Bangna'].entries()) {
    await svc.submit({ clientId: 'a', commandId: String(i), command: { type: 'project/create', id: `p${i}`, name } }, actor);
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
