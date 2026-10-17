# P1-A Shared Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everyone using one Glasshouse server edits the same workspace, sees each other's changes live, and nothing is lost on a restart or overwritten silently.

**Architecture:** A new `apps/server` (Fastify) keeps the workspace in memory, accepts `WorkspaceCommand`s, applies and validates them with `@glasshouse/domain`, appends them to a Postgres log with a global `seq`, and broadcasts them over Server-Sent Events. The web app gains a *server mode* (`VITE_GLASSHOUSE_SERVER=1`): edits apply optimistically through a pure `SyncEngine`, are POSTed in batches, and confirmed state advances only from the ordered event stream. Local mode (the Vercel demo) is unchanged.

**Tech Stack:** Node ≥ 22, TypeScript 7, Fastify 5, `pg`, zod 4, tsx (dev), esbuild (bundle), vitest 5, `@testcontainers/postgresql` (DB tests), Playwright, React 19 + zustand 5 (existing).

**Spec:** `docs/superpowers/specs/2026-10-17-p1-shared-server-design.md` (and Product Specification §11, ADR-0001).

## Global Constraints

- pnpm workspaces; new package `apps/server` named `@glasshouse/server`, `"type": "module"`, `"private": true`.
- `@glasshouse/domain` stays free of browser and Node APIs (ADR-0001); the server imports it as source and bundles it.
- Local mode behaviour, tests and e2e must stay green and unchanged: `pnpm test && pnpm typecheck && pnpm build && pnpm e2e`.
- Server refuses to start without `GLASSHOUSE_AUTH`; Plan A only knows `dev-insecure` and logs a warning saying so.
- No offline mode: when the event stream is down for more than 3 s the app goes read-only with a banner; queued edits are kept and retried.
- Never silently overwrite: a command that no longer applies is rejected with the domain's reason, shown to the user.
- English and Thai strings for every new UI text (`apps/web/src/i18n/en.ts`, `th.ts`).
- Commit messages: conventional (`feat:`, `test:`…), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- IDs come from `crypto.randomUUID` (domain `newId`), which browsers only provide on HTTPS or localhost: the shared server is always served over HTTPS (Plan C reverse proxy).
- DB tests need Docker running (`pnpm --filter @glasshouse/server test:db`); unit tests never need Docker.

## Review Focus

1. **Server restarts while a user is mid-edit** — the in-flight POST fails, EventSource reconnects with `Last-Event-ID`; queued edits are retried with the same IDs and applied exactly once. *(Task 6 test "retries after a network failure without applying twice")*
2. **A malformed command** (missing fields, unknown type) — the server answers with a rejection and stays up; the workspace is untouched. *(Task 3 test "refuses malformed commands without crashing")*
3. **A laptop wakes after a night asleep**, more than 1000 commands behind — the stream says `resync`, the client reloads the workspace and keeps its unsent edits. *(Task 5 test "tells a far-behind client to resync")*
4. **The database was restored from an older backup** while browsers hold a newer `seq` — the stream says `resync` instead of sending nothing forever. *(Task 5 test "tells a client ahead of the server to resync")*
5. **A multi-megabyte project file import** — accepted up to 25 MB, not refused by a default 1 MB body limit. *(Task 5 test "accepts a large project import")*

---

## File Structure

```
packages/domain/src/
  canonical.ts                 NEW  stable JSON for content comparison
  canonical.test.ts            NEW
  result.ts                    MOD  + 'stale' error code
  commands/workspace.ts        MOD  + draft/replace command
  commands/workspace.test.ts   MOD
  index.ts                     MOD  export canonical
apps/server/
  package.json, tsconfig.json, vitest.config.ts, vitest.db.config.ts, build.mjs   NEW
  src/config.ts (+test)                     env → Config
  src/store/commandStore.ts                 CommandStore interface + types
  src/store/memoryStore.ts                  in-memory store (tests, e2e)
  src/store/pgStore.ts (+ pgStore.db.test.ts)  Postgres store
  src/store/migrations.ts                   embedded SQL migrations + runner
  src/workspaceService.ts (+test)           ordering, validation, idempotency, snapshots, replay
  src/http/app.ts (+app.test.ts)            buildApp: auth hook, routes, static web
  src/http/commands.ts                      POST /api/commands
  src/http/events.ts (+events.test.ts)      GET /api/events (SSE)
  src/http/devAuth.ts                       dev-only actor
  src/main.ts                               wiring, signals
apps/web/
  src/sync/syncEngine.ts (+test)            pure confirmed/pending model
  src/sync/syncClient.ts (+test)            batching, retries, events, resync
  src/sync/httpTransport.ts                 fetch + EventSource
  src/sync/serverMode.ts                    SERVER_MODE flag + bootstrap into the store
  src/store/workspaceStore.ts               MOD  commit hook, draft/replace undo, connection, notice
  src/app/App.tsx, Shell.tsx, TitleBlock.tsx  MOD
  src/features/tree/ProjectTree.tsx         MOD  hide BackupPanel in server mode
  src/app/SyncNotice.tsx                    NEW
  playwright.server.config.ts, e2e-server/collab.spec.ts  NEW
docker-compose.dev.yml                      NEW  Postgres for local dev
```

---

### Task 1: Domain — `draft/replace` with a stale check

Undo/redo in server mode must not overwrite someone else's change. Undo becomes a command carrying the content the user saw.

**Files:**
- Create: `packages/domain/src/canonical.ts`, `packages/domain/src/canonical.test.ts`
- Modify: `packages/domain/src/result.ts:3`, `packages/domain/src/commands/workspace.ts` (union at top, new `case` before `case 'plan'`), `packages/domain/src/index.ts`
- Test: `packages/domain/src/commands/workspace.test.ts`

**Interfaces:**
- Produces: `canonicalJson(value: unknown): string`; `DomainErrorCode` gains `'stale'`; `WorkspaceCommand` gains `{ type: 'draft/replace'; roomId: Id; content: PlanContent; expected: PlanContent }`.

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/canonical.test.ts`:
```ts
import { expect, it } from 'vitest';
import { canonicalJson } from './canonical';

it('ignores key order and keeps array order', () => {
  expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe(canonicalJson({ a: { c: null, d: [2, 1] }, b: 1 }));
  expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
});

it('drops undefined fields like JSON does', () => {
  expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
});
```

Append to `packages/domain/src/commands/workspace.test.ts`:
```ts
describe('draft/replace', () => {
  it('restores a draft only while it still matches what the user saw', () => {
    const ws = seeded();
    const before = currentRevision(findRoom(ws, 'r')!.room.plan).content;
    const edited = run(ws, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 9 } } });
    const seen = currentRevision(findRoom(edited, 'r')!.room.plan).content;
    const undone = apply(edited, { type: 'draft/replace', roomId: 'r', content: before, expected: seen });
    expect(undone.ok && currentRevision(findRoom(undone.value, 'r')!.room.plan).content.survey.width).toBe(5);
    // Someone else widened it again: the old "seen" content no longer matches.
    const changedAgain = run(edited, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 11 } } });
    expect(apply(changedAgain, { type: 'draft/replace', roomId: 'r', content: before, expected: seen })).toMatchObject({ ok: false, error: { code: 'stale', targets: ['r'] } });
    expect(apply(edited, { type: 'draft/replace', roomId: 'nope', content: before, expected: seen })).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @glasshouse/domain exec vitest run src/canonical.test.ts src/commands/workspace.test.ts`
Expected: FAIL — `Cannot find module './canonical'` and a type/assertion failure for `draft/replace`.

- [ ] **Step 3: Implement**

`packages/domain/src/canonical.ts`:
```ts
/** JSON with object keys sorted, so two equal values always serialise the same way. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}
```

`packages/domain/src/result.ts` line 3:
```ts
export type DomainErrorCode = 'not_found' | 'not_draft' | 'invalid_value' | 'out_of_bounds' | 'stale';
```

`packages/domain/src/commands/workspace.ts` — add to the `WorkspaceCommand` union (after the `'plan'` member):
```ts
  /** Undo/redo: restores a draft, but only if it is still what the user saw — never over someone else's edit. */
  | { type: 'draft/replace'; roomId: Id; content: PlanContent; expected: PlanContent }
```
add the import `import { canonicalJson } from '../canonical';` and, in `apply`, directly before `case 'plan':`:
```ts
    case 'draft/replace': {
      const loc = findRoom(ws, cmd.roomId);
      if (!loc) return gone('room', cmd.roomId);
      if (canonicalJson(currentRevision(loc.room.plan).content) !== canonicalJson(cmd.expected)) {
        return err('stale', 'This room changed since, so that undo would overwrite newer work.', [cmd.roomId]);
      }
      return replaceDraftContent(ws, cmd.roomId, cmd.content);
    }
```

`packages/domain/src/index.ts` — add `export * from './canonical';`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: all pass (253+ tests).

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): draft/replace command that refuses stale undo"
```

---

### Task 2: Server package, config and command stores

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`, `apps/server/vitest.db.config.ts`, `apps/server/build.mjs`
- Create: `apps/server/src/config.ts`, `apps/server/src/config.test.ts`
- Create: `apps/server/src/store/commandStore.ts`, `apps/server/src/store/memoryStore.ts`, `apps/server/src/store/memoryStore.test.ts`
- Modify: `.gitignore` (add `apps/web/dist-server/`)

**Interfaces:**
- Produces:
  - `loadConfig(env: Record<string, string | undefined>): Config` with `Config = { port: number; host: string; store: 'postgres' | 'memory'; databaseUrl: string | null; auth: 'dev-insecure'; webDir: string | null; seedSample: boolean }`
  - `interface Actor { id: string; name: string }`
  - `interface LoggedCommand { seq: number; clientId: string; commandId: string; actor: Actor; command: WorkspaceCommand }`
  - `interface StoredSnapshot { seq: number; workspace: unknown }`
  - `interface CommandStore { latestSnapshot(): Promise<StoredSnapshot | null>; commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]>; findCommand(clientId: string, commandId: string): Promise<LoggedCommand | null>; append(entry: LoggedCommand): Promise<void>; saveSnapshot(seq: number, workspace: Workspace): Promise<void>; close(): Promise<void> }`
  - `class MemoryCommandStore implements CommandStore`

- [ ] **Step 1: Scaffold the package**

`apps/server/package.json`:
```json
{
  "name": "@glasshouse/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc --noEmit && node build.mjs",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:db": "vitest run --config vitest.db.config.ts",
    "typecheck": "tsc --noEmit"
  }
}
```
Then install (versions resolve to current):
```bash
pnpm --filter @glasshouse/server add @glasshouse/domain@workspace:* fastify @fastify/static pg zod
pnpm --filter @glasshouse/server add -D typescript vitest tsx esbuild @types/node @types/pg @testcontainers/postgresql
```

`apps/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "vitest.config.ts", "vitest.db.config.ts"]
}
```

`apps/server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['src/**/*.test.ts'], exclude: ['src/**/*.db.test.ts'] } });
```

`apps/server/vitest.db.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

// Needs Docker: starts a throwaway Postgres per file.
export default defineConfig({ test: { include: ['src/**/*.db.test.ts'], testTimeout: 60_000, hookTimeout: 180_000 } });
```

`apps/server/build.mjs`:
```js
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// Bundle our own source and @glasshouse/domain; leave the server's npm dependencies to node_modules.
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@glasshouse/'));

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: [...external, 'pg-native'],
  // The domain's own dependencies (immer, zod, polygon-clipping) are bundled.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
```

Add `apps/web/dist-server/` and `apps/server/dist/` to `.gitignore` (the root already ignores `dist/`; add the `dist-server` line).

- [ ] **Step 2: Write failing tests for config and the memory store**

`apps/server/src/config.test.ts`:
```ts
import { expect, it } from 'vitest';
import { loadConfig } from './config';

it('refuses to start without an auth mode, so nothing ships open by accident', () => {
  expect(() => loadConfig({ GLASSHOUSE_STORE: 'memory' })).toThrow(/GLASSHOUSE_AUTH/);
});

it('needs a database URL for the Postgres store', () => {
  expect(() => loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure' })).toThrow(/DATABASE_URL/);
});

it('reads a complete configuration with defaults', () => {
  expect(loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure', GLASSHOUSE_STORE: 'memory' })).toEqual({
    port: 8787, host: '127.0.0.1', store: 'memory', databaseUrl: null, auth: 'dev-insecure', webDir: null, seedSample: false,
  });
  expect(loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure', DATABASE_URL: 'postgres://x', PORT: '9000', GLASSHOUSE_SEED_SAMPLE: '1' })).toMatchObject({ port: 9000, store: 'postgres', databaseUrl: 'postgres://x', seedSample: true });
});
```

`apps/server/src/store/memoryStore.test.ts`:
```ts
import { createWorkspace } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { MemoryCommandStore } from './memoryStore';

const actor = { id: 'dev:Ploy', name: 'Ploy' };
const entry = (seq: number, commandId = `c${seq}`) => ({ seq, clientId: 'a', commandId, actor, command: { type: 'project/create' as const, id: `p${seq}`, name: `P${seq}` } });

it('keeps commands in order, pages them and finds them by client command id', async () => {
  const store = new MemoryCommandStore();
  await store.append(entry(1));
  await store.append(entry(2));
  await store.append(entry(3));
  expect((await store.commandsAfter(1, 1)).map((c) => c.seq)).toEqual([2]);
  expect(await store.findCommand('a', 'c3')).toMatchObject({ seq: 3, actor });
  expect(await store.findCommand('b', 'c3')).toBeNull();
});

it('refuses a repeated seq or a repeated client command id', async () => {
  const store = new MemoryCommandStore();
  await store.append(entry(1));
  await expect(store.append(entry(1, 'other'))).rejects.toThrow(/seq 1/);
  await expect(store.append(entry(2, 'c1'))).rejects.toThrow(/already logged/);
});

it('returns the latest snapshot as a copy', async () => {
  const store = new MemoryCommandStore();
  expect(await store.latestSnapshot()).toBeNull();
  const ws = createWorkspace();
  await store.saveSnapshot(4, ws);
  const snap = await store.latestSnapshot();
  expect(snap).toMatchObject({ seq: 4 });
  expect(snap!.workspace).not.toBe(ws);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @glasshouse/server test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`apps/server/src/config.ts`:
```ts
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_URL: z.string().min(1).optional(),
  GLASSHOUSE_STORE: z.enum(['postgres', 'memory']).default('postgres'),
  GLASSHOUSE_AUTH: z.enum(['dev-insecure']).optional(),
  GLASSHOUSE_WEB_DIR: z.string().min(1).optional(),
  GLASSHOUSE_SEED_SAMPLE: z.enum(['0', '1']).default('0'),
});

export interface Config {
  port: number;
  host: string;
  store: 'postgres' | 'memory';
  databaseUrl: string | null;
  auth: 'dev-insecure';
  webDir: string | null;
  seedSample: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid Glasshouse server configuration: ${z.prettifyError(parsed.error)}`);
  const c = parsed.data;
  if (!c.GLASSHOUSE_AUTH) {
    throw new Error('GLASSHOUSE_AUTH is not set. This build only supports GLASSHOUSE_AUTH=dev-insecure, for local development.');
  }
  if (c.GLASSHOUSE_STORE === 'postgres' && !c.DATABASE_URL) throw new Error('DATABASE_URL is required when GLASSHOUSE_STORE=postgres.');
  return {
    port: c.PORT,
    host: c.HOST,
    store: c.GLASSHOUSE_STORE,
    databaseUrl: c.DATABASE_URL ?? null,
    auth: c.GLASSHOUSE_AUTH,
    webDir: c.GLASSHOUSE_WEB_DIR ?? null,
    seedSample: c.GLASSHOUSE_SEED_SAMPLE === '1',
  };
}
```

`apps/server/src/store/commandStore.ts`:
```ts
import type { Workspace, WorkspaceCommand } from '@glasshouse/domain';

/** Who sent a command. Plan A: a dev stand-in; Plan B: the signed-in user. */
export interface Actor {
  id: string;
  name: string;
}

export interface LoggedCommand {
  seq: number;
  clientId: string;
  commandId: string;
  actor: Actor;
  command: WorkspaceCommand;
}

/** Raw: a snapshot written by an older version is migrated by parseWorkspace on load. */
export interface StoredSnapshot {
  seq: number;
  workspace: unknown;
}

/** Append-only command log plus periodic snapshots. `append` throws on a repeated seq or (clientId, commandId). */
export interface CommandStore {
  latestSnapshot(): Promise<StoredSnapshot | null>;
  commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]>;
  findCommand(clientId: string, commandId: string): Promise<LoggedCommand | null>;
  append(entry: LoggedCommand): Promise<void>;
  saveSnapshot(seq: number, workspace: Workspace): Promise<void>;
  close(): Promise<void>;
}
```

`apps/server/src/store/memoryStore.ts`:
```ts
import type { Workspace } from '@glasshouse/domain';
import type { CommandStore, LoggedCommand, StoredSnapshot } from './commandStore';

/** For tests and the e2e server: same contract as Postgres, gone on restart. */
export class MemoryCommandStore implements CommandStore {
  private readonly log: LoggedCommand[] = [];
  private snapshot: StoredSnapshot | null = null;

  async latestSnapshot(): Promise<StoredSnapshot | null> {
    return this.snapshot === null ? null : structuredClone(this.snapshot);
  }

  async commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]> {
    return this.log.filter((c) => c.seq > seq).slice(0, limit).map((c) => structuredClone(c));
  }

  async findCommand(clientId: string, commandId: string): Promise<LoggedCommand | null> {
    const found = this.log.find((c) => c.clientId === clientId && c.commandId === commandId);
    return found ? structuredClone(found) : null;
  }

  async append(entry: LoggedCommand): Promise<void> {
    if (this.log.some((c) => c.seq === entry.seq)) throw new Error(`seq ${entry.seq} is already in the log.`);
    if (this.log.some((c) => c.clientId === entry.clientId && c.commandId === entry.commandId)) {
      throw new Error(`Command ${entry.commandId} from ${entry.clientId} is already logged.`);
    }
    this.log.push(structuredClone(entry));
  }

  async saveSnapshot(seq: number, workspace: Workspace): Promise<void> {
    this.snapshot = { seq, workspace: structuredClone(workspace) };
  }

  async close(): Promise<void> {}
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/server test && pnpm --filter @glasshouse/server typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server .gitignore pnpm-lock.yaml
git commit -m "feat(server): package scaffold, config and in-memory command store"
```

---

### Task 3: WorkspaceService — ordering, validation, idempotency, snapshots, replay

**Files:**
- Create: `apps/server/src/workspaceService.ts`, `apps/server/src/workspaceService.test.ts`

**Interfaces:**
- Consumes: `CommandStore`, `LoggedCommand`, `Actor` (Task 2); `apply`, `parseWorkspace`, `createWorkspace`, `withSample` (domain).
- Produces:
  - `interface Submission { clientId: string; commandId: string; command: WorkspaceCommand }`
  - `type SubmitOutcome = { kind: 'accepted'; seq: number; duplicate: boolean } | { kind: 'rejected'; error: DomainError }`
  - `interface BatchOutcome { accepted: { commandId: string; seq: number }[]; rejected: { commandId: string; error: DomainError } | null; skipped: string[] }`
  - `class WorkspaceService` with `static open(store, options?: { seedSample?: boolean; snapshotEvery?: number; now?: () => string; onError?: (message: string, error: unknown) => void }): Promise<WorkspaceService>`, `get state(): { seq: number; workspace: Workspace }`, `submit(s: Submission, actor: Actor): Promise<SubmitOutcome>`, `submitBatch(clientId: string, items: { commandId: string; command: WorkspaceCommand }[], actor: Actor): Promise<BatchOutcome>`, `subscribe(listener: (entry: LoggedCommand) => void): () => void`, `commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]>`, `flush(): Promise<void>` (writes a snapshot)
  - `const SNAPSHOT_EVERY = 200`

- [ ] **Step 1: Write the failing tests**

`apps/server/src/workspaceService.test.ts`:
```ts
import { type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { LoggedCommand } from './store/commandStore';
import { MemoryCommandStore } from './store/memoryStore';
import { WorkspaceService } from './workspaceService';

const ploy = { id: 'dev:Ploy', name: 'Ploy' };
const create = (id: string, name = id): WorkspaceCommand => ({ type: 'project/create', id, name });
const submit = (svc: WorkspaceService, commandId: string, command: WorkspaceCommand, clientId = 'a') => svc.submit({ clientId, commandId, command }, ploy);

describe('WorkspaceService', () => {
  it('orders accepted commands with a global seq and tells subscribers', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const seen: LoggedCommand[] = [];
    svc.subscribe((e) => seen.push(e));
    expect(await submit(svc, '1', create('p'))).toEqual({ kind: 'accepted', seq: 1, duplicate: false });
    expect(await submit(svc, '2', create('q'), 'b')).toEqual({ kind: 'accepted', seq: 2, duplicate: false });
    expect(svc.state.seq).toBe(2);
    expect(svc.state.workspace.projects.map((p) => p.id)).toEqual(['p', 'q']);
    expect(seen.map((e) => [e.seq, e.clientId, e.actor.name])).toEqual([[1, 'a', 'Ploy'], [2, 'b', 'Ploy']]);
  });

  it('applies a retried command once and answers with its original seq', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    await submit(svc, '1', create('p'));
    expect(await submit(svc, '1', create('p'))).toEqual({ kind: 'accepted', seq: 1, duplicate: true });
    expect(svc.state.seq).toBe(1);
  });

  it('rejects a command the domain refuses, with its reason, and changes nothing', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const outcome = await submit(svc, '1', create('p', ''));
    expect(outcome).toMatchObject({ kind: 'rejected', error: { code: 'invalid_value' } });
    expect(svc.state.seq).toBe(0);
  });

  it('refuses malformed commands without crashing', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const garbage = { type: 'plan', roomId: 'nope' } as unknown as WorkspaceCommand;
    expect((await submit(svc, '1', garbage)).kind).toBe('rejected');
    const unknown = { type: 'launch/rockets' } as unknown as WorkspaceCommand;
    expect((await submit(svc, '2', unknown)).kind).toBe('rejected');
    expect(await submit(svc, '3', create('p'))).toMatchObject({ kind: 'accepted', seq: 1 });
  });

  it('refuses browser-only commands', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    expect(await submit(svc, '1', { type: 'backup/mark', at: '2026-10-17T00:00:00.000Z' })).toMatchObject({ kind: 'rejected' });
  });

  it('keeps memory unchanged when the log write fails', async () => {
    class FailingStore extends MemoryCommandStore {
      override async append(): Promise<void> {
        throw new Error('disk full');
      }
    }
    const svc = await WorkspaceService.open(new FailingStore());
    await expect(submit(svc, '1', create('p'))).rejects.toThrow('disk full');
    expect(svc.state.seq).toBe(0);
    expect(svc.state.workspace.projects).toEqual([]);
  });

  it('processes a batch in order and stops at the first rejection', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const out = await svc.submitBatch('a', [
      { commandId: '1', command: create('p') },
      { commandId: '2', command: create('p') },
      { commandId: '3', command: create('q') },
    ], ploy);
    expect(out.accepted).toEqual([{ commandId: '1', seq: 1 }]);
    expect(out.rejected).toMatchObject({ commandId: '2', error: { code: 'invalid_value' } });
    expect(out.skipped).toEqual(['3']);
  });

  it('serialises concurrent submissions', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const outcomes = await Promise.all(['p', 'q', 'r'].map((id, i) => submit(svc, String(i), create(id), `c${i}`)));
    expect(outcomes.map((o) => (o.kind === 'accepted' ? o.seq : 0)).sort()).toEqual([1, 2, 3]);
  });

  it('rebuilds the same workspace after a restart from snapshot plus log tail', async () => {
    const store = new MemoryCommandStore();
    const svc = await WorkspaceService.open(store, { snapshotEvery: 2 });
    for (const [i, id] of ['p', 'q', 'r'].entries()) await submit(svc, String(i), create(id));
    expect((await store.latestSnapshot())?.seq).toBe(2);
    const again = await WorkspaceService.open(store);
    expect(again.state.seq).toBe(3);
    expect(again.state.workspace).toEqual(svc.state.workspace);
  });

  it('keeps the seeded sample IDs stable across restarts', async () => {
    const store = new MemoryCommandStore();
    const first = await WorkspaceService.open(store, { seedSample: true });
    const ids = first.state.workspace.projects.map((p) => p.id);
    expect(ids.length).toBeGreaterThan(0);
    const second = await WorkspaceService.open(store, { seedSample: true });
    expect(second.state.workspace.projects.map((p) => p.id)).toEqual(ids);
  });

  it('logs, and does not fail the edit, when a snapshot write fails', async () => {
    class SnapshotFails extends MemoryCommandStore {
      calls = 0;
      override async saveSnapshot(...args: Parameters<MemoryCommandStore['saveSnapshot']>): Promise<void> {
        this.calls += 1;
        if (this.calls > 1) throw new Error('snapshot disk full');
        return super.saveSnapshot(...args);
      }
    }
    const onError = vi.fn();
    const svc = await WorkspaceService.open(new SnapshotFails(), { snapshotEvery: 1, onError });
    expect(await submit(svc, '1', create('p'))).toMatchObject({ kind: 'accepted', seq: 1 });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('snapshot'), expect.any(Error));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @glasshouse/server exec vitest run src/workspaceService.test.ts`
Expected: FAIL — `Cannot find module './workspaceService'`.

- [ ] **Step 3: Implement**

`apps/server/src/workspaceService.ts`:
```ts
import { apply, createWorkspace, err, parseWorkspace, withSample, type DomainError, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import type { Actor, CommandStore, LoggedCommand } from './store/commandStore';

export const SNAPSHOT_EVERY = 200;
const REPLAY_PAGE = 1000;
/** Only meaningful for a browser-local workspace. */
const BROWSER_ONLY = new Set<string>(['backup/mark']);

export interface Submission {
  clientId: string;
  commandId: string;
  command: WorkspaceCommand;
}

export type SubmitOutcome = { kind: 'accepted'; seq: number; duplicate: boolean } | { kind: 'rejected'; error: DomainError };

export interface BatchOutcome {
  accepted: { commandId: string; seq: number }[];
  rejected: { commandId: string; error: DomainError } | null;
  skipped: string[];
}

interface OpenOptions {
  seedSample?: boolean;
  snapshotEvery?: number;
  now?: () => string;
  onError?: (message: string, error: unknown) => void;
}

type Listener = (entry: LoggedCommand) => void;

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const rejected = (message: string): SubmitOutcome => ({ kind: 'rejected', error: err('invalid_value', message).error });

/**
 * The one place edits are accepted. Holds the workspace in memory, applies commands strictly one at a time,
 * validates the result, logs it, then tells subscribers. Single instance by design (see the P1 design doc).
 */
export class WorkspaceService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<Listener>();
  private sinceSnapshot = 0;

  private constructor(
    private readonly store: CommandStore,
    private current: { seq: number; workspace: Workspace },
    private readonly snapshotEvery: number,
    private readonly onError: (message: string, error: unknown) => void,
  ) {}

  static async open(store: CommandStore, options: OpenOptions = {}): Promise<WorkspaceService> {
    const onError = options.onError ?? ((message, error) => console.error(message, error));
    const snapshot = await store.latestSnapshot();
    let seq = 0;
    let workspace: Workspace;
    if (snapshot) {
      const parsed = parseWorkspace(snapshot.workspace);
      if (!parsed.ok) throw new Error(`The snapshot at seq ${snapshot.seq} is not a valid workspace: ${parsed.error.message}`);
      workspace = parsed.value;
      seq = snapshot.seq;
    } else {
      workspace = createWorkspace();
      if (options.seedSample) {
        const seeded = withSample(workspace, (options.now ?? (() => new Date().toISOString()))());
        if (!seeded.ok) throw new Error(`The sample projects could not be built: ${seeded.error.message}`);
        workspace = seeded.value;
      }
    }
    for (;;) {
      const page = await store.commandsAfter(seq, REPLAY_PAGE);
      if (page.length === 0) break;
      for (const entry of page) {
        if (entry.seq !== seq + 1) throw new Error(`The command log has a gap after seq ${seq} (next is ${entry.seq}).`);
        const result = apply(workspace, entry.command);
        if (!result.ok) throw new Error(`Replaying seq ${entry.seq} failed: ${result.error.message}`);
        workspace = result.value;
        seq = entry.seq;
      }
    }
    // Always snapshot after boot: keeps the replay tail short and pins a seeded sample's IDs.
    await store.saveSnapshot(seq, workspace);
    return new WorkspaceService(store, { seq, workspace }, options.snapshotEvery ?? SNAPSHOT_EVERY, onError);
  }

  get state(): { seq: number; workspace: Workspace } {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]> {
    return this.store.commandsAfter(seq, limit);
  }

  submit(submission: Submission, actor: Actor): Promise<SubmitOutcome> {
    return this.enqueue(() => this.submitNow(submission, actor));
  }

  async submitBatch(clientId: string, items: { commandId: string; command: WorkspaceCommand }[], actor: Actor): Promise<BatchOutcome> {
    const accepted: BatchOutcome['accepted'] = [];
    for (const [i, item] of items.entries()) {
      const outcome = await this.submit({ clientId, ...item }, actor);
      if (outcome.kind === 'rejected') {
        return { accepted, rejected: { commandId: item.commandId, error: outcome.error }, skipped: items.slice(i + 1).map((x) => x.commandId) };
      }
      accepted.push({ commandId: item.commandId, seq: outcome.seq });
    }
    return { accepted, rejected: null, skipped: [] };
  }

  /** Writes a snapshot now (used on shutdown). */
  flush(): Promise<void> {
    return this.enqueue(() => this.writeSnapshot());
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async submitNow({ clientId, commandId, command }: Submission, actor: Actor): Promise<SubmitOutcome> {
    const previous = await this.store.findCommand(clientId, commandId);
    if (previous) return { kind: 'accepted', seq: previous.seq, duplicate: true };
    if (BROWSER_ONLY.has(command.type)) return rejected(`"${command.type}" only applies to a workspace stored in one browser.`);
    let result: ReturnType<typeof apply>;
    try {
      result = apply(this.current.workspace, command);
    } catch (e) {
      return rejected(`That change could not be applied: ${describe(e)}`);
    }
    if (!result.ok) return { kind: 'rejected', error: result.error };
    const checked = parseWorkspace(result.value);
    if (!checked.ok) return rejected(`That change would leave the workspace invalid: ${checked.error.message}`);
    const entry: LoggedCommand = { seq: this.current.seq + 1, clientId, commandId, actor, command };
    await this.store.append(entry);
    this.current = { seq: entry.seq, workspace: result.value };
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (e) {
        this.onError(`A live-update listener failed at seq ${entry.seq}`, e);
      }
    }
    this.sinceSnapshot += 1;
    if (this.sinceSnapshot >= this.snapshotEvery) {
      try {
        await this.writeSnapshot();
      } catch (e) {
        // The command is safely logged; the next snapshot retries. Say so loudly.
        this.onError(`Writing the snapshot at seq ${entry.seq} failed`, e);
      }
    }
    return { kind: 'accepted', seq: entry.seq, duplicate: false };
  }

  private async writeSnapshot(): Promise<void> {
    await this.store.saveSnapshot(this.current.seq, this.current.workspace);
    this.sinceSnapshot = 0;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/server test && pnpm --filter @glasshouse/server typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/workspaceService.ts apps/server/src/workspaceService.test.ts
git commit -m "feat(server): workspace service orders, validates and logs commands"
```

---

### Task 4: Postgres command store and migrations

**Files:**
- Create: `apps/server/src/store/migrations.ts`, `apps/server/src/store/pgStore.ts`, `apps/server/src/store/pgStore.db.test.ts`
- Create: `docker-compose.dev.yml`

**Interfaces:**
- Consumes: `CommandStore`, `LoggedCommand` (Task 2); `WorkspaceService` (Task 3, in the test).
- Produces: `class PgCommandStore implements CommandStore` with `static connect(url: string): Promise<PgCommandStore>`; `migrate(pool: pg.Pool): Promise<void>`.

- [ ] **Step 1: Write the failing DB test**

`apps/server/src/store/pgStore.db.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Start Docker Desktop first. Run: `pnpm --filter @glasshouse/server test:db`
Expected: FAIL — `Cannot find module './pgStore'`.

- [ ] **Step 3: Implement**

`apps/server/src/store/migrations.ts`:
```ts
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
```

`apps/server/src/store/pgStore.ts`:
```ts
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
  actor: { id: r.actor_id, name: r.actor_name },
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
```

`docker-compose.dev.yml` (repo root):
```yaml
# Local Postgres for `pnpm dev:server`. Not a production deployment (that is Plan C).
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: glasshouse
      POSTGRES_PASSWORD: glasshouse
      POSTGRES_DB: glasshouse
    ports: ['127.0.0.1:5432:5432']
    volumes: ['glasshouse-db:/var/lib/postgresql/data']
volumes:
  glasshouse-db:
```

- [ ] **Step 4: Run DB tests, unit tests and typecheck**

Run: `pnpm --filter @glasshouse/server test:db && pnpm --filter @glasshouse/server test && pnpm --filter @glasshouse/server typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/store docker-compose.dev.yml
git commit -m "feat(server): Postgres command log, snapshots and migrations"
```

---

### Task 5: HTTP API — workspace, commands, live events, dev auth, static web, main

**Files:**
- Create: `apps/server/src/http/app.ts`, `apps/server/src/http/commands.ts`, `apps/server/src/http/events.ts`, `apps/server/src/http/devAuth.ts`, `apps/server/src/main.ts`
- Test: `apps/server/src/http/app.test.ts`, `apps/server/src/http/events.test.ts`
- Modify: root `package.json` (scripts)

**Interfaces:**
- Consumes: `WorkspaceService`, `BatchOutcome` (Task 3); `MemoryCommandStore`, `PgCommandStore`, `Actor`; `loadConfig`.
- Produces (HTTP contract used by Task 6):
  - `GET /api/health` → `200 { ok: true, seq: number }` (no auth)
  - `GET /api/workspace` → `200 { seq: number, workspace: Workspace }`
  - `POST /api/commands` body `{ clientId: string, commands: { commandId: string, command: WorkspaceCommand }[] }` (1–500 items) → `200 BatchOutcome`; `400 { error: DomainError }` if malformed; `500` on storage failure
  - `GET /api/events?after=N` (or `Last-Event-ID: N`) → `text/event-stream` with `id: <seq>\nevent: command\ndata: {"seq","clientId","commandId","command"}` and `event: resync\ndata: {}` (then the stream ends)
  - Any `/api/*` except health → `401 { error }` when `authenticate` returns null
  - `type Authenticate = (request: FastifyRequest) => Actor | null`; `buildApp(deps: { service: WorkspaceService; authenticate: Authenticate; webDir?: string | null; logger?: boolean }): Promise<FastifyInstance>`
  - `const MAX_CATCH_UP = 1000`

- [ ] **Step 1: Write the failing tests**

`apps/server/src/http/app.test.ts`:
```ts
import { afterEach, expect, it } from 'vitest';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { buildApp } from './app';
import { devAuthenticate } from './devAuth';

const apps: { close(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function setup(authenticate = devAuthenticate) {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({ service, authenticate });
  apps.push(app);
  return { app, service };
}

it('serves health without auth and the workspace with it', async () => {
  const { app } = await setup(() => null);
  expect((await app.inject({ url: '/api/health' })).json()).toEqual({ ok: true, seq: 0 });
  expect((await app.inject({ url: '/api/workspace' })).statusCode).toBe(401);
});

it('accepts a batch of commands and stamps the actor', async () => {
  const { app, service } = await setup();
  const res = await app.inject({
    method: 'POST', url: '/api/commands', headers: { 'x-glasshouse-dev-user': 'Ploy' },
    payload: { clientId: 'a', commands: [{ commandId: '1', command: { type: 'project/create', id: 'p', name: 'Riverside' } }] },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ accepted: [{ commandId: '1', seq: 1 }], rejected: null, skipped: [] });
  expect((await service.commandsAfter(0, 10))[0]?.actor).toEqual({ id: 'dev:Ploy', name: 'Ploy' });
  expect((await app.inject({ url: '/api/workspace' })).json()).toMatchObject({ seq: 1, workspace: { projects: [{ name: 'Riverside' }] } });
});

it('answers 400 to a body that is not a list of commands', async () => {
  const { app } = await setup();
  const res = await app.inject({ method: 'POST', url: '/api/commands', payload: { clientId: 'a', commands: 'nope' } });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toMatchObject({ error: { code: 'invalid_value' } });
});

it('accepts a large project import', async () => {
  const { app } = await setup();
  const big = 'x'.repeat(3 * 1024 * 1024);
  const res = await app.inject({
    method: 'POST', url: '/api/commands',
    payload: { clientId: 'a', commands: [{ commandId: '1', command: { type: 'project/create', id: 'p', name: 'P', padding: big } }] },
  });
  expect(res.statusCode).toBe(200);
});
```

`apps/server/src/http/events.test.ts` (real socket, because SSE is a long-lived response):
```ts
import type { FastifyInstance } from 'fastify';
import { afterEach, expect, it } from 'vitest';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { buildApp } from './app';
import { devAuthenticate } from './devAuth';
import { MAX_CATCH_UP } from './events';

let app: FastifyInstance | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

const actor = { id: 'dev:t', name: 't' };

async function start(service: WorkspaceService): Promise<string> {
  app = await buildApp({ service, authenticate: devAuthenticate });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}

/** Reads the stream until `until` matches the text so far, then aborts. */
async function readEvents(url: string, until: (text: string) => boolean, init: RequestInit = {}): Promise<string> {
  const controller = new AbortController();
  const res = await fetch(url, { ...init, signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (until(text)) break;
  }
  controller.abort();
  return text;
}

const create = (i: number) => ({ clientId: 'a', commandId: String(i), command: { type: 'project/create' as const, id: `p${i}`, name: `P${i}` } });

it('sends what the client missed, then live commands, in order', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  await service.submit(create(1), actor);
  await service.submit(create(2), actor);
  const base = await start(service);
  const reading = readEvents(`${base}/api/events?after=1`, (t) => t.includes('id: 3'));
  await new Promise((r) => setTimeout(r, 100));
  await service.submit(create(3), actor);
  const text = await reading;
  expect([...text.matchAll(/id: (\d+)/g)].map((m) => Number(m[1]))).toEqual([2, 3]);
  expect(text).toContain('event: command');
});

it('honours Last-Event-ID on reconnect', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  for (const i of [1, 2, 3]) await service.submit(create(i), actor);
  const base = await start(service);
  const text = await readEvents(`${base}/api/events?after=0`, (t) => t.includes('id: 3'), { headers: { 'last-event-id': '2' } });
  expect([...text.matchAll(/id: (\d+)/g)].map((m) => Number(m[1]))).toEqual([3]);
});

it('tells a far-behind client to resync', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  for (let i = 1; i <= MAX_CATCH_UP + 1; i += 1) await service.submit(create(i), actor);
  const base = await start(service);
  const text = await readEvents(`${base}/api/events?after=0`, (t) => t.includes('event: resync'));
  expect(text).toContain('event: resync');
  expect(text).not.toContain('event: command');
});

it('tells a client ahead of the server to resync', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const base = await start(service);
  const text = await readEvents(`${base}/api/events?after=50`, (t) => t.includes('event: resync'));
  expect(text).toContain('event: resync');
});

it('answers 400 when the client does not say where it is', async () => {
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const base = await start(service);
  expect((await fetch(`${base}/api/events`)).status).toBe(400);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @glasshouse/server exec vitest run src/http`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/server/src/http/devAuth.ts`:
```ts
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../store/commandStore';

export type Authenticate = (request: FastifyRequest) => Actor | null;

const NAME_MAX = 60;

/** GLASSHOUSE_AUTH=dev-insecure: trusts a header (or "Developer"). Never for a shared deployment — Plan B replaces it. */
export const devAuthenticate: Authenticate = (request) => {
  const header = request.headers['x-glasshouse-dev-user'];
  const name = typeof header === 'string' && header.trim() !== '' ? header.trim().slice(0, NAME_MAX) : 'Developer';
  return { id: `dev:${name}`, name };
};
```

`apps/server/src/http/commands.ts`:
```ts
import type { WorkspaceCommand } from '@glasshouse/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { WorkspaceService } from '../workspaceService';

const ID_MAX = 100;
const BATCH_MAX = 500;

// The command itself is checked by the domain; here only the envelope.
const body = z.object({
  clientId: z.string().min(1).max(ID_MAX),
  commands: z.array(z.object({ commandId: z.string().min(1).max(ID_MAX), command: z.looseObject({ type: z.string().min(1) }) })).min(1).max(BATCH_MAX),
});

export function registerCommands(app: FastifyInstance, service: WorkspaceService): void {
  app.post('/api/commands', async (request, reply) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'invalid_value', message: 'The request is not a list of commands.', targets: [] } });
    }
    const items = parsed.data.commands.map((c) => ({ commandId: c.commandId, command: c.command as unknown as WorkspaceCommand }));
    return service.submitBatch(parsed.data.clientId, items, request.actor!);
  });
}
```

`apps/server/src/http/events.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { LoggedCommand } from '../store/commandStore';
import type { WorkspaceService } from '../workspaceService';

export const MAX_CATCH_UP = 1000;
const HEARTBEAT_MS = 20_000;

const frame = (e: LoggedCommand): string =>
  `id: ${e.seq}\nevent: command\ndata: ${JSON.stringify({ seq: e.seq, clientId: e.clientId, commandId: e.commandId, command: e.command })}\n\n`;

export function registerEvents(app: FastifyInstance, service: WorkspaceService): void {
  app.get('/api/events', async (request, reply) => {
    const header = request.headers['last-event-id'];
    const query = (request.query as { after?: string }).after;
    const after = Number(typeof header === 'string' && header !== '' ? header : (query ?? Number.NaN));
    if (!Number.isInteger(after) || after < 0) {
      return reply.code(400).send({ error: { code: 'invalid_value', message: 'Say which sequence number you already have (after=N).', targets: [] } });
    }
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });

    // Subscribe before reading the backlog and buffer live events until it is written, so nothing falls in between.
    let last = after;
    let live = false;
    const buffered: LoggedCommand[] = [];
    const send = (e: LoggedCommand): void => {
      if (e.seq <= last) return;
      raw.write(frame(e));
      last = e.seq;
    };
    const unsubscribe = service.subscribe((e) => (live ? send(e) : buffered.push(e)));
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS);
    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.raw.on('close', cleanup);

    const missed = await service.commandsAfter(after, MAX_CATCH_UP + 1);
    // Ahead of the server (database restored from a backup) or too far behind: reload the whole workspace.
    if (after > service.state.seq || missed.length > MAX_CATCH_UP) {
      raw.write('event: resync\ndata: {}\n\n');
      cleanup();
      raw.end();
      return;
    }
    missed.forEach(send);
    buffered.forEach(send);
    live = true;
  });
}
```

`apps/server/src/http/app.ts`:
```ts
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Actor } from '../store/commandStore';
import type { WorkspaceService } from '../workspaceService';
import { registerCommands } from './commands';
import type { Authenticate } from './devAuth';
import { registerEvents } from './events';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

/** Project files can be several MB; the default 1 MB would refuse real imports. */
const BODY_LIMIT = 25 * 1024 * 1024;

export interface AppDeps {
  service: WorkspaceService;
  authenticate: Authenticate;
  webDir?: string | null;
  logger?: boolean;
}

export async function buildApp({ service, authenticate, webDir = null, logger = false }: AppDeps): Promise<FastifyInstance> {
  // Force-close: open event streams would otherwise keep shutdown waiting forever.
  const app = Fastify({ logger, bodyLimit: BODY_LIMIT, forceCloseConnections: true });
  app.decorateRequest('actor', null);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url === '/api/health') return;
    const actor = authenticate(request);
    if (!actor) return reply.code(401).send({ error: { code: 'unauthorised', message: 'Sign in to use Glasshouse.', targets: [] } });
    request.actor = actor;
  });
  app.get('/api/health', async () => ({ ok: true, seq: service.state.seq }));
  app.get('/api/workspace', async () => service.state);
  registerCommands(app, service);
  registerEvents(app, service);
  if (webDir) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false });
    // The web app routes on the client: any other GET outside /api gets index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found.', targets: [] } });
    });
  }
  return app;
}
```

`apps/server/src/main.ts`:
```ts
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
```

Root `package.json` scripts — add:
```json
"dev:server": "pnpm --filter @glasshouse/server dev",
"test:db": "pnpm --filter @glasshouse/server test:db"
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/server test && pnpm --filter @glasshouse/server typecheck && pnpm --filter @glasshouse/server build`
Expected: PASS; `apps/server/dist/main.js` exists.

- [ ] **Step 5: Smoke-run against Postgres**

```bash
docker compose -f docker-compose.dev.yml up -d
GLASSHOUSE_AUTH=dev-insecure DATABASE_URL=postgres://glasshouse:glasshouse@127.0.0.1:5432/glasshouse node apps/server/dist/main.js &
curl -s localhost:8787/api/health            # {"ok":true,"seq":0}
curl -s -XPOST localhost:8787/api/commands -H 'content-type: application/json' \
  -d '{"clientId":"cli","commands":[{"commandId":"1","command":{"type":"project/create","id":"p","name":"Smoke"}}]}'
kill %1 && wait; # restart and check the project is still there:
GLASSHOUSE_AUTH=dev-insecure DATABASE_URL=postgres://glasshouse:glasshouse@127.0.0.1:5432/glasshouse node apps/server/dist/main.js &
curl -s localhost:8787/api/workspace | grep -o '"name":"Smoke"'; kill %1
```
Expected: health ok, `accepted` seq 1, `"name":"Smoke"` printed after restart.

- [ ] **Step 6: Commit**

```bash
git add apps/server package.json
git commit -m "feat(server): command API, live event stream, dev auth and entry point"
```

---

### Task 6: Web sync engine and client

**Files:**
- Create: `apps/web/src/sync/syncEngine.ts`, `apps/web/src/sync/syncEngine.test.ts`
- Create: `apps/web/src/sync/syncClient.ts`, `apps/web/src/sync/syncClient.test.ts`
- Create: `apps/web/src/sync/httpTransport.ts`

**Interfaces:**
- Consumes: the HTTP contract of Task 5; `apply`, `parseWorkspace` (domain); `SaveState` type from `apps/web/src/store/workspaceStore.ts`.
- Produces:
  - `interface ServerEvent { seq: number; clientId: string; commandId: string; command: WorkspaceCommand }`
  - `interface Dropped { commandId: string; error: DomainError }`
  - `class SyncEngine` — `constructor(start: { seq: number; workspace: Workspace }, clientId: string)`, `workspace`, `seq`, `local(commandId, command): DomainError | null`, `takeUnsent(): { commandId: string; command: WorkspaceCommand }[]`, `markUnsent(ids: string[]): void`, `acked(commandId, seq): Dropped[]`, `rejected(commandId): Dropped[]`, `remote(e: ServerEvent): { kind: 'applied'; dropped: Dropped[] } | { kind: 'ignored' } | { kind: 'resync' }`, `reset(start): Dropped[]`
  - `interface Transport { fetchWorkspace(): Promise<{ seq: number; workspace: unknown }>; postCommands(clientId: string, commands: { commandId: string; command: WorkspaceCommand }[]): Promise<BatchOutcome>; openEvents(after: number, handlers: EventHandlers): () => void }` with `EventHandlers = { onOpen(): void; onCommand(e: ServerEvent): void; onResync(): void; onError(): void }`; `BatchOutcome` mirrors the server's
  - `class NetworkError extends Error`
  - `type ConnectionStatus = 'connecting' | 'live' | 'offline'`
  - `class SyncClient` — `constructor(transport, start, callbacks: SyncCallbacks, ids?: { clientId?: string; newId?: () => string })`, `start()`, `stop()`, `dispatch(command): Result<Workspace>`, `flush(): Promise<void>`, `workspace`
  - `interface SyncCallbacks { onWorkspace(ws: Workspace): void; onSave(save: SaveState): void; onConnection(status: ConnectionStatus): void; onDropped(dropped: Dropped[]): void }`
  - `httpTransport(base?: string): Transport`

- [ ] **Step 1: Write the failing engine tests**

`apps/web/src/sync/syncEngine.test.ts`:
```ts
import { apply, createWorkspace, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { SyncEngine } from './syncEngine';

const create = (id: string, name = id): WorkspaceCommand => ({ type: 'project/create', id, name });
const names = (ws: Workspace) => ws.projects.map((p) => p.name);
const start = () => ({ seq: 0, workspace: createWorkspace() });

describe('SyncEngine', () => {
  it('shows local edits at once and keeps them pending until the server orders them', () => {
    const e = new SyncEngine(start(), 'me');
    expect(e.local('1', create('p', 'Mine'))).toBeNull();
    expect(names(e.workspace)).toEqual(['Mine']);
    expect(e.takeUnsent().map((c) => c.commandId)).toEqual(['1']);
    expect(e.takeUnsent()).toEqual([]);
    expect(e.remote({ seq: 1, clientId: 'me', commandId: '1', command: create('p', 'Mine') })).toEqual({ kind: 'applied', dropped: [] });
    expect(e.seq).toBe(1);
    expect(names(e.workspace)).toEqual(['Mine']);
  });

  it('puts other people edits underneath mine, in server order', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('mine', 'Mine'));
    e.remote({ seq: 1, clientId: 'other', commandId: 'x', command: create('theirs', 'Theirs') });
    expect(names(e.workspace)).toEqual(['Theirs', 'Mine']);
  });

  it('drops a pending edit that no longer applies and says why', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('p', 'Mine'));
    const r = e.remote({ seq: 1, clientId: 'other', commandId: 'x', command: create('p', 'Theirs') });
    expect(r).toMatchObject({ kind: 'applied', dropped: [{ commandId: '1', error: { code: 'invalid_value' } }] });
    expect(names(e.workspace)).toEqual(['Theirs']);
  });

  it('returns a domain error for an edit that is invalid locally and queues nothing', () => {
    const e = new SyncEngine(start(), 'me');
    expect(e.local('1', create('p', ''))?.code).toBe('invalid_value');
    expect(e.takeUnsent()).toEqual([]);
  });

  it('ignores duplicates and asks for a resync on a gap', () => {
    const e = new SyncEngine(start(), 'me');
    e.remote({ seq: 1, clientId: 'o', commandId: 'a', command: create('a') });
    expect(e.remote({ seq: 1, clientId: 'o', commandId: 'a', command: create('a') })).toEqual({ kind: 'ignored' });
    expect(e.remote({ seq: 3, clientId: 'o', commandId: 'c', command: create('c') })).toEqual({ kind: 'resync' });
  });

  it('removes a rejected edit and replays the rest', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('p', 'One'));
    e.local('2', create('q', 'Two'));
    e.rejected('1');
    expect(names(e.workspace)).toEqual(['Two']);
  });

  it('re-sends edits that were not delivered', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('p'));
    e.takeUnsent();
    e.markUnsent(['1']);
    expect(e.takeUnsent().map((c) => c.commandId)).toEqual(['1']);
  });

  it('after a reset, keeps only edits the new state does not already contain', () => {
    const e = new SyncEngine(start(), 'me');
    e.local('1', create('p', 'Sent'));
    e.takeUnsent();
    e.acked('1', 1);
    e.local('2', create('q', 'Not sent yet'));
    const server = apply(createWorkspace(), create('p', 'Sent'));
    if (!server.ok) throw new Error(server.error.message);
    expect(e.reset({ seq: 1, workspace: server.value })).toEqual([]);
    expect(names(e.workspace)).toEqual(['Sent', 'Not sent yet']);
    expect(e.takeUnsent().map((c) => c.commandId)).toEqual(['2']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @glasshouse/web exec vitest run src/sync/syncEngine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the engine**

`apps/web/src/sync/syncEngine.ts`:
```ts
import { apply, type DomainError, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';

export interface ServerEvent {
  seq: number;
  clientId: string;
  commandId: string;
  command: WorkspaceCommand;
}

export interface Dropped {
  commandId: string;
  error: DomainError;
}

interface Pending {
  commandId: string;
  command: WorkspaceCommand;
  sent: boolean;
  /** The seq the server gave it; once confirmed state reaches it, the edit is part of confirmed state. */
  ackedSeq?: number;
}

export type RemoteResult = { kind: 'applied'; dropped: Dropped[] } | { kind: 'ignored' } | { kind: 'resync' };

/**
 * On screen = the server's confirmed state + this tab's edits it hasn't ordered yet.
 * Confirmed state only moves forward through server events, in seq order. No I/O here.
 */
export class SyncEngine {
  private confirmed: Workspace;
  private confirmedSeq: number;
  private pending: Pending[] = [];
  private view: Workspace;

  constructor(
    start: { seq: number; workspace: Workspace },
    private readonly clientId: string,
  ) {
    this.confirmed = start.workspace;
    this.confirmedSeq = start.seq;
    this.view = start.workspace;
  }

  get workspace(): Workspace {
    return this.view;
  }

  get seq(): number {
    return this.confirmedSeq;
  }

  local(commandId: string, command: WorkspaceCommand): DomainError | null {
    const result = apply(this.view, command);
    if (!result.ok) return result.error;
    this.view = result.value;
    this.pending = [...this.pending, { commandId, command, sent: false }];
    return null;
  }

  takeUnsent(): { commandId: string; command: WorkspaceCommand }[] {
    const unsent = this.pending.filter((p) => !p.sent);
    this.pending = this.pending.map((p) => (p.sent ? p : { ...p, sent: true }));
    return unsent.map(({ commandId, command }) => ({ commandId, command }));
  }

  markUnsent(ids: string[]): void {
    const set = new Set(ids);
    this.pending = this.pending.map((p) => (set.has(p.commandId) ? { ...p, sent: false } : p));
  }

  acked(commandId: string, seq: number): Dropped[] {
    this.pending = this.pending.map((p) => (p.commandId === commandId ? { ...p, ackedSeq: seq } : p));
    return seq <= this.confirmedSeq ? this.rebuild() : [];
  }

  rejected(commandId: string): Dropped[] {
    this.pending = this.pending.filter((p) => p.commandId !== commandId);
    return this.rebuild();
  }

  remote(event: ServerEvent): RemoteResult {
    if (event.seq <= this.confirmedSeq) return { kind: 'ignored' };
    if (event.seq !== this.confirmedSeq + 1) return { kind: 'resync' };
    const result = apply(this.confirmed, event.command);
    // The server accepted it, so failing here means our copy drifted: start again from the server.
    if (!result.ok) return { kind: 'resync' };
    this.confirmed = result.value;
    this.confirmedSeq = event.seq;
    if (event.clientId === this.clientId) this.pending = this.pending.filter((p) => p.commandId !== event.commandId);
    return { kind: 'applied', dropped: this.rebuild() };
  }

  /** A fresh workspace from the server (after a gap). Edits it already contains are dropped silently. */
  reset(start: { seq: number; workspace: Workspace }): Dropped[] {
    this.confirmed = start.workspace;
    this.confirmedSeq = start.seq;
    return this.rebuild();
  }

  private rebuild(): Dropped[] {
    const dropped: Dropped[] = [];
    const kept: Pending[] = [];
    let ws = this.confirmed;
    for (const p of this.pending) {
      if (p.ackedSeq !== undefined && p.ackedSeq <= this.confirmedSeq) continue;
      const result = apply(ws, p.command);
      if (result.ok) {
        ws = result.value;
        kept.push(p);
      } else {
        dropped.push({ commandId: p.commandId, error: result.error });
      }
    }
    this.pending = kept;
    this.view = ws;
    return dropped;
  }
}
```

- [ ] **Step 4: Run engine tests**

Run: `pnpm --filter @glasshouse/web exec vitest run src/sync/syncEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing client tests**

`apps/web/src/sync/syncClient.test.ts`:
```ts
import { createWorkspace, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkError, SyncClient, type BatchOutcome, type EventHandlers, type Transport } from './syncClient';

const create = (id: string, name = id): WorkspaceCommand => ({ type: 'project/create', id, name });

/** A fake server: orders commands, remembers IDs (idempotent), pushes events to the open stream. */
function fakeServer() {
  let seq = 0;
  const seen = new Map<string, number>();
  let handlers: EventHandlers | null = null;
  const posts: string[][] = [];
  let failNext = 0;
  const transport: Transport = {
    fetchWorkspace: vi.fn(async () => ({ seq, workspace: createWorkspace() })),
    postCommands: vi.fn(async (clientId, commands): Promise<BatchOutcome> => {
      posts.push(commands.map((c) => c.commandId));
      if (failNext > 0) {
        failNext -= 1;
        throw new NetworkError('server down');
      }
      const accepted = commands.map((c) => {
        const key = `${clientId}/${c.commandId}`;
        if (!seen.has(key)) {
          seq += 1;
          seen.set(key, seq);
          handlers?.onCommand({ seq, clientId, commandId: c.commandId, command: c.command });
        }
        return { commandId: c.commandId, seq: seen.get(key)! };
      });
      return { accepted, rejected: null, skipped: [] };
    }),
    openEvents: vi.fn((_after, h) => {
      handlers = h;
      h.onOpen();
      return () => {
        handlers = null;
      };
    }),
  };
  return { transport, posts, failOnce: () => void (failNext = 1), get seq() { return seq; } };
}

const callbacks = () => ({ onWorkspace: vi.fn<(ws: Workspace) => void>(), onSave: vi.fn(), onConnection: vi.fn(), onDropped: vi.fn() });

describe('SyncClient', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends an edit, then reports saved', async () => {
    const server = fakeServer();
    const cb = callbacks();
    let n = 0;
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me', newId: () => String(++n) });
    client.start();
    expect(client.dispatch(create('p', 'Riverside')).ok).toBe(true);
    await client.flush();
    expect(server.posts).toEqual([['1']]);
    expect(cb.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'saved' }));
    expect(cb.onConnection).toHaveBeenCalledWith('live');
  });

  it('retries after a network failure without applying twice', async () => {
    const server = fakeServer();
    const cb = callbacks();
    let n = 0;
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me', newId: () => String(++n) });
    client.start();
    server.failOnce();
    client.dispatch(create('p', 'Riverside'));
    const done = client.flush();
    await vi.runAllTimersAsync();
    await done;
    expect(server.posts).toEqual([['1'], ['1']]);
    expect(server.seq).toBe(1);
    expect(cb.onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'failed' }));
    expect(cb.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'saved' }));
    expect(client.workspace.projects.map((p) => p.name)).toEqual(['Riverside']);
  });

  it('shows a rejected edit as dropped with the server reason', async () => {
    const server = fakeServer();
    (server.transport.postCommands as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      accepted: [], rejected: { commandId: '1', error: { code: 'stale', message: 'Room changed', targets: [] } }, skipped: [],
    });
    const cb = callbacks();
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me', newId: () => '1' });
    client.start();
    client.dispatch(create('p'));
    await client.flush();
    expect(cb.onDropped).toHaveBeenCalledWith([{ commandId: '1', error: expect.objectContaining({ message: 'Room changed' }) }]);
    expect(client.workspace.projects).toEqual([]);
  });

  it('reloads the workspace when the stream says resync', async () => {
    const server = fakeServer();
    const cb = callbacks();
    const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me' });
    client.start();
    const handlers = (server.transport.openEvents as ReturnType<typeof vi.fn>).mock.calls[0]![1] as EventHandlers;
    handlers.onResync();
    await vi.runAllTimersAsync();
    expect(server.transport.fetchWorkspace).toHaveBeenCalled();
    expect(server.transport.openEvents).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @glasshouse/web exec vitest run src/sync/syncClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the client and transport**

`apps/web/src/sync/syncClient.ts`:
```ts
import { newId, parseWorkspace, type DomainError, type Result, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import type { SaveState } from '../store/workspaceStore';
import { SyncEngine, type Dropped, type ServerEvent } from './syncEngine';

export interface BatchOutcome {
  accepted: { commandId: string; seq: number }[];
  rejected: { commandId: string; error: DomainError } | null;
  skipped: string[];
}

export interface EventHandlers {
  onOpen(): void;
  onCommand(event: ServerEvent): void;
  onResync(): void;
  onError(): void;
}

export interface Transport {
  fetchWorkspace(): Promise<{ seq: number; workspace: unknown }>;
  /** Throws NetworkError when the server can't be reached or fails (5xx); the batch is then retried as is. */
  postCommands(clientId: string, commands: { commandId: string; command: WorkspaceCommand }[]): Promise<BatchOutcome>;
  openEvents(after: number, handlers: EventHandlers): () => void;
}

export class NetworkError extends Error {}

export type ConnectionStatus = 'connecting' | 'live' | 'offline';

export interface SyncCallbacks {
  onWorkspace(ws: Workspace): void;
  onSave(save: SaveState): void;
  onConnection(status: ConnectionStatus): void;
  onDropped(dropped: Dropped[]): void;
}

const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 15_000;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Talks to the server for one tab: batches edits, retries them with the same IDs, follows the event stream. */
export class SyncClient {
  private readonly engine: SyncEngine;
  private readonly clientId: string;
  private readonly newId: () => string;
  private flushing: Promise<void> | null = null;
  private closeEvents: (() => void) | null = null;
  private resyncing = false;
  private stopped = false;

  constructor(
    private readonly transport: Transport,
    start: { seq: number; workspace: Workspace },
    private readonly callbacks: SyncCallbacks,
    ids: { clientId?: string; newId?: () => string } = {},
  ) {
    this.clientId = ids.clientId ?? newId();
    this.newId = ids.newId ?? newId;
    this.engine = new SyncEngine(start, this.clientId);
  }

  get workspace(): Workspace {
    return this.engine.workspace;
  }

  start(): void {
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.closeEvents?.();
    this.closeEvents = null;
  }

  /** The store calls this for every edit; the returned workspace is what the screen shows. */
  dispatch(command: WorkspaceCommand): Result<Workspace> {
    const error = this.engine.local(this.newId(), command);
    if (error) return { ok: false, error };
    this.callbacks.onSave({ kind: 'saving' });
    void this.flush();
    return { ok: true, value: this.engine.workspace };
  }

  /** Sends everything queued; resolves when every sent edit has an answer from the server. */
  flush(): Promise<void> {
    this.flushing ??= this.sendAll().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async sendAll(): Promise<void> {
    let retryMs = RETRY_MIN_MS;
    while (!this.stopped) {
      const batch = this.engine.takeUnsent();
      if (batch.length === 0) break;
      let outcome: BatchOutcome;
      try {
        outcome = await this.transport.postCommands(this.clientId, batch);
      } catch (e) {
        this.engine.markUnsent(batch.map((b) => b.commandId));
        this.callbacks.onSave({ kind: 'failed', reason: `${describe(e)}. Retrying…` });
        await delay(retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
        continue;
      }
      retryMs = RETRY_MIN_MS;
      for (const a of outcome.accepted) this.report(this.engine.acked(a.commandId, a.seq));
      if (outcome.rejected) {
        const { commandId, error } = outcome.rejected;
        this.report([{ commandId, error }, ...this.engine.rejected(commandId)]);
      }
      this.engine.markUnsent(outcome.skipped);
    }
    if (!this.stopped) this.callbacks.onSave({ kind: 'saved', at: new Date() });
  }

  private report(dropped: Dropped[]): void {
    if (dropped.length > 0) this.callbacks.onDropped(dropped);
    this.callbacks.onWorkspace(this.engine.workspace);
  }

  private connect(): void {
    if (this.stopped) return;
    this.callbacks.onConnection('connecting');
    this.closeEvents = this.transport.openEvents(this.engine.seq, {
      onOpen: () => this.callbacks.onConnection('live'),
      onCommand: (event) => {
        const result = this.engine.remote(event);
        if (result.kind === 'resync') void this.resync();
        else if (result.kind === 'applied') this.report(result.dropped);
      },
      onResync: () => void this.resync(),
      // EventSource reconnects by itself and sends Last-Event-ID, so the server sends what we missed.
      onError: () => this.callbacks.onConnection('offline'),
    });
  }

  private async resync(): Promise<void> {
    if (this.resyncing || this.stopped) return;
    this.resyncing = true;
    this.closeEvents?.();
    this.closeEvents = null;
    this.callbacks.onConnection('connecting');
    for (;;) {
      try {
        // Every sent edit gets its verdict first, so the fresh state tells us exactly which are already in.
        await this.flush();
        const snapshot = await this.transport.fetchWorkspace();
        const parsed = parseWorkspace(snapshot.workspace);
        if (!parsed.ok) throw new Error(parsed.error.message);
        this.report(this.engine.reset({ seq: snapshot.seq, workspace: parsed.value }));
        break;
      } catch (e) {
        this.callbacks.onConnection('offline');
        this.callbacks.onSave({ kind: 'failed', reason: `Couldn't reload from the server: ${describe(e)}. Retrying…` });
        await delay(RETRY_MAX_MS);
        if (this.stopped) return;
      }
    }
    this.resyncing = false;
    this.connect();
  }
}
```

`apps/web/src/sync/httpTransport.ts`:
```ts
import type { WorkspaceCommand } from '@glasshouse/domain';
import { NetworkError, type BatchOutcome, type EventHandlers, type Transport } from './syncClient';
import type { ServerEvent } from './syncEngine';

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function httpTransport(base = ''): Transport {
  return {
    async fetchWorkspace() {
      let res: Response;
      try {
        res = await fetch(`${base}/api/workspace`, { headers: { accept: 'application/json' } });
      } catch (e) {
        throw new NetworkError(`Can't reach the Glasshouse server (${describe(e)})`);
      }
      if (!res.ok) throw new NetworkError(`The Glasshouse server answered ${res.status}`);
      return (await res.json()) as { seq: number; workspace: unknown };
    },
    async postCommands(clientId: string, commands: { commandId: string; command: WorkspaceCommand }[]): Promise<BatchOutcome> {
      let res: Response;
      try {
        res = await fetch(`${base}/api/commands`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-glasshouse': '1' },
          body: JSON.stringify({ clientId, commands }),
        });
      } catch (e) {
        throw new NetworkError(`Can't reach the Glasshouse server (${describe(e)})`);
      }
      if (res.status >= 500) throw new NetworkError(`The Glasshouse server answered ${res.status}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        const message = body?.error?.message ?? `The server refused the request (${res.status}).`;
        const [first, ...rest] = commands;
        return { accepted: [], rejected: { commandId: first!.commandId, error: { code: 'invalid_value', message, targets: [] } }, skipped: rest.map((c) => c.commandId) };
      }
      return (await res.json()) as BatchOutcome;
    },
    openEvents(after: number, handlers: EventHandlers) {
      const source = new EventSource(`${base}/api/events?after=${after}`);
      source.addEventListener('open', () => handlers.onOpen());
      source.addEventListener('command', (e) => handlers.onCommand(JSON.parse((e as MessageEvent<string>).data) as ServerEvent));
      source.addEventListener('resync', () => handlers.onResync());
      source.addEventListener('error', () => handlers.onError());
      return () => source.close();
    },
  };
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web exec vitest run src/sync && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/sync
git commit -m "feat(web): sync engine and client for the shared server"
```

---

### Task 7: Web server mode — store, bootstrap and UI

**Files:**
- Create: `apps/web/src/sync/serverMode.ts`, `apps/web/src/sync/serverMode.test.ts`, `apps/web/src/app/SyncNotice.tsx`
- Modify: `apps/web/src/store/workspaceStore.ts`, `apps/web/src/store/workspaceStore.test.ts`
- Modify: `apps/web/src/app/App.tsx`, `apps/web/src/app/Shell.tsx`, `apps/web/src/app/TitleBlock.tsx` (`SaveStatus`), `apps/web/src/features/tree/ProjectTree.tsx:189`, `apps/web/src/app/shell.css`
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/th.ts`, `apps/web/vite.config.ts`, `apps/web/src/vite-env.d.ts` (create if absent)

**Interfaces:**
- Consumes: `SyncClient`, `httpTransport`, `ConnectionStatus`, `Dropped` (Task 6); `draft/replace` (Task 1).
- Produces:
  - store: `setCommit(commit: (ws: Workspace, command: WorkspaceCommand) => Result<Workspace>): void` (exported function); state fields `connection: 'local' | ConnectionStatus`, `notice: string | null`; actions `setConnection(c)`, `setNotice(n: string | null)`, `adopt(ws: Workspace)` (replace workspace, keep undo history); `undo`/`redo` now return `DomainError | null`.
  - `SERVER_MODE: boolean`; `startServerSync(transport?: Transport): Promise<() => void>`.

- [ ] **Step 1: Write the failing store tests**

Append to `apps/web/src/store/workspaceStore.test.ts` (inside the existing `describe`):
```ts
  it('undoes through draft/replace, and refuses when the room changed since', () => {
    setWidth('a', 6);
    // Someone else's edit arrives underneath (server mode adopts it without touching undo history).
    const elsewhere = apply(store().workspace, { type: 'plan', roomId: 'a', command: { type: 'survey/update', patch: { width: 8 } } });
    if (!elsewhere.ok) throw new Error(elsewhere.error.message);
    store().adopt(elsewhere.value);
    expect(store().undo('a')?.code).toBe('stale');
    expect(width('a')).toBe(8);
    expect(store().notice).toMatch(/changed since/);
  });

  it('routes every edit through the commit hook when one is set', () => {
    const seen: string[] = [];
    setCommit((ws, command) => {
      seen.push(command.type);
      return apply(ws, command);
    });
    setWidth('a', 7);
    store().undo('a');
    expect(seen).toEqual(['plan', 'draft/replace']);
  });
```
and add to the imports at the top: `import { apply, currentRevision, findRoom } from '@glasshouse/domain';` and `import { resetWorkspaceStore, setCommit, useWorkspaceStore } from './workspaceStore';`.

`apps/web/src/sync/serverMode.test.ts`:
```ts
import { createWorkspace } from '@glasshouse/domain';
import { beforeEach, expect, it, vi } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import type { EventHandlers, Transport } from './syncClient';
import { startServerSync } from './serverMode';

beforeEach(() => resetWorkspaceStore());

const transport = (overrides: Partial<Transport> = {}): Transport => ({
  fetchWorkspace: vi.fn(async () => ({ seq: 0, workspace: createWorkspace() })),
  postCommands: vi.fn(async (_c, commands) => ({ accepted: commands.map((c, i) => ({ commandId: c.commandId, seq: i + 1 })), rejected: null, skipped: [] })),
  openEvents: vi.fn((_after: number, h: EventHandlers) => {
    h.onOpen();
    return () => {};
  }),
  ...overrides,
});

it('loads the workspace from the server and sends edits there', async () => {
  const t = transport();
  const stop = await startServerSync(t);
  const s = useWorkspaceStore.getState();
  expect(s.load.kind).toBe('ready');
  expect(s.connection).toBe('live');
  expect(s.dispatch({ type: 'project/create', id: 'p', name: 'Riverside' })).toBeNull();
  await vi.waitFor(() => expect(t.postCommands).toHaveBeenCalled());
  stop();
});

it('says the server is unreachable instead of opening an empty workspace', async () => {
  await startServerSync(transport({ fetchWorkspace: vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))) }));
  expect(useWorkspaceStore.getState().load).toMatchObject({ kind: 'failed', reason: expect.stringContaining('ECONNREFUSED') });
});

it('goes read-only when the stream stays down, and back when it returns', async () => {
  vi.useFakeTimers();
  let handlers: EventHandlers | null = null;
  const stop = await startServerSync(transport({ openEvents: vi.fn((_a: number, h: EventHandlers) => ((handlers = h), h.onOpen(), () => {})) }));
  handlers!.onError();
  expect(useWorkspaceStore.getState().readOnly).toBe(false);
  await vi.advanceTimersByTimeAsync(3100);
  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: true, connection: 'offline' });
  handlers!.onOpen();
  expect(useWorkspaceStore.getState()).toMatchObject({ readOnly: false, connection: 'live' });
  stop();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @glasshouse/web exec vitest run src/store/workspaceStore.test.ts src/sync/serverMode.test.ts`
Expected: FAIL — `setCommit`, `adopt`, `notice`, `serverMode` missing.

- [ ] **Step 3: Change the store**

In `apps/web/src/store/workspaceStore.ts`:

1. Imports: replace `replaceDraftContent` with `type Result` in the domain import list.
2. `RoomHistory` gains `head: PlanContent | null` — the draft content right after this user's own last edit, undo or redo. Undo compares against **head**, not against what is on screen now: on screen already includes other people's edits, so comparing with it would always pass and undo would overwrite their work. `emptyHistory()` returns `{ past: [], future: [], head: null }`.
3. Below `READ_ONLY_ERROR`, add:
```ts
type Commit = (ws: Workspace, command: WorkspaceCommand) => Result<Workspace>;
let commit: Commit = apply;
/** Server mode sends every edit through the sync client; local mode applies it here. */
export function setCommit(next: Commit): void {
  commit = next;
}
```
4. `Data` gains `connection: 'local' | ConnectionStatus;` and `notice: string | null;` (import `type ConnectionStatus` from `'../sync/syncClient'`); `initialData()` sets `connection: 'local', notice: null`.
5. `WorkspaceState` gains `adopt: (workspace: Workspace) => void; setConnection: (c: Data['connection']) => void; setNotice: (n: string | null) => void;` and `undo`/`redo` return `DomainError | null`.
6. In `dispatch`, replace `const result = apply(state.workspace, command);` with `const result = commit(state.workspace, command);`, and in the plan branch record the new head:
```ts
      history: { ...state.history, [roomId]: { past, future: [], head: draftContent(result.value, roomId) } },
```
7. Replace `undo` and `redo` with:
```ts
  undo: (roomId) => {
    const state = get();
    const h = state.history[roomId];
    const previous = h?.past[h.past.length - 1];
    const current = draftContent(state.workspace, roomId);
    if (!h || !previous || !current || state.readOnly) return null;
    const result = commit(state.workspace, { type: 'draft/replace', roomId, content: previous, expected: h.head ?? current });
    if (!result.ok) {
      set({ notice: result.error.message });
      return result.error;
    }
    set({
      workspace: result.value,
      history: { ...state.history, [roomId]: { past: h.past.slice(0, -1), future: [current, ...h.future], head: previous } },
      lastEdit: null,
    });
    return null;
  },
  redo: (roomId) => {
    const state = get();
    const h = state.history[roomId];
    const next = h?.future[0];
    const current = draftContent(state.workspace, roomId);
    if (!h || !next || !current || state.readOnly) return null;
    const result = commit(state.workspace, { type: 'draft/replace', roomId, content: next, expected: h.head ?? current });
    if (!result.ok) {
      set({ notice: result.error.message });
      return result.error;
    }
    set({
      workspace: result.value,
      history: { ...state.history, [roomId]: { past: [...h.past, current], future: h.future.slice(1), head: next } },
      lastEdit: null,
    });
    return null;
  },
  adopt: (workspace) => set({ workspace }),
  setConnection: (connection) => set({ connection }),
  setNotice: (notice) => set({ notice }),
```
8. Replace `resetWorkspaceStore` with:
```ts
export const resetWorkspaceStore = (): void => {
  setCommit(apply);
  useWorkspaceStore.setState(initialData());
};
```

Run: `pnpm --filter @glasshouse/web exec vitest run src/store` — the existing undo/redo tests and the two new ones pass (serverMode test still fails).

- [ ] **Step 4: Implement server-mode bootstrap**

`apps/web/src/sync/serverMode.ts`:
```ts
import { parseWorkspace } from '@glasshouse/domain';
import { useWorkspaceStore, setCommit } from '../store/workspaceStore';
import { httpTransport } from './httpTransport';
import { SyncClient, type Transport } from './syncClient';

/** Built with VITE_GLASSHOUSE_SERVER=1: the workspace lives on the Glasshouse server, not in this browser. */
export const SERVER_MODE = import.meta.env.VITE_GLASSHOUSE_SERVER === '1';

/** A blip shorter than this doesn't flash the read-only banner. */
export const OFFLINE_GRACE_MS = 3000;

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function startServerSync(transport: Transport = httpTransport()): Promise<() => void> {
  const store = useWorkspaceStore.getState();
  let snapshot: { seq: number; workspace: unknown };
  try {
    snapshot = await transport.fetchWorkspace();
  } catch (e) {
    store.setLoad({ kind: 'failed', reason: describe(e), raw: null });
    return () => {};
  }
  const parsed = parseWorkspace(snapshot.workspace);
  if (!parsed.ok) {
    store.setLoad({ kind: 'failed', reason: parsed.error.message, raw: snapshot.workspace });
    return () => {};
  }
  let offlineTimer: ReturnType<typeof setTimeout> | null = null;
  const client = new SyncClient(transport, { seq: snapshot.seq, workspace: parsed.value }, {
    onWorkspace: (ws) => useWorkspaceStore.getState().adopt(ws),
    onSave: (save) => useWorkspaceStore.getState().setSave(save),
    onDropped: (dropped) => useWorkspaceStore.getState().setNotice(dropped.map((d) => d.error.message).join(' ')),
    onConnection: (status) => {
      const s = useWorkspaceStore.getState();
      if (status === 'live') {
        if (offlineTimer !== null) clearTimeout(offlineTimer);
        offlineTimer = null;
        s.setConnection('live');
        s.setReadOnly(false);
        return;
      }
      if (status === 'connecting') {
        s.setConnection('connecting');
        return;
      }
      offlineTimer ??= setTimeout(() => {
        offlineTimer = null;
        useWorkspaceStore.getState().setConnection('offline');
        useWorkspaceStore.getState().setReadOnly(true);
      }, OFFLINE_GRACE_MS);
    },
  });
  setCommit((_ws, command) => client.dispatch(command));
  store.replace(parsed.value);
  store.setLoad({ kind: 'ready' });
  client.start();
  return () => {
    if (offlineTimer !== null) clearTimeout(offlineTimer);
    client.stop();
  };
}
```

`apps/web/src/vite-env.d.ts` (create if it doesn't exist; otherwise add the interface):
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GLASSHOUSE_SERVER?: string;
}
```

Run: `pnpm --filter @glasshouse/web exec vitest run src/sync src/store` → PASS.

- [ ] **Step 5: Wire the UI**

`apps/web/src/app/App.tsx` — replace the effect body:
```tsx
  useEffect(() => {
    if (SERVER_MODE) {
      // StrictMode runs this twice: a cancelled start stops itself as soon as it finishes.
      let stop: (() => void) | null = null;
      let cancelled = false;
      void startServerSync().then((s) => (cancelled ? s() : (stop = s)));
      return () => {
        cancelled = true;
        stop?.();
      };
    }
    // The lock decides first, so a read-only tab never seeds or saves on first run.
    void acquireWriterLock()
      .then((isWriter) => useWorkspaceStore.getState().setReadOnly(!isWriter))
      .then(() => hydrate(repository));
    return startPersistence(repository);
  }, [repository]);
```
and the failure branch:
```tsx
  if (load.kind === 'failed') {
    if (SERVER_MODE) {
      const m = messagesFor(useLangStore.getState().lang);
      return (
        <main className="app-loading" role="alert">
          <p>{m.shell.serverUnreachable(load.reason)}</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {m.shell.tryAgain}
          </button>
        </main>
      );
    }
    return <RecoveryScreen reason={load.reason} raw={load.raw} repository={repository} />;
  }
```
with `import { SERVER_MODE, startServerSync } from '../sync/serverMode';`.

`apps/web/src/app/SyncNotice.tsx`:
```tsx
import { useT } from '../i18n';
import { useWorkspaceStore } from '../store/workspaceStore';

/** Why an edit didn't stick (refused by the server, or overtaken by someone else's change). */
export function SyncNotice() {
  const notice = useWorkspaceStore((s) => s.notice);
  const setNotice = useWorkspaceStore((s) => s.setNotice);
  const m = useT();
  if (notice === null) return null;
  return (
    <p className="read-only-banner sync-notice" role="alert">
      <span>{m.shell.notApplied(notice)}</span>
      <button type="button" className="btn btn--sm btn--quiet" onClick={() => setNotice(null)}>
        {m.common.close}
      </button>
    </p>
  );
}
```

`apps/web/src/app/Shell.tsx` — read `connection` from the store and replace the banner block:
```tsx
      {connection === 'offline' ? (
        <p className="read-only-banner" role="alert">
          {m.shell.offline}
        </p>
      ) : readOnly ? (
        <p className="read-only-banner" role="alert">
          {m.shell.otherTab}
        </p>
      ) : null}
      <SyncNotice />
```
(`const connection = useWorkspaceStore((s) => s.connection);`, `import { SyncNotice } from './SyncNotice';`.)

`apps/web/src/app/TitleBlock.tsx` `SaveStatus` — use server wording in server mode:
```tsx
    case 'idle':
      return <span className="save-status">{SERVER_MODE ? m.shell.serverIdle : m.shell.saveIdle}</span>;
    ...
    case 'saved':
      return <span className="save-status">{SERVER_MODE ? m.shell.savedServer(time(save.at)) : m.shell.saved(time(save.at))}</span>;
```
(`import { SERVER_MODE } from '../sync/serverMode';`.)

`apps/web/src/features/tree/ProjectTree.tsx:189` — `{SERVER_MODE ? null : <BackupPanel />}` (backups are the server's job; Plan C adds an admin download).

`apps/web/src/app/shell.css` — add:
```css
.sync-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
```

i18n — `en.ts` `shell` block, add:
```ts
    serverIdle: 'Connected to the Glasshouse server',
    savedServer: (time: string) => `Saved to the server · ${time}`,
    offline: 'Lost the connection to the Glasshouse server. Reconnecting… Edits you already made are kept and will be sent.',
    notApplied: (reason: string) => `A change didn't go through: ${reason}`,
    serverUnreachable: (reason: string) => `Glasshouse couldn't reach its server. ${reason}`,
    tryAgain: 'Try again',
```
`th.ts` `shell` block, add:
```ts
    serverIdle: 'เชื่อมต่อเซิร์ฟเวอร์ Glasshouse แล้ว',
    savedServer: (time) => `บันทึกไปยังเซิร์ฟเวอร์แล้ว · ${time}`,
    offline: 'ขาดการเชื่อมต่อกับเซิร์ฟเวอร์ Glasshouse กำลังเชื่อมต่อใหม่… การแก้ไขที่ทำไว้จะถูกเก็บและส่งให้ภายหลัง',
    notApplied: (reason) => `การแก้ไขหนึ่งรายการไม่สำเร็จ: ${reason}`,
    serverUnreachable: (reason) => `Glasshouse เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ${reason}`,
    tryAgain: 'ลองอีกครั้ง',
```

`apps/web/vite.config.ts` — proxy the API in dev (local mode never calls it):
```ts
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  test: { /* unchanged */ },
});
```

- [ ] **Step 6: Run the whole web suite and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS (all existing local-mode tests unchanged).

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): server mode with live sync, offline banner and refused-edit notice"
```

---

### Task 8: Two-browser end-to-end test and dev workflow

**Files:**
- Create: `apps/web/playwright.server.config.ts`, `apps/web/e2e-server/collab.spec.ts`
- Modify: `apps/web/package.json` (script), `apps/web/tsconfig.json` (include), root `package.json` (script)

**Interfaces:**
- Consumes: everything above; server env from Task 5.

- [ ] **Step 1: Write the e2e config and the failing test**

`apps/web/playwright.server.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const PORT = 5299;
const WEB_DIR = fileURLToPath(new URL('./dist-server', import.meta.url));

// The real server (in-memory store) serving a server-mode build: one origin, like production.
export default defineConfig({
  testDir: './e2e-server',
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm vite build --outDir dist-server && pnpm --filter @glasshouse/server exec tsx src/main.ts',
    env: { VITE_GLASSHOUSE_SERVER: '1', GLASSHOUSE_AUTH: 'dev-insecure', GLASSHOUSE_STORE: 'memory', GLASSHOUSE_WEB_DIR: WEB_DIR, PORT: String(PORT), HOST: '127.0.0.1' },
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
```

`apps/web/e2e-server/collab.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill(name);
  await page.keyboard.press('Enter');
}

test('two people edit the same workspace and see each other live; a reload keeps everything', async ({ browser }) => {
  const ploy = await (await browser.newContext()).newPage();
  const nok = await (await browser.newContext()).newPage();
  await ploy.goto('/');
  await nok.goto('/');
  await expect(ploy.getByText('Connected to the Glasshouse server')).toBeVisible();

  await createProject(ploy, 'Riverside');
  const nokTree = nok.getByRole('complementary', { name: 'Projects' });
  await expect(nokTree.getByText('Riverside')).toBeVisible();

  await createProject(nok, 'Northgate');
  await expect(ploy.getByRole('complementary', { name: 'Projects' }).getByText('Northgate')).toBeVisible();
  await expect(ploy.getByText(/Saved to the server/)).toBeVisible();

  await ploy.reload();
  const tree = ploy.getByRole('complementary', { name: 'Projects' });
  await expect(tree.getByText('Riverside')).toBeVisible();
  await expect(tree.getByText('Northgate')).toBeVisible();
});

test('a deletion made elsewhere disappears here without a reload', async ({ page, request }) => {
  await page.goto('/');
  await createProject(page, 'Bangna');
  // Someone else deletes the project directly through the API while this tab still shows it.
  const ws = await (await request.get('/api/workspace')).json();
  const bangna = ws.workspace.projects.find((p: { name: string }) => p.name === 'Bangna');
  await request.post('/api/commands', { data: { clientId: 'other', commands: [{ commandId: 'del', command: { type: 'project/delete', projectId: bangna.id } }] } });
  await expect(page.getByRole('complementary', { name: 'Projects' }).getByText('Bangna')).toHaveCount(0);
});
```

`apps/web/package.json` scripts — add `"e2e:server": "playwright test -c playwright.server.config.ts"`.
`apps/web/tsconfig.json` `include` — add `"e2e-server"` and `"playwright.server.config.ts"`.
Root `package.json` scripts — add `"e2e:server": "pnpm --filter @glasshouse/web e2e:server"`.

- [ ] **Step 2: Run it**

Run: `pnpm e2e:server`
Expected: both tests PASS. If the first fails on `Connected to the Glasshouse server`, check `VITE_GLASSHOUSE_SERVER` reached the build (`grep -r GLASSHOUSE_SERVER apps/web/dist-server/assets` should find nothing — the flag is inlined as a literal).

- [ ] **Step 3: Verify by hand with real input**

```bash
docker compose -f docker-compose.dev.yml up -d
GLASSHOUSE_AUTH=dev-insecure DATABASE_URL=postgres://glasshouse:glasshouse@127.0.0.1:5432/glasshouse pnpm dev:server &
VITE_GLASSHOUSE_SERVER=1 pnpm dev
```
Open two browser windows on the dev URL. In window A create a room and drag a rack on the plan; window B shows it within a second. Press ⌘Z in B on A's room after A edits again → the "changed since" notice appears. Stop the server for 5 s → both windows show the offline banner and refuse edits; restart → banner clears, nothing lost.

- [ ] **Step 4: Full gate**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm e2e && pnpm e2e:server && pnpm test:db`
Expected: all PASS (local-mode e2e unchanged; `test:db` needs Docker running).

- [ ] **Step 5: Commit**

```bash
git add apps/web package.json
git commit -m "test(e2e): two browsers collaborating through the shared server"
```

---

## After Plan A

Write Plan B (identity and roles) against the shipped interfaces: `Authenticate` (replace `devAuthenticate`), `Actor`, the `onRequest` hook in `app.ts`, and server-side stamping of `by` / `designedBy` / `reviewer` / `at` in `WorkspaceService.submitNow` before `apply`.
