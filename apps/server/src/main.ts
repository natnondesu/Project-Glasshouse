import { loadConfig } from './config';
import { buildApp } from './http/app';
import { devAuthenticate } from './http/devAuth';
import type { CommandStore } from './store/commandStore';
import { MemoryCommandStore } from './store/memoryStore';
import { PgCommandStore } from './store/pgStore';
import { WorkspaceService } from './workspaceService';

const config = loadConfig(process.env);
const store: CommandStore = config.store === 'memory' ? new MemoryCommandStore() : await PgCommandStore.connect(config.databaseUrl!);
const service = await WorkspaceService.open(store, { seedSample: config.seedSample });
const app = await buildApp({ service, authenticate: devAuthenticate, webDir: config.webDir, logger: true });
app.log.warn('GLASSHOUSE_AUTH=dev-insecure: anyone who can reach this server can edit everything. Local development only.');
await app.listen({ port: config.port, host: config.host });

let stopping = false;
const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal}: snapshotting and shutting down`);
  try {
    await app.close();
    await service.flush();
    await store.close();
    process.exit(0);
  } catch (e) {
    app.log.error(e, 'Shutdown failed; the command log is intact and the next start replays it');
    process.exit(1);
  }
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
