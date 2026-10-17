import { loadConfig } from './config';
import { registerAuthRoutes } from './http/auth/authRoutes';
import { LoginThrottle } from './http/auth/loginThrottle';
import { createSessionAuth } from './http/auth/sessionAuth';
import { buildApp } from './http/app';
import { devAuthenticate, registerDevAuthRoutes } from './http/devAuth';
import { MemoryIdentityStore } from './identity/memoryIdentityStore';
import { PgIdentityStore } from './identity/pgIdentityStore';
import { seedUsers } from './identity/seedUsers';
import type { IdentityStore } from './identity/types';
import type { CommandStore } from './store/commandStore';
import { MemoryCommandStore } from './store/memoryStore';
import { PgCommandStore } from './store/pgStore';
import { WorkspaceService } from './workspaceService';

const SESSION_SWEEP_MS = 60 * 60 * 1000;

const config = loadConfig(process.env);
const store: CommandStore = config.store === 'memory' ? new MemoryCommandStore() : await PgCommandStore.connect(config.databaseUrl!);
const service = await WorkspaceService.open(store, { seedSample: config.seedSample });
let identity: IdentityStore | null = null;
let app;
if (config.auth.mode === 'dev-insecure') {
  app = await buildApp({ service, authenticate: devAuthenticate, authRoutes: registerDevAuthRoutes, publicOrigin: null, webDir: config.webDir, logger: true });
  app.log.warn('GLASSHOUSE_AUTH=dev-insecure: anyone who can reach this server can edit everything. Local development only.');
} else {
  const auth = config.auth;
  const idStore: IdentityStore = config.store === 'memory' ? new MemoryIdentityStore() : await PgIdentityStore.connect(config.databaseUrl!);
  identity = idStore;
  await seedUsers(idStore, auth.seedUsers, new Date().toISOString());
  const sessions = createSessionAuth(idStore, { secure: auth.secureCookies });
  const throttle = new LoginThrottle();
  const built = await buildApp({
    service, authenticate: sessions.authenticate, publicOrigin: auth.publicUrl.origin, webDir: config.webDir, logger: true,
    authRoutes: (a) => registerAuthRoutes(a, { store: idStore, sessions, config: auth, oidc: null, throttle, now: () => new Date() }),
  });
  app = built;
  // Expired sessions are swept hourly; a failure is logged and retried next hour.
  const sweep = setInterval(() => void idStore.deleteExpiredSessions(new Date().toISOString()).catch((e: unknown) => built.log.error(e, 'Sweeping expired sessions failed')), SESSION_SWEEP_MS);
  sweep.unref();
}
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
    await identity?.close();
    process.exit(0);
  } catch (e) {
    app.log.error(e, 'Shutdown failed; the command log is intact and the next start replays it');
    process.exit(1);
  }
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
