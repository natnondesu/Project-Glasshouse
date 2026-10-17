# P1-B Identity and Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everyone signs in (company Authelia SSO or an admin-created local account), every change is made by a named person with a role, and names on submissions and approvals are the signed-in users — never typed, never self-approved.

**Architecture:** The server gains an identity layer behind Plan A's existing seams: an `IdentityStore` (users, sessions; memory + Postgres), cookie sessions, local password login and OIDC login (openid-client against Authelia), and an `authenticate` that turns the session cookie into an `Actor` with a role. `WorkspaceService.submitNow` checks the actor's role against the command and stamps the actor's name, user id and server time onto review commands before `apply`, so the log, every client and every replay agree. The domain records `userId` on names and refuses an approval by the submitter. The web app shows a sign-in screen, a user menu, role-aware controls, verified names, and a Users screen for admins.

**Tech Stack:** Fastify 5 + `@fastify/cookie`, `openid-client` v6, `node:crypto` scrypt, Postgres (`pg`), zod 4, React 19 + zustand 5, vitest 5, `oauth2-mock-server` (tests and e2e), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-p1-shared-server-design.md` — sections "Identity and access (Plan B)", "Role matrix — confirmed", "Decisions". Plan A's shipped code is the baseline (`apps/server`, `apps/web/src/sync`).

## Global Constraints

- Each user has exactly **one** role; roles are cumulative: `viewer` ⊂ `editor` ⊂ `reviewer` ⊂ `admin` (rank 0–3). A permission check is one comparison.
- Access is global (no per-project membership).
- Role matrix: Viewer reads and exports; Editor edits drafts, submits, adds notes, imports project files, creates/renames/deletes sites and rooms; Reviewer also approves and records/withdraws acknowledgements; Admin also edits the Catalog, deletes projects, and manages users. A reviewer never approves their own submission.
- Sign-in: Authelia (OpenID Connect, authorization code + PKCE, confidential client) **and/or** local accounts. `GLASSHOUSE_LOCAL_LOGIN=off` disables local sign-in. At least one method must be enabled.
- Local accounts are created by an admin with a temporary password that must be changed on first sign-in; no email reset flow — an admin resets.
- Roles are managed in the app, not from Authelia groups. New SSO users get `GLASSHOUSE_DEFAULT_ROLE` (default `viewer`); the email in `GLASSHOUSE_BOOTSTRAP_ADMIN` becomes `admin` on first SSO sign-in.
- Sessions are server-side in Postgres (memory store in tests/e2e). Cookie `gh_session`: HttpOnly, SameSite=Lax, Path=/, Secure when `GLASSHOUSE_PUBLIC_URL` is https; 12 h idle, 7 d absolute.
- Mutating requests require header `X-Glasshouse: 1` and, when an `Origin` header is present, an `Origin` equal to `GLASSHOUSE_PUBLIC_URL`'s origin.
- Passwords: scrypt from `node:crypto` (N=32768, r=8, p=1, 64-byte key, 16-byte salt), min 12 / max 200 characters. **Deviation from the design doc (argon2id):** scrypt avoids a native module in the Docker image and is an OWASP-accepted KDF; record it in the design doc (Task 9).
- The server stamps `by`/`designedBy`/`reviewer`, the user id and the server time onto review commands; "(unverified)" is shown only on records without a user id (imported or local-mode records).
- `GLASSHOUSE_AUTH=dev-insecure` keeps working for local development (no sign-in, actor is an unverified admin, nothing stamped).
- Never silently lose edits: an expired session keeps unsent edits and sends them after the user signs in again.
- English and Thai strings for every new UI text (`apps/web/src/i18n/en.ts`, `th.ts`).
- Don't silently swallow errors; no secrets in code or logs (never log passwords, tokens, client secrets).
- Commit messages: conventional (`feat:`, `fix:`, `test:`…), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A session that should be dead** — after sign-out, after an admin switches the user off, or past the idle/absolute limit, the old cookie gets 401, not data. *(Task 3 tests "a signed-out or expired session is refused", Task 5 test "switching a user off ends their sessions")*
2. **Self-approval by a typed name** — a reviewer who submitted can't approve by typing someone else's name or sending a crafted `reviewer` field: the server overwrites names from the session and the domain refuses the submitter's id. *(Task 5 test "a reviewer can't approve their own submission, whatever name they send")*
3. **An IdP that sends no email or an unverified one** — the user is still provisioned by subject, and is never linked to an existing local account through an unverified email. *(Task 4 test "links an existing local account by verified email, never through an unverified email")*
4. **A session that expires mid-edit** — unsent edits are kept and sent after signing in again, applied once. *(Task 6 test "keeps unsent edits across a sign-in")*
5. **The last admin locking everyone out** — demoting or switching off the only active admin, or yourself, is refused. *(Task 5 test "never leaves the workspace without an admin")*

---

## File Structure

```
packages/domain/src/
  model/types.ts               MOD  UnverifiedName.userId?, ReviewNote.byId?
  schema.ts                    MOD  same optional fields
  result.ts                    MOD  + 'forbidden'
  commands/review.ts           MOD  byId on review commands; submitter can't approve; no "(unverified)" when verified
  readiness.ts                 MOD  isSelfApproved compares user ids when present
  commands/review.test.ts      MOD
apps/server/src/
  identity/types.ts            NEW  Role, ROLE_RANK, atLeast, User, Session, IdentityStore
  identity/passwords.ts (+test) NEW scrypt hash/verify, rules, temporary passwords
  identity/tokens.ts (+test)   NEW  session tokens and hashes
  identity/memoryIdentityStore.ts (+test)  NEW
  identity/pgIdentityStore.ts (+pgIdentityStore.db.test.ts)  NEW
  identity/provision.ts (+test) NEW OIDC user provisioning
  identity/seedUsers.ts (+test) NEW memory-only seed for e2e
  store/migrations.ts          MOD  + 002_identity
  store/commandStore.ts        MOD  Actor gains role, verified, mustChangePassword?
  config.ts (+test)            MOD  auth modes and OIDC settings
  http/devAuth.ts              MOD  Authenticate may be async; dev actor = unverified admin; dev /auth routes
  http/auth/sessionAuth.ts (+test)  NEW cookie sessions → Actor
  http/auth/loginThrottle.ts (+test) NEW
  http/auth/oidc.ts            NEW  openid-client wrapper
  http/auth/authRoutes.ts      NEW  /auth/config, /auth/me, /auth/login, /auth/password, /auth/logout, /auth/oidc/*
  http/auth/csrf.ts            NEW  X-Glasshouse + Origin check
  http/auth/authRoutes.test.ts NEW  local login flows
  http/auth/oidc.test.ts       NEW  SSO flows against oauth2-mock-server
  http/admin.ts (+test)        NEW  /api/admin/users
  http/app.ts                  MOD  async authenticate, cookie plugin, csrf, auth + admin routes
  permissions.ts (+test)       NEW  requiredRole, stampCommand
  workspaceService.ts (+test)  MOD  role check + stamping
  cli.ts (+test)               NEW  create-admin, reset-password
  main.ts                      MOD  wiring per auth mode
  scripts/mock-idp.mjs         NEW  OIDC test IdP for e2e
apps/server/build.mjs          MOD  bundle main + cli
apps/web/src/
  auth/authApi.ts              NEW  fetch wrappers + AuthError
  auth/authStore.ts (+test)    NEW  status, user, config
  auth/SignInScreen.tsx (+test) NEW
  auth/ChangePasswordScreen.tsx (+test) NEW
  auth/UserMenu.tsx            NEW
  auth/useCan.ts               NEW  role checks for the UI
  auth/auth.css                NEW
  sync/httpTransport.ts        MOD  AuthError on 401 / password_change_required
  sync/syncClient.ts (+test)   MOD  onAuthLost; pending list
  sync/syncEngine.ts           MOD  pendingList()
  sync/pendingStash.ts (+test) NEW  unsent edits across sign-in
  sync/serverMode.ts (+test)   MOD  stash restore, viewer read-only
  store/workspaceStore.ts      MOD  readOnlyReason
  app/App.tsx                  MOD  auth gate before sync
  app/Shell.tsx                MOD  banner by reason
  app/TitleBlock.tsx           MOD  UserMenu in the tools corner
  ui/person.ts                 NEW  verified/unverified name label
  features/review/*.tsx        MOD  no name inputs in server mode, role gating, verified names
  features/sheet/*.tsx         MOD  verified names
  features/catalog/CatalogScreen.tsx MOD admin-only editing
  features/admin/UsersScreen.tsx (+test, users.css) NEW
  features/admin/adminApi.ts   NEW
  app/routes.tsx               MOD  /admin/users
  i18n/en.ts, th.ts            MOD
apps/web/playwright.auth.config.ts, apps/web/e2e-auth/auth.spec.ts  NEW
docs/superpowers/specs/2026-10-17-p1-shared-server-design.md        MOD  Authelia client setup, env, scrypt note
DESIGN.md                                                           MOD
```

---

### Task 1: Domain — verified names and no self-approval

**Files:**
- Modify: `packages/domain/src/model/types.ts` (`UnverifiedName` ~227, `ReviewNote`), `packages/domain/src/schema.ts` (`unverifiedName` ~102, notes ~120), `packages/domain/src/result.ts:3`, `packages/domain/src/commands/review.ts`, `packages/domain/src/readiness.ts:33`
- Test: `packages/domain/src/commands/review.test.ts`

**Interfaces:**
- Produces: `UnverifiedName = { name: string; at: string; userId?: string }`; `ReviewNote.byId?: string`; `DomainErrorCode` gains `'forbidden'`; `ReviewCommand` members `review/submit`, `review/approve`, `review/acknowledge`, `note/add` gain optional `byId?: Id`; history `params.verified = 1` when the actor was verified.

- [ ] **Step 1: Write the failing tests** — append to `packages/domain/src/commands/review.test.ts` (it already has `AT`, `run`, `ready`):

```ts
describe('verified people (server mode)', () => {
  // `review`, `plan`, `run`, `ready` and `AT` are the file's existing helpers.
  const revOf = (ws: Workspace) => currentRevision(plan(ws));

  it('records who submitted and approved with their user ids, and drops "(unverified)"', () => {
    let ws = run(ready(), review({ type: 'review/submit', designedBy: 'Ploy S.', at: AT, byId: 'u-ploy' }));
    ws = run(ws, review({ type: 'review/approve', reviewer: 'Nok P.', at: AT, byId: 'u-nok' }));
    expect(revOf(ws).designedBy).toEqual({ name: 'Ploy S.', at: AT, userId: 'u-ploy' });
    expect(revOf(ws).approvedBy).toEqual({ name: 'Nok P.', at: AT, userId: 'u-nok' });
    const history = findRoom(ws, 'r')!.room.plan.history.slice(-2);
    expect(history.map((h) => h.action)).toEqual(['Submitted for review by Ploy S.', 'Approved by Nok P.']);
    expect(history[1]!.params).toMatchObject({ by: 'Nok P.', verified: 1 });
  });

  it('refuses an approval by the person who submitted', () => {
    const ws = run(ready(), review({ type: 'review/submit', designedBy: 'Ploy S.', at: AT, byId: 'u-ploy' }));
    const r = apply(ws, review({ type: 'review/approve', reviewer: 'Ploy S.', at: AT, byId: 'u-ploy' }));
    expect(r).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });

  it('keeps local mode as it was: typed names are flagged, not refused', () => {
    let ws = run(ready(), review({ type: 'review/submit', designedBy: 'Ploy', at: AT }));
    ws = run(ws, review({ type: 'review/approve', reviewer: 'ploy', at: AT }));
    expect(isSelfApproved(revOf(ws))).toBe(true);
    expect(findRoom(ws, 'r')!.room.plan.history.at(-1)!.action).toBe('Approved by ploy (unverified)');
  });

  it('compares user ids, not names, when both are known', () => {
    let ws = run(ready(), review({ type: 'review/submit', designedBy: 'Sam', at: AT, byId: 'u-1' }));
    ws = run(ws, review({ type: 'review/approve', reviewer: 'Sam', at: AT, byId: 'u-2' }));
    expect(isSelfApproved(revOf(ws))).toBe(false);
  });

  it('records the note author id and keeps ids through save and load', () => {
    const ws = run(ready(), review({ type: 'note/add', id: 'n1', text: 'Check the column', at: AT, by: 'Nok P.', byId: 'u-nok' }));
    const plan = findRoom(ws, 'r')!.room.plan;
    expect(plan.notes.at(-1)).toMatchObject({ by: 'Nok P.', byId: 'u-nok' });
    const loaded = parseWorkspace(JSON.parse(JSON.stringify(ws)));
    expect(loaded.ok && findRoom(loaded.value, 'r')!.room.plan.notes.at(-1)).toMatchObject({ byId: 'u-nok' });
  });
});
```
Add `import { parseWorkspace } from '../schema';` to the test file's imports (the other names it uses are already imported there).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @glasshouse/domain exec vitest run src/commands/review.test.ts`
Expected: FAIL — `byId` not stored, approval by the submitter accepted, `userId` stripped on load.

- [ ] **Step 3: Implement**

`packages/domain/src/result.ts` line 3:
```ts
export type DomainErrorCode = 'not_found' | 'not_draft' | 'invalid_value' | 'out_of_bounds' | 'stale' | 'forbidden';
```

`packages/domain/src/model/types.ts`:
```ts
/** A person on a revision. Typed (unverified) in local mode; with the signed-in user's id on the shared server. */
export interface UnverifiedName {
  name: string;
  at: string;
  userId?: string;
}
```
and in `ReviewNote` add `byId?: string;` after `by?: string;`.

`packages/domain/src/schema.ts`:
```ts
const unverifiedName = z.object({ name: text, at: text, userId: text.optional() });
```
and in the plan `notes` object add `byId: text.optional()` after `by: text.optional()`.

`packages/domain/src/commands/review.ts`:
- Union members:
```ts
  | { type: 'review/submit'; designedBy: string; at: string; byId?: Id }
  | { type: 'review/approve'; reviewer: string; at: string; byId?: Id }
  …
  | { type: 'review/acknowledge'; reservedRangeId: Id; reason: string; by: string; at: string; byId?: Id }
  …
  | { type: 'note/add'; id: Id; text: string; at: string; revision?: number; by?: string; byId?: Id };
```
- Helpers below `NAME_MAX_NOTE` (import `UnverifiedName` type from `../model/types`):
```ts
/** On the shared server the person is a signed-in user: their id is kept and "(unverified)" goes. */
const person = (name: string, at: string, byId?: Id): UnverifiedName => (byId ? { name, at, userId: byId } : { name, at });
const tail = (byId?: Id): string => (byId ? '' : ' (unverified)');
const verified = (byId?: Id): { verified?: number } => (byId ? { verified: 1 } : {});
```
- `review/submit`: `r.designedBy = name.value ? person(name.value, cmd.at, cmd.byId) : null;` and the history entry `action: name.value ? \`Submitted for review by ${name.value}${tail(cmd.byId)}\` : 'Submitted for review'`, `params: name.value ? { by: name.value, ...verified(cmd.byId) } : {}`.
- `review/approve`: directly after the two state checks add
```ts
      if (cmd.byId && rev.designedBy?.userId === cmd.byId) {
        return err('forbidden', `You submitted revision ${rev.number}, so another reviewer has to approve it.`);
      }
```
  and use `r.approvedBy = person(reviewer.value, cmd.at, cmd.byId);`, `action: \`Approved by ${reviewer.value}${tail(cmd.byId)}\``, `params: { by: reviewer.value, ...verified(cmd.byId) }`.
- `review/acknowledge`: `by: person(by.value, cmd.at, cmd.byId)` in the acknowledgement, `action: \`${by.value}${tail(cmd.byId)} acknowledged unknown demand for ${found.range.label}\``, `params: { by: by.value, range: found.range.label, ...verified(cmd.byId) }`.
- `note/add`: push `{ id: cmd.id, text: text.value, revision: on, createdAt: cmd.at, ...(by ? { by } : {}), ...(by && cmd.byId ? { byId: cmd.byId } : {}) }`; `action: by ? \`${by}${tail(cmd.byId)} added a note\` : 'Added a note'`; params `{ by, ...verified(cmd.byId) }` when `by`.

`packages/domain/src/readiness.ts`:
```ts
export const isSelfApproved = (revision: Revision): boolean => {
  const d = revision.designedBy;
  const a = revision.approvedBy;
  if (d === null || a === null) return false;
  if (d.userId && a.userId) return d.userId === a.userId;
  return d.name.trim().toLowerCase() === a.name.trim().toLowerCase();
};
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck && pnpm --filter @glasshouse/web typecheck`
Expected: PASS (the web typecheck catches any exhaustive switch over error codes).

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): verified people on revisions; a submitter can't approve"
```

---

### Task 2: Identity store, passwords and session tokens

**Files:**
- Create: `apps/server/src/identity/types.ts`, `passwords.ts`, `passwords.test.ts`, `tokens.ts`, `tokens.test.ts`, `memoryIdentityStore.ts`, `memoryIdentityStore.test.ts`, `pgIdentityStore.ts`, `pgIdentityStore.db.test.ts`
- Modify: `apps/server/src/store/migrations.ts` (append `002_identity`)

**Interfaces:**
- Produces:
  - `ROLES`, `type Role = 'viewer' | 'editor' | 'reviewer' | 'admin'`, `ROLE_RANK`, `atLeast(role: Role, needed: Role): boolean`, `isRole(value: unknown): value is Role`
  - `interface User { id: string; email: string; displayName: string; role: Role; source: 'oidc' | 'local'; oidcSubject: string | null; passwordHash: string | null; mustChangePassword: boolean; active: boolean; createdAt: string; lastLoginAt: string | null }`
  - `type UserPatch = Partial<Pick<User, 'email' | 'displayName' | 'role' | 'active' | 'passwordHash' | 'mustChangePassword' | 'lastLoginAt' | 'oidcSubject'>>`
  - `interface Session { tokenHash: string; userId: string; createdAt: string; lastSeenAt: string; expiresAt: string }`
  - `interface IdentityStore { findUserById(id: string): Promise<User | null>; findUserByEmail(email: string): Promise<User | null>; findUserBySubject(subject: string): Promise<User | null>; listUsers(): Promise<User[]>; createUser(user: User): Promise<void>; updateUser(id: string, patch: UserPatch): Promise<User | null>; countActiveAdmins(): Promise<number>; createSession(session: Session): Promise<void>; findSession(tokenHash: string): Promise<Session | null>; touchSession(tokenHash: string, lastSeenAt: string): Promise<void>; deleteSession(tokenHash: string): Promise<void>; deleteUserSessions(userId: string): Promise<void>; deleteExpiredSessions(nowIso: string): Promise<number>; close(): Promise<void> }` — `createUser` throws `DuplicateUserError` on a repeated email (case-insensitive) or OIDC subject.
  - `class DuplicateUserError extends Error`
  - `hashPassword(pw): Promise<string>`, `verifyPassword(pw, stored): Promise<boolean>`, `passwordProblem(pw): string | null`, `temporaryPassword(): string`, `PASSWORD_MIN = 12`, `PASSWORD_MAX = 200`
  - `newSessionToken(): string`, `hashToken(token): string`
  - `class MemoryIdentityStore implements IdentityStore`; `class PgIdentityStore implements IdentityStore` with `static connect(url: string): Promise<PgIdentityStore>`

- [ ] **Step 1: Write the failing tests**

`apps/server/src/identity/passwords.test.ts`:
```ts
import { expect, it } from 'vitest';
import { hashPassword, passwordProblem, temporaryPassword, verifyPassword } from './passwords';

it('hashes with a fresh salt and verifies only the right password', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  expect(a).not.toBe(b);
  expect(a.startsWith('scrypt$32768$8$1$')).toBe(true);
  expect(await verifyPassword('correct horse battery', a)).toBe(true);
  expect(await verifyPassword('correct horse batterz', a)).toBe(false);
  expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
});

it('explains passwords that are too short or too long', () => {
  expect(passwordProblem('short')).toMatch(/at least 12/);
  expect(passwordProblem('x'.repeat(201))).toMatch(/at most 200/);
  expect(passwordProblem('long enough password')).toBeNull();
});

it('makes temporary passwords that pass the rules and differ', () => {
  const a = temporaryPassword();
  expect(passwordProblem(a)).toBeNull();
  expect(temporaryPassword()).not.toBe(a);
});
```

`apps/server/src/identity/tokens.test.ts`:
```ts
import { expect, it } from 'vitest';
import { hashToken, newSessionToken } from './tokens';

it('makes long random tokens and stores only their hash', () => {
  const t = newSessionToken();
  expect(t.length).toBeGreaterThanOrEqual(43);
  expect(newSessionToken()).not.toBe(t);
  expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  expect(hashToken(t)).toBe(hashToken(t));
});
```

`apps/server/src/identity/memoryIdentityStore.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MemoryIdentityStore } from './memoryIdentityStore';
import { DuplicateUserError, type User } from './types';

export const userFixture = (over: Partial<User> = {}): User => ({
  id: 'u1', email: 'ploy@company.test', displayName: 'Ploy S.', role: 'editor', source: 'local', oidcSubject: null,
  passwordHash: null, mustChangePassword: false, active: true, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: null, ...over,
});

describe('MemoryIdentityStore', () => {
  it('finds users by id, email (any case) and subject, and refuses duplicates', async () => {
    const s = new MemoryIdentityStore();
    await s.createUser(userFixture({ oidcSubject: 'sub-1' }));
    expect((await s.findUserByEmail('PLOY@company.test'))?.id).toBe('u1');
    expect((await s.findUserBySubject('sub-1'))?.id).toBe('u1');
    await expect(s.createUser(userFixture({ id: 'u2', email: 'Ploy@Company.test' }))).rejects.toBeInstanceOf(DuplicateUserError);
    await expect(s.createUser(userFixture({ id: 'u3', email: 'x@company.test', oidcSubject: 'sub-1' }))).rejects.toBeInstanceOf(DuplicateUserError);
  });

  it('updates users and counts active admins', async () => {
    const s = new MemoryIdentityStore();
    await s.createUser(userFixture({ role: 'admin' }));
    await s.createUser(userFixture({ id: 'u2', email: 'nok@company.test', role: 'admin', active: false }));
    expect(await s.countActiveAdmins()).toBe(1);
    expect((await s.updateUser('u1', { role: 'reviewer' }))?.role).toBe('reviewer');
    expect(await s.countActiveAdmins()).toBe(0);
    expect(await s.updateUser('missing', { role: 'admin' })).toBeNull();
  });

  it('keeps sessions, touches, deletes per user, and sweeps expired ones', async () => {
    const s = new MemoryIdentityStore();
    const base = { userId: 'u1', createdAt: '2026-10-18T00:00:00.000Z', lastSeenAt: '2026-10-18T00:00:00.000Z' };
    await s.createSession({ ...base, tokenHash: 'a', expiresAt: '2026-10-25T00:00:00.000Z' });
    await s.createSession({ ...base, tokenHash: 'b', expiresAt: '2026-10-18T01:00:00.000Z' });
    await s.touchSession('a', '2026-10-18T02:00:00.000Z');
    expect((await s.findSession('a'))?.lastSeenAt).toBe('2026-10-18T02:00:00.000Z');
    expect(await s.deleteExpiredSessions('2026-10-18T03:00:00.000Z')).toBe(1);
    await s.deleteUserSessions('u1');
    expect(await s.findSession('a')).toBeNull();
  });
});
```

`apps/server/src/identity/pgIdentityStore.db.test.ts` (same assertions against Postgres):
```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PgIdentityStore } from './pgIdentityStore';
import { DuplicateUserError, type User } from './types';

let container: StartedPostgreSqlContainer;
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
});
afterAll(async () => {
  await container?.stop();
});

const user = (over: Partial<User> = {}): User => ({
  id: 'u1', email: 'ploy@company.test', displayName: 'Ploy S.', role: 'admin', source: 'oidc', oidcSubject: 'sub-1',
  passwordHash: null, mustChangePassword: false, active: true, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: null, ...over,
});

it('stores users and sessions in Postgres with the same rules as memory', async () => {
  const s = await PgIdentityStore.connect(container.getConnectionUri());
  await s.createUser(user());
  expect((await s.findUserByEmail('PLOY@COMPANY.TEST'))?.oidcSubject).toBe('sub-1');
  await expect(s.createUser(user({ id: 'u2', email: 'Ploy@company.test', oidcSubject: null }))).rejects.toBeInstanceOf(DuplicateUserError);
  expect(await s.countActiveAdmins()).toBe(1);
  expect((await s.updateUser('u1', { role: 'viewer', lastLoginAt: '2026-10-18T05:00:00.000Z' }))).toMatchObject({ role: 'viewer', lastLoginAt: '2026-10-18T05:00:00.000Z' });
  await s.createSession({ tokenHash: 'h', userId: 'u1', createdAt: '2026-10-18T00:00:00.000Z', lastSeenAt: '2026-10-18T00:00:00.000Z', expiresAt: '2026-10-19T00:00:00.000Z' });
  expect((await s.findSession('h'))?.userId).toBe('u1');
  expect(await s.deleteExpiredSessions('2026-10-20T00:00:00.000Z')).toBe(1);
  expect((await s.listUsers()).map((u) => u.id)).toEqual(['u1']);
  await s.close();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @glasshouse/server exec vitest run src/identity` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`apps/server/src/identity/types.ts`:
```ts
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
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export type UserPatch = Partial<Pick<User, 'email' | 'displayName' | 'role' | 'active' | 'passwordHash' | 'mustChangePassword' | 'lastLoginAt' | 'oidcSubject'>>;

/** Only a hash of the cookie token is stored, so a database leak doesn't hand out live sessions. */
export interface Session {
  tokenHash: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export class DuplicateUserError extends Error {}

export interface IdentityStore {
  findUserById(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserBySubject(subject: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  createUser(user: User): Promise<void>;
  updateUser(id: string, patch: UserPatch): Promise<User | null>;
  countActiveAdmins(): Promise<number>;
  createSession(session: Session): Promise<void>;
  findSession(tokenHash: string): Promise<Session | null>;
  touchSession(tokenHash: string, lastSeenAt: string): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  deleteExpiredSessions(nowIso: string): Promise<number>;
  close(): Promise<void>;
}
```

`apps/server/src/identity/passwords.ts`:
```ts
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;
const N = 32768;
const R = 8;
const P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
/** scrypt needs ~128·N·r bytes; Node's 32 MB default is exactly that, so give it headroom. */
const maxmemFor = (n: number, r: number): number => 2 * 128 * n * r;

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => scryptCallback(password, salt, keylen, options, (e, key) => (e ? reject(e) : resolve(key))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: maxmemFor(N, R) });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltText, keyText] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(keyText, 'base64url');
  const nn = Number(n);
  const rr = Number(r);
  const key = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, { N: nn, r: rr, p: Number(p), maxmem: maxmemFor(nn, rr) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

/** 16 URL-safe characters; shown once to the admin, changed by the user at first sign-in. */
export const temporaryPassword = (): string => randomBytes(12).toString('base64url');
```

`apps/server/src/identity/tokens.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';

export const newSessionToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
```

`apps/server/src/identity/memoryIdentityStore.ts`:
```ts
import { DuplicateUserError, type IdentityStore, type Session, type User, type UserPatch } from './types';

const sameEmail = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Tests and the e2e server: the same rules as Postgres, gone on restart. */
export class MemoryIdentityStore implements IdentityStore {
  private users: User[] = [];
  private sessions = new Map<string, Session>();

  async findUserById(id: string) {
    return structuredClone(this.users.find((u) => u.id === id) ?? null);
  }
  async findUserByEmail(email: string) {
    return structuredClone(this.users.find((u) => sameEmail(u.email, email)) ?? null);
  }
  async findUserBySubject(subject: string) {
    return structuredClone(this.users.find((u) => u.oidcSubject === subject) ?? null);
  }
  async listUsers() {
    return structuredClone([...this.users].sort((a, b) => a.displayName.localeCompare(b.displayName)));
  }
  async createUser(user: User) {
    if (this.users.some((u) => u.id === user.id || sameEmail(u.email, user.email) || (user.oidcSubject !== null && u.oidcSubject === user.oidcSubject))) {
      throw new DuplicateUserError(`A user with this email or sign-in already exists: ${user.email}`);
    }
    this.users = [...this.users, structuredClone(user)];
  }
  async updateUser(id: string, patch: UserPatch) {
    const current = this.users.find((u) => u.id === id);
    if (!current) return null;
    if (patch.email && this.users.some((u) => u.id !== id && sameEmail(u.email, patch.email!))) throw new DuplicateUserError(`Email already in use: ${patch.email}`);
    if (patch.oidcSubject && this.users.some((u) => u.id !== id && u.oidcSubject === patch.oidcSubject)) throw new DuplicateUserError('That sign-in is already linked to another user.');
    const next = { ...current, ...patch };
    this.users = this.users.map((u) => (u.id === id ? next : u));
    return structuredClone(next);
  }
  async countActiveAdmins() {
    return this.users.filter((u) => u.active && u.role === 'admin').length;
  }
  async createSession(session: Session) {
    this.sessions.set(session.tokenHash, structuredClone(session));
  }
  async findSession(tokenHash: string) {
    return structuredClone(this.sessions.get(tokenHash) ?? null);
  }
  async touchSession(tokenHash: string, lastSeenAt: string) {
    const s = this.sessions.get(tokenHash);
    if (s) this.sessions.set(tokenHash, { ...s, lastSeenAt });
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async deleteUserSessions(userId: string) {
    for (const [k, s] of this.sessions) if (s.userId === userId) this.sessions.delete(k);
  }
  async deleteExpiredSessions(nowIso: string) {
    let n = 0;
    for (const [k, s] of this.sessions) {
      if (s.expiresAt <= nowIso) {
        this.sessions.delete(k);
        n += 1;
      }
    }
    return n;
  }
  async close() {}
}
```

Append to `MIGRATIONS` in `apps/server/src/store/migrations.ts`:
```ts
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
```

`apps/server/src/identity/pgIdentityStore.ts`:
```ts
import pg from 'pg';
import { migrate } from '../store/migrations';
import { DuplicateUserError, type IdentityStore, type Role, type Session, type User, type UserPatch } from './types';

interface UserRow {
  id: string; email: string; display_name: string; role: Role; source: 'oidc' | 'local'; oidc_subject: string | null;
  password_hash: string | null; must_change_password: boolean; active: boolean; created_at: Date; last_login_at: Date | null;
}
interface SessionRow { token_hash: string; user_id: string; created_at: Date; last_seen_at: Date; expires_at: Date }

const toUser = (r: UserRow): User => ({
  id: r.id, email: r.email, displayName: r.display_name, role: r.role, source: r.source, oidcSubject: r.oidc_subject,
  passwordHash: r.password_hash, mustChangePassword: r.must_change_password, active: r.active,
  createdAt: r.created_at.toISOString(), lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
});
const toSession = (r: SessionRow): Session => ({
  tokenHash: r.token_hash, userId: r.user_id, createdAt: r.created_at.toISOString(), lastSeenAt: r.last_seen_at.toISOString(), expiresAt: r.expires_at.toISOString(),
});
const COLUMN: Record<keyof UserPatch, string> = {
  email: 'email', displayName: 'display_name', role: 'role', active: 'active', passwordHash: 'password_hash',
  mustChangePassword: 'must_change_password', lastLoginAt: 'last_login_at', oidcSubject: 'oidc_subject',
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
        `insert into users (id, email, display_name, role, source, oidc_subject, password_hash, must_change_password, active, created_at, last_login_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [u.id, u.email, u.displayName, u.role, u.source, u.oidcSubject, u.passwordHash, u.mustChangePassword, u.active, u.createdAt, u.lastLoginAt],
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
```
(The column names in `updateUser` come only from the fixed `COLUMN` map, never from input — no injection.)

- [ ] **Step 4: Run tests** — `pnpm --filter @glasshouse/server exec vitest run src/identity`, `pnpm --filter @glasshouse/server test:db` (Docker), `pnpm --filter @glasshouse/server typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/identity apps/server/src/store/migrations.ts
git commit -m "feat(server): identity store, scrypt passwords and session tokens"
```

---

### Task 3: Sign-in core — config, cookie sessions, local accounts, CSRF

**Files:**
- Modify: `apps/server/src/config.ts`, `apps/server/src/config.test.ts`, `apps/server/src/store/commandStore.ts` (`Actor`), `apps/server/src/http/devAuth.ts`, `apps/server/src/http/app.ts`, `apps/server/src/main.ts`, `apps/server/package.json`
- Create: `apps/server/src/http/auth/sessionAuth.ts`, `loginThrottle.ts`, `loginThrottle.test.ts`, `csrf.ts`, `oidc.ts` (types only in this task), `authRoutes.ts`, `authRoutes.test.ts`, `apps/server/src/identity/seedUsers.ts`, `seedUsers.test.ts`

**Interfaces:**
- Consumes: Task 2's `IdentityStore`, `User`, `Role`, password and token helpers.
- Produces:
  - `Actor = { id: string; name: string; role: Role; verified: boolean; mustChangePassword?: boolean }` (in `store/commandStore.ts`).
  - `type Authenticate = (request: FastifyRequest) => Actor | null | Promise<Actor | null>`.
  - `Config.auth: { mode: 'dev-insecure' } | AuthConfig` with `AuthConfig = { mode: 'on'; publicUrl: URL; localLogin: boolean; oidc: { issuer: string; clientId: string; clientSecret: string } | null; bootstrapAdmin: string | null; defaultRole: Role; secureCookies: boolean; seedUsers: SeedUser[] }` and `SeedUser = { email: string; password: string; role: Role; displayName: string }`.
  - `createSessionAuth(store: IdentityStore, options: { secure: boolean; now?: () => Date }): SessionAuth` with `SessionAuth = { authenticate: Authenticate; startSession(reply: FastifyReply, user: User): Promise<void>; endSession(request: FastifyRequest, reply: FastifyReply): Promise<void> }`; constants `SESSION_COOKIE = 'gh_session'`, `SESSION_IDLE_MS`, `SESSION_MAX_MS`.
  - `class LoginThrottle` (`blocked(key)`, `fail(key)`, `clear(key)`), `MAX_FAILURES = 5`, `WINDOW_MS = 15 min`.
  - `checkMutation(request, publicOrigin: string | null): string | null` (returns a refusal message or null).
  - `registerAuthRoutes(app, deps: AuthRouteDeps)` with `AuthRouteDeps = { store: IdentityStore; sessions: SessionAuth; config: AuthConfig; oidc: OidcLogin | null; throttle: LoginThrottle; now: () => Date }` — Task 4 adds the OIDC routes into the same file. This task creates `http/auth/oidc.ts` with only the types and helpers Task 4 builds on (copy them verbatim from Task 4's `oidc.ts`: `OidcClaims`, `OidcLogin`, `OidcError`, `safeReturnTo`); Task 4 adds `createOidcLogin` to that file.
  - `registerDevAuthRoutes(app)` (GET `/auth/config` → `{ mode: 'dev' }`).
  - `buildApp` deps: `authenticate: Authenticate; authRoutes: (app: FastifyInstance) => void | Promise<void>; publicOrigin: string | null; admin?: (api: FastifyInstance) => void` (admin wired in Task 5).
  - `seedUsers(store, users: SeedUser[], now: string): Promise<void>`; `parseSeedUsers(text: string): SeedUser[]`.
  - HTTP: `GET /auth/config` → `{ mode: 'dev' } | { mode: 'on', localLogin: boolean, sso: boolean }`; `GET /auth/me` → 401 or `{ id, name, email, role, mustChangePassword }`; `POST /auth/login {email, password}` → `200 { mustChangePassword }` + cookie, `401 { error }` (generic), `429 { error }`; `POST /auth/password {current, next}` → 204 + fresh cookie; `POST /auth/logout` → 204 + cleared cookie. API (`/api/*`): 401 `unauthorised`, 403 `password_change_required`, 403 `csrf`.

- [ ] **Step 1: Install the cookie plugin**

```bash
pnpm --filter @glasshouse/server add @fastify/cookie
```

- [ ] **Step 2: Write the failing tests**

`apps/server/src/config.test.ts` — replace the file's auth expectations with:
```ts
import { expect, it } from 'vitest';
import { loadConfig } from './config';

const on = { GLASSHOUSE_AUTH: 'on', GLASSHOUSE_STORE: 'memory', GLASSHOUSE_PUBLIC_URL: 'https://glasshouse.company.test' };

it('refuses to start without an auth mode', () => {
  expect(() => loadConfig({ GLASSHOUSE_STORE: 'memory' })).toThrow(/GLASSHOUSE_AUTH/);
});

it('keeps dev-insecure for local development', () => {
  expect(loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure', GLASSHOUSE_STORE: 'memory' }).auth).toEqual({ mode: 'dev-insecure' });
});

it('needs a database URL for the Postgres store', () => {
  expect(() => loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure' })).toThrow(/DATABASE_URL/);
});

it('reads sign-in settings with safe defaults', () => {
  const c = loadConfig(on);
  expect(c.auth).toMatchObject({ mode: 'on', localLogin: true, oidc: null, bootstrapAdmin: null, defaultRole: 'viewer', secureCookies: true, seedUsers: [] });
  expect(c.auth.mode === 'on' && c.auth.publicUrl.origin).toBe('https://glasshouse.company.test');
});

it('requires a public URL, an https one off localhost, and at least one way to sign in', () => {
  expect(() => loadConfig({ ...on, GLASSHOUSE_PUBLIC_URL: undefined })).toThrow(/GLASSHOUSE_PUBLIC_URL/);
  expect(() => loadConfig({ ...on, GLASSHOUSE_PUBLIC_URL: 'http://glasshouse.company.test' })).toThrow(/https/);
  expect(loadConfig({ ...on, GLASSHOUSE_PUBLIC_URL: 'http://localhost:5399' }).auth).toMatchObject({ secureCookies: false });
  expect(() => loadConfig({ ...on, GLASSHOUSE_LOCAL_LOGIN: 'off' })).toThrow(/at least one/);
});

it('takes OIDC settings all together or not at all', () => {
  expect(() => loadConfig({ ...on, GLASSHOUSE_OIDC_ISSUER: 'https://auth.company.test' })).toThrow(/GLASSHOUSE_OIDC_CLIENT_ID/);
  const c = loadConfig({ ...on, GLASSHOUSE_OIDC_ISSUER: 'https://auth.company.test', GLASSHOUSE_OIDC_CLIENT_ID: 'glasshouse', GLASSHOUSE_OIDC_CLIENT_SECRET: 's3cret', GLASSHOUSE_BOOTSTRAP_ADMIN: 'few@company.test' });
  expect(c.auth).toMatchObject({ oidc: { issuer: 'https://auth.company.test', clientId: 'glasshouse' }, bootstrapAdmin: 'few@company.test' });
});

it('accepts seed users only with the memory store', () => {
  const seed = 'ed@company.test:password-123456:editor:Ed Itor';
  expect(loadConfig({ ...on, GLASSHOUSE_SEED_USERS: seed }).auth).toMatchObject({ seedUsers: [{ email: 'ed@company.test', role: 'editor', displayName: 'Ed Itor' }] });
  expect(() => loadConfig({ ...on, GLASSHOUSE_STORE: 'postgres', DATABASE_URL: 'postgres://x', GLASSHOUSE_SEED_USERS: seed })).toThrow(/memory/);
});
```

`apps/server/src/http/auth/loginThrottle.test.ts`:
```ts
import { expect, it } from 'vitest';
import { LoginThrottle, MAX_FAILURES, WINDOW_MS } from './loginThrottle';

it('blocks a key after repeated failures until the window passes', () => {
  let t = 0;
  const throttle = new LoginThrottle(() => t);
  for (let i = 0; i < MAX_FAILURES; i += 1) throttle.fail('ip|ploy');
  expect(throttle.blocked('ip|ploy')).toBe(true);
  expect(throttle.blocked('ip|nok')).toBe(false);
  t = WINDOW_MS + 1;
  expect(throttle.blocked('ip|ploy')).toBe(false);
  throttle.fail('ip|ploy');
  throttle.clear('ip|ploy');
  expect(throttle.blocked('ip|ploy')).toBe(false);
});
```

`apps/server/src/identity/seedUsers.test.ts`:
```ts
import { expect, it } from 'vitest';
import { MemoryIdentityStore } from './memoryIdentityStore';
import { verifyPassword } from './passwords';
import { parseSeedUsers, seedUsers } from './seedUsers';

it('parses and creates local users with hashed passwords', async () => {
  const users = parseSeedUsers('a@x.test:password-111111:admin:Ann; r@x.test:password-222222:reviewer:Rob');
  expect(users.map((u) => u.role)).toEqual(['admin', 'reviewer']);
  const store = new MemoryIdentityStore();
  await seedUsers(store, users, '2026-10-18T00:00:00.000Z');
  const ann = await store.findUserByEmail('a@x.test');
  expect(ann).toMatchObject({ source: 'local', role: 'admin', displayName: 'Ann', mustChangePassword: false });
  expect(await verifyPassword('password-111111', ann!.passwordHash!)).toBe(true);
  expect(() => parseSeedUsers('bad-entry')).toThrow(/email:password:role:Name/);
  expect(() => parseSeedUsers('a@x.test:short:admin:Ann')).toThrow(/12/);
});
```

`apps/server/src/http/auth/authRoutes.test.ts` (local sign-in end to end through `buildApp` with `inject`):
```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MemoryCommandStore } from '../../store/memoryStore';
import { WorkspaceService } from '../../workspaceService';
import { MemoryIdentityStore } from '../../identity/memoryIdentityStore';
import { hashPassword } from '../../identity/passwords';
import type { User } from '../../identity/types';
import { buildApp } from '../app';
import type { AuthConfig } from '../../config';
import { createSessionAuth, SESSION_COOKIE, SESSION_IDLE_MS } from './sessionAuth';
import { LoginThrottle, MAX_FAILURES } from './loginThrottle';
import { registerAuthRoutes } from './authRoutes';

const PUBLIC = 'https://glasshouse.company.test';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

const config: AuthConfig = { mode: 'on', publicUrl: new URL(PUBLIC), localLogin: true, oidc: null, bootstrapAdmin: null, defaultRole: 'viewer', secureCookies: true, seedUsers: [] };

async function setup(users: Partial<User>[] = [{}]) {
  let clock = new Date('2026-10-18T09:00:00.000Z');
  const store = new MemoryIdentityStore();
  for (const [i, over] of users.entries()) {
    await store.createUser({
      id: `u${i}`, email: `user${i}@company.test`, displayName: `User ${i}`, role: 'editor', source: 'local', oidcSubject: null,
      passwordHash: await hashPassword('password-123456'), mustChangePassword: false, active: true, createdAt: clock.toISOString(), lastLoginAt: null, ...over,
    });
  }
  const sessions = createSessionAuth(store, { secure: true, now: () => clock });
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({
    service, authenticate: sessions.authenticate, publicOrigin: PUBLIC,
    authRoutes: (a) => registerAuthRoutes(a, { store, sessions, config, oidc: null, throttle: new LoginThrottle(), now: () => clock }),
  });
  apps.push(app);
  return { app, store, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

const login = (app: FastifyInstance, email: string, password: string) =>
  app.inject({ method: 'POST', url: '/auth/login', headers: { 'x-glasshouse': '1', origin: PUBLIC }, payload: { email, password } });
const cookieOf = (res: { cookies: { name: string; value: string }[] }) => {
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE);
  return c ? `${SESSION_COOKIE}=${c.value}` : '';
};

describe('local sign-in', () => {
  it('says which ways to sign in exist', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/auth/config' })).json()).toEqual({ mode: 'on', localLogin: true, sso: false });
  });

  it('signs in with the right password only, and the cookie opens the API', async () => {
    const { app } = await setup();
    expect((await login(app, 'user0@company.test', 'wrong-password-1')).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/workspace' })).statusCode).toBe(401);
    const res = await login(app, 'USER0@company.test', 'password-123456');
    expect(res.statusCode).toBe(200);
    const raw = res.headers['set-cookie'];
    expect(String(raw)).toMatch(/HttpOnly/i);
    expect(String(raw)).toMatch(/SameSite=Lax/i);
    expect(String(raw)).toMatch(/Secure/i);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie: cookieOf(res) } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/auth/me', headers: { cookie: cookieOf(res) } })).json()).toMatchObject({ name: 'User 0', role: 'editor' });
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const { app } = await setup();
    const a = await login(app, 'nobody@company.test', 'password-123456');
    const b = await login(app, 'user0@company.test', 'wrong-password-1');
    expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
    expect(a.json()).toEqual(b.json());
  });

  it('refuses changes without the X-Glasshouse header or from another origin', async () => {
    const { app } = await setup();
    const cookie = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    const body = { clientId: 'c', commands: [{ commandId: '1', command: { type: 'project/create', id: 'p', name: 'P' } }] };
    expect((await app.inject({ method: 'POST', url: '/api/commands', headers: { cookie }, payload: body })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/commands', headers: { cookie, 'x-glasshouse': '1', origin: 'https://evil.test' }, payload: body })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/commands', headers: { cookie, 'x-glasshouse': '1', origin: PUBLIC }, payload: body })).statusCode).toBe(200);
  });

  it('makes a new user change the temporary password before anything else', async () => {
    const { app } = await setup([{ mustChangePassword: true }]);
    const first = await login(app, 'user0@company.test', 'password-123456');
    expect(first.json()).toEqual({ mustChangePassword: true });
    const cookie = cookieOf(first);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie } })).json()).toMatchObject({ error: { code: 'password_change_required' } });
    const short = await app.inject({ method: 'POST', url: '/auth/password', headers: { cookie, 'x-glasshouse': '1' }, payload: { current: 'password-123456', next: 'short' } });
    expect(short.statusCode).toBe(400);
    const changed = await app.inject({ method: 'POST', url: '/auth/password', headers: { cookie, 'x-glasshouse': '1' }, payload: { current: 'password-123456', next: 'a-new-long-password' } });
    expect(changed.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie: cookieOf(changed) } })).statusCode).toBe(200);
  });

  it('slows down guessing', async () => {
    const { app } = await setup();
    for (let i = 0; i < MAX_FAILURES; i += 1) await login(app, 'user0@company.test', 'wrong-password-1');
    expect((await login(app, 'user0@company.test', 'password-123456')).statusCode).toBe(429);
  });

  it('a signed-out or expired session is refused', async () => {
    const { app, advance } = await setup();
    const cookie = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie, 'x-glasshouse': '1' } });
    expect(out.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie } })).statusCode).toBe(401);
    const again = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    advance(SESSION_IDLE_MS + 1000);
    expect((await app.inject({ url: '/api/workspace', headers: { cookie: again } })).statusCode).toBe(401);
  });

  it('refuses a switched-off user', async () => {
    const { app, store } = await setup();
    const cookie = cookieOf(await login(app, 'user0@company.test', 'password-123456'));
    await store.updateUser('u0', { active: false });
    expect((await app.inject({ url: '/api/workspace', headers: { cookie } })).statusCode).toBe(401);
    expect((await login(app, 'user0@company.test', 'password-123456')).statusCode).toBe(401);
  });
});
```
Also update `apps/server/src/http/app.test.ts` and `events.test.ts` calls to `buildApp(...)` to pass `authRoutes: registerDevAuthRoutes, publicOrigin: null`.

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @glasshouse/server exec vitest run src/config.test.ts src/http src/identity/seedUsers.test.ts` — Expected: FAIL.

- [ ] **Step 4: Implement**

`apps/server/src/store/commandStore.ts` — replace `Actor`:
```ts
import type { Role } from '../identity/types';

/** Who sent a command: the signed-in user, or the unverified dev stand-in (GLASSHOUSE_AUTH=dev-insecure). */
export interface Actor {
  id: string;
  name: string;
  role: Role;
  /** False for the dev stand-in: nothing is stamped with its name. */
  verified: boolean;
  mustChangePassword?: boolean;
}
```
(`LoggedCommand.actor` keeps the same type; Postgres still stores only `actor_id` and `actor_name`, and `toLogged` in `pgStore.ts` fills `role: 'viewer', verified: true` for read-back entries — the log's actor is a record, not a credential. Update `pgStore.ts` `toLogged` and the memory store test fixtures to the new shape.)

`apps/server/src/http/devAuth.ts`:
```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Actor } from '../store/commandStore';

export type Authenticate = (request: FastifyRequest) => Actor | null | Promise<Actor | null>;

const NAME_MAX = 60;

/** GLASSHOUSE_AUTH=dev-insecure: an unverified admin named by a header (or "Developer"). Local development only. */
export const devAuthenticate: Authenticate = (request) => {
  const header = request.headers['x-glasshouse-dev-user'];
  const name = typeof header === 'string' && header.trim() !== '' ? header.trim().slice(0, NAME_MAX) : 'Developer';
  return { id: `dev:${name}`, name, role: 'admin', verified: false };
};

export function registerDevAuthRoutes(app: FastifyInstance): void {
  app.get('/auth/config', async () => ({ mode: 'dev' }));
}
```

`apps/server/src/config.ts` — replace the auth part:
```ts
import { z } from 'zod';
import { isRole, type Role } from './identity/types';
import { parseSeedUsers, type SeedUser } from './identity/seedUsers';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_URL: z.string().min(1).optional(),
  GLASSHOUSE_STORE: z.enum(['postgres', 'memory']).default('postgres'),
  GLASSHOUSE_AUTH: z.enum(['dev-insecure', 'on']).optional(),
  GLASSHOUSE_WEB_DIR: z.string().min(1).optional(),
  GLASSHOUSE_SEED_SAMPLE: z.enum(['0', '1']).default('0'),
  GLASSHOUSE_PUBLIC_URL: z.string().url().optional(),
  GLASSHOUSE_LOCAL_LOGIN: z.enum(['on', 'off']).default('on'),
  GLASSHOUSE_OIDC_ISSUER: z.string().url().optional(),
  GLASSHOUSE_OIDC_CLIENT_ID: z.string().min(1).optional(),
  GLASSHOUSE_OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  GLASSHOUSE_BOOTSTRAP_ADMIN: z.string().email().optional(),
  GLASSHOUSE_DEFAULT_ROLE: z.string().default('viewer'),
  GLASSHOUSE_SEED_USERS: z.string().min(1).optional(),
});

export interface AuthConfig {
  mode: 'on';
  publicUrl: URL;
  localLogin: boolean;
  oidc: { issuer: string; clientId: string; clientSecret: string } | null;
  bootstrapAdmin: string | null;
  defaultRole: Role;
  secureCookies: boolean;
  seedUsers: SeedUser[];
}

export interface Config {
  port: number;
  host: string;
  store: 'postgres' | 'memory';
  databaseUrl: string | null;
  auth: { mode: 'dev-insecure' } | AuthConfig;
  webDir: string | null;
  seedSample: boolean;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function authConfig(c: z.infer<typeof schema>): AuthConfig {
  if (!c.GLASSHOUSE_PUBLIC_URL) throw new Error('GLASSHOUSE_PUBLIC_URL is required when GLASSHOUSE_AUTH=on (e.g. https://glasshouse.company.local).');
  const publicUrl = new URL(c.GLASSHOUSE_PUBLIC_URL);
  if (publicUrl.protocol !== 'https:' && !LOOPBACK.has(publicUrl.hostname)) {
    throw new Error('GLASSHOUSE_PUBLIC_URL must be https outside localhost: session cookies must not travel in the clear.');
  }
  const oidcParts = [c.GLASSHOUSE_OIDC_ISSUER, c.GLASSHOUSE_OIDC_CLIENT_ID, c.GLASSHOUSE_OIDC_CLIENT_SECRET];
  if (oidcParts.some(Boolean) && !oidcParts.every(Boolean)) {
    throw new Error('Set GLASSHOUSE_OIDC_ISSUER, GLASSHOUSE_OIDC_CLIENT_ID and GLASSHOUSE_OIDC_CLIENT_SECRET together.');
  }
  const oidc = c.GLASSHOUSE_OIDC_ISSUER ? { issuer: c.GLASSHOUSE_OIDC_ISSUER, clientId: c.GLASSHOUSE_OIDC_CLIENT_ID!, clientSecret: c.GLASSHOUSE_OIDC_CLIENT_SECRET! } : null;
  const localLogin = c.GLASSHOUSE_LOCAL_LOGIN === 'on';
  if (!localLogin && !oidc) throw new Error('Enable at least one way to sign in: OIDC settings, or GLASSHOUSE_LOCAL_LOGIN=on.');
  if (!isRole(c.GLASSHOUSE_DEFAULT_ROLE) || c.GLASSHOUSE_DEFAULT_ROLE === 'admin') {
    throw new Error('GLASSHOUSE_DEFAULT_ROLE must be viewer, editor or reviewer.');
  }
  if (c.GLASSHOUSE_SEED_USERS && c.GLASSHOUSE_STORE !== 'memory') throw new Error('GLASSHOUSE_SEED_USERS only works with GLASSHOUSE_STORE=memory (tests and e2e).');
  return {
    mode: 'on',
    publicUrl,
    localLogin,
    oidc,
    bootstrapAdmin: c.GLASSHOUSE_BOOTSTRAP_ADMIN ?? null,
    defaultRole: c.GLASSHOUSE_DEFAULT_ROLE,
    secureCookies: publicUrl.protocol === 'https:',
    seedUsers: c.GLASSHOUSE_SEED_USERS ? parseSeedUsers(c.GLASSHOUSE_SEED_USERS) : [],
  };
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid Glasshouse server configuration: ${z.prettifyError(parsed.error)}`);
  const c = parsed.data;
  if (!c.GLASSHOUSE_AUTH) throw new Error('GLASSHOUSE_AUTH is not set: use GLASSHOUSE_AUTH=on for a shared server, or dev-insecure for local development.');
  if (c.GLASSHOUSE_STORE === 'postgres' && !c.DATABASE_URL) throw new Error('DATABASE_URL is required when GLASSHOUSE_STORE=postgres.');
  return {
    port: c.PORT,
    host: c.HOST,
    store: c.GLASSHOUSE_STORE,
    databaseUrl: c.DATABASE_URL ?? null,
    auth: c.GLASSHOUSE_AUTH === 'on' ? authConfig(c) : { mode: 'dev-insecure' },
    webDir: c.GLASSHOUSE_WEB_DIR ?? null,
    seedSample: c.GLASSHOUSE_SEED_SAMPLE === '1',
  };
}
```

`apps/server/src/identity/seedUsers.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { hashPassword, passwordProblem } from './passwords';
import { isRole, type IdentityStore, type Role } from './types';

export interface SeedUser {
  email: string;
  password: string;
  role: Role;
  displayName: string;
}

/** "email:password:role:Name; …" — for the in-memory e2e server only (config refuses it with Postgres). */
export function parseSeedUsers(text: string): SeedUser[] {
  return text.split(';').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [email, password, role, ...name] = entry.split(':');
    const displayName = name.join(':').trim();
    if (!email || !password || !isRole(role) || !displayName) throw new Error(`GLASSHOUSE_SEED_USERS entries are email:password:role:Name — got "${entry}".`);
    const problem = passwordProblem(password);
    if (problem) throw new Error(`Seed user ${email}: ${problem}`);
    return { email: email.trim(), password, role, displayName };
  });
}

export async function seedUsers(store: IdentityStore, users: SeedUser[], now: string): Promise<void> {
  for (const u of users) {
    await store.createUser({
      id: randomUUID(), email: u.email, displayName: u.displayName, role: u.role, source: 'local', oidcSubject: null,
      passwordHash: await hashPassword(u.password), mustChangePassword: false, active: true, createdAt: now, lastLoginAt: null,
    });
  }
}
```

`apps/server/src/http/auth/loginThrottle.ts`:
```ts
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;

/** In memory: the server is a single instance, and a restart forgetting failures is acceptable. */
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  private recent(key: string): number[] {
    const since = this.now() - WINDOW_MS;
    const list = (this.failures.get(key) ?? []).filter((t) => t > since);
    if (list.length === 0) this.failures.delete(key);
    else this.failures.set(key, list);
    return list;
  }
  blocked(key: string): boolean {
    return this.recent(key).length >= MAX_FAILURES;
  }
  fail(key: string): void {
    this.failures.set(key, [...this.recent(key), this.now()]);
  }
  clear(key: string): void {
    this.failures.delete(key);
  }
}
```

`apps/server/src/http/auth/csrf.ts`:
```ts
import type { FastifyRequest } from 'fastify';

/**
 * Changes need our own header (a cross-site form can't send it) and, when the browser says where the
 * request came from, our own origin. The SameSite=Lax cookie is the third layer.
 */
export function checkMutation(request: FastifyRequest, publicOrigin: string | null): string | null {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  if (request.headers['x-glasshouse'] !== '1') return 'This request is missing the Glasshouse header.';
  const origin = request.headers.origin;
  if (publicOrigin && typeof origin === 'string' && origin !== publicOrigin) return 'This request came from another site.';
  return null;
}
```

`apps/server/src/http/auth/sessionAuth.ts`:
```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IdentityStore, User } from '../../identity/types';
import { hashToken, newSessionToken } from '../../identity/tokens';
import type { Authenticate } from '../devAuth';

export const SESSION_COOKIE = 'gh_session';
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
/** Busy users would otherwise write the session row on every request. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export interface SessionAuth {
  authenticate: Authenticate;
  startSession(reply: FastifyReply, user: User): Promise<void>;
  endSession(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}

export function createSessionAuth(store: IdentityStore, { secure, now = () => new Date() }: { secure: boolean; now?: () => Date }): SessionAuth {
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
  const tokenOf = (request: FastifyRequest): string | null => {
    const value = request.cookies[SESSION_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };
  return {
    async authenticate(request) {
      const token = tokenOf(request);
      if (!token) return null;
      const tokenHash = hashToken(token);
      const session = await store.findSession(tokenHash);
      if (!session) return null;
      const t = now().getTime();
      if (t >= Date.parse(session.expiresAt) || t - Date.parse(session.lastSeenAt) > SESSION_IDLE_MS) {
        await store.deleteSession(tokenHash);
        return null;
      }
      const user = await store.findUserById(session.userId);
      if (!user || !user.active) return null;
      if (t - Date.parse(session.lastSeenAt) > TOUCH_EVERY_MS) await store.touchSession(tokenHash, new Date(t).toISOString());
      return { id: user.id, name: user.displayName, role: user.role, verified: true, mustChangePassword: user.mustChangePassword };
    },
    async startSession(reply, user) {
      const token = newSessionToken();
      const t = now();
      await store.createSession({ tokenHash: hashToken(token), userId: user.id, createdAt: t.toISOString(), lastSeenAt: t.toISOString(), expiresAt: new Date(t.getTime() + SESSION_MAX_MS).toISOString() });
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_MS / 1000 });
    },
    async endSession(request, reply) {
      const token = tokenOf(request);
      if (token) await store.deleteSession(hashToken(token));
      reply.clearCookie(SESSION_COOKIE, cookieOptions);
    },
  };
}
```

`apps/server/src/http/auth/authRoutes.ts`:
```ts
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AuthConfig } from '../../config';
import { hashPassword, passwordProblem, verifyPassword } from '../../identity/passwords';
import type { IdentityStore } from '../../identity/types';
import { checkMutation } from './csrf';
import type { LoginThrottle } from './loginThrottle';
import type { OidcLogin } from './oidc';
import type { SessionAuth } from './sessionAuth';

export interface AuthRouteDeps {
  store: IdentityStore;
  sessions: SessionAuth;
  config: AuthConfig;
  oidc: OidcLogin | null;
  throttle: LoginThrottle;
  now: () => Date;
}

const WRONG = { error: { code: 'unauthorised', message: 'That email and password don’t match an account.', targets: [] } };
const loginBody = z.object({ email: z.string().min(3).max(200), password: z.string().min(1).max(500) });
const passwordBody = z.object({ current: z.string().min(1).max(500), next: z.string().max(500) });
const refuse = (reply: FastifyReply, status: number, code: string, message: string) => reply.code(status).send({ error: { code, message, targets: [] } });

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { store, sessions, config, throttle, now } = deps;
  const origin = config.publicUrl.origin;

  app.get('/auth/config', async () => ({ mode: 'on', localLogin: config.localLogin, sso: deps.oidc !== null }));

  app.get('/auth/me', async (request, reply) => {
    const actor = await sessions.authenticate(request);
    if (!actor) return refuse(reply, 401, 'unauthorised', 'Sign in to use Glasshouse.');
    const user = await store.findUserById(actor.id);
    if (!user) return refuse(reply, 401, 'unauthorised', 'Sign in to use Glasshouse.');
    return { id: user.id, name: user.displayName, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
  });

  app.post('/auth/login', async (request, reply) => {
    const csrf = checkMutation(request, origin);
    if (csrf) return refuse(reply, 403, 'csrf', csrf);
    if (!config.localLogin) return refuse(reply, 404, 'not_found', 'Sign-in with a password is switched off here.');
    const body = loginBody.safeParse(request.body);
    if (!body.success) return reply.code(401).send(WRONG);
    const key = `${request.ip}|${body.data.email.toLowerCase()}`;
    if (throttle.blocked(key)) return refuse(reply, 429, 'too_many', 'Too many tries. Wait 15 minutes and try again.');
    const user = await store.findUserByEmail(body.data.email);
    const ok = user !== null && user.active && user.source === 'local' && user.passwordHash !== null && (await verifyPassword(body.data.password, user.passwordHash));
    if (!ok || !user) {
      throttle.fail(key);
      return reply.code(401).send(WRONG);
    }
    throttle.clear(key);
    await store.updateUser(user.id, { lastLoginAt: now().toISOString() });
    await sessions.startSession(reply, user);
    return { mustChangePassword: user.mustChangePassword };
  });

  app.post('/auth/password', async (request, reply) => {
    const csrf = checkMutation(request, origin);
    if (csrf) return refuse(reply, 403, 'csrf', csrf);
    const actor = await sessions.authenticate(request);
    if (!actor) return refuse(reply, 401, 'unauthorised', 'Sign in again to change your password.');
    const user = await store.findUserById(actor.id);
    if (!user || user.source !== 'local' || !user.passwordHash) return refuse(reply, 400, 'invalid_value', 'This account signs in through the company account; change the password there.');
    const body = passwordBody.safeParse(request.body);
    if (!body.success) return refuse(reply, 400, 'invalid_value', 'Fill in your current and new password.');
    if (!(await verifyPassword(body.data.current, user.passwordHash))) return refuse(reply, 400, 'invalid_value', 'Your current password is not right.');
    const problem = passwordProblem(body.data.next);
    if (problem) return refuse(reply, 400, 'invalid_value', problem);
    await store.updateUser(user.id, { passwordHash: await hashPassword(body.data.next), mustChangePassword: false });
    // Every other session (and this one) ends; this browser gets a fresh one.
    await store.deleteUserSessions(user.id);
    await sessions.startSession(reply, { ...user, mustChangePassword: false });
    return reply.code(204).send();
  });

  app.post('/auth/logout', async (request, reply) => {
    const csrf = checkMutation(request, origin);
    if (csrf) return refuse(reply, 403, 'csrf', csrf);
    await sessions.endSession(request, reply);
    return reply.code(204).send();
  });
}
```

`apps/server/src/http/app.ts` — new deps and hook (keep everything else as it is):
```ts
import fastifyCookie from '@fastify/cookie';
import { checkMutation } from './auth/csrf';
…
export interface AppDeps {
  service: WorkspaceService;
  authenticate: Authenticate;
  /** Public sign-in routes (/auth/*): dev or real. */
  authRoutes: (app: FastifyInstance) => void | Promise<void>;
  /** GLASSHOUSE_PUBLIC_URL's origin; null in dev-insecure. */
  publicOrigin: string | null;
  /** Admin-only API routes, registered inside the authenticated plugin (Task 5). */
  admin?: (api: FastifyInstance) => void;
  webDir?: string | null;
  logger?: boolean;
  heartbeatMs?: number;
}

export async function buildApp({ service, authenticate, authRoutes, publicOrigin, admin, webDir = null, logger = false, heartbeatMs }: AppDeps) {
  const app = Fastify({ logger, bodyLimit: BODY_LIMIT, forceCloseConnections: true });
  await app.register(fastifyCookie);
  app.decorateRequest('actor', null);
  app.get('/api/health', async () => ({ ok: true, seq: service.state.seq }));
  await app.register(async (auth) => {
    await authRoutes(auth);
  });
  await app.register(async (api) => {
    api.addHook('onRequest', async (request, reply) => {
      const actor = await authenticate(request);
      if (!actor) return reply.code(401).send({ error: { code: 'unauthorised', message: 'Sign in to use Glasshouse.', targets: [] } });
      if (actor.mustChangePassword) return reply.code(403).send({ error: { code: 'password_change_required', message: 'Change your temporary password first.', targets: [] } });
      const csrf = checkMutation(request, publicOrigin);
      if (csrf) return reply.code(403).send({ error: { code: 'csrf', message: csrf, targets: [] } });
      request.actor = actor;
    });
    api.get('/api/workspace', async () => service.state);
    registerCommands(api, service);
    registerEvents(api, service, { heartbeatMs });
    admin?.(api);
  });
  … (static web as before)
}
```
(In dev mode the web client already sends `X-Glasshouse: 1` on POSTs, so the header check holds there too.)

`apps/server/src/main.ts` — choose the auth wiring by mode:
```ts
import { MemoryIdentityStore } from './identity/memoryIdentityStore';
import { PgIdentityStore } from './identity/pgIdentityStore';
import { seedUsers } from './identity/seedUsers';
import type { IdentityStore } from './identity/types';
import { createSessionAuth } from './http/auth/sessionAuth';
import { LoginThrottle } from './http/auth/loginThrottle';
import { registerAuthRoutes } from './http/auth/authRoutes';
import { devAuthenticate, registerDevAuthRoutes } from './http/devAuth';
…
const config = loadConfig(process.env);
const store = …as before…;
const service = await WorkspaceService.open(store, { seedSample: config.seedSample });
let identity: IdentityStore | null = null;
let app;
if (config.auth.mode === 'dev-insecure') {
  app = await buildApp({ service, authenticate: devAuthenticate, authRoutes: registerDevAuthRoutes, publicOrigin: null, webDir: config.webDir, logger: true });
  app.log.warn('GLASSHOUSE_AUTH=dev-insecure: anyone who can reach this server can edit everything. Local development only.');
} else {
  const auth = config.auth;
  identity = config.store === 'memory' ? new MemoryIdentityStore() : await PgIdentityStore.connect(config.databaseUrl!);
  await seedUsers(identity, auth.seedUsers, new Date().toISOString());
  const sessions = createSessionAuth(identity, { secure: auth.secureCookies });
  const throttle = new LoginThrottle();
  const idStore = identity;
  app = await buildApp({
    service, authenticate: sessions.authenticate, publicOrigin: auth.publicUrl.origin, webDir: config.webDir, logger: true,
    authRoutes: (a) => registerAuthRoutes(a, { store: idStore, sessions, config: auth, oidc: null, throttle, now: () => new Date() }),
  });
  // Expired sessions are swept hourly; a failure is logged and retried next hour.
  const sweep = setInterval(() => void idStore.deleteExpiredSessions(new Date().toISOString()).catch((e: unknown) => app!.log.error(e, 'Sweeping expired sessions failed')), 60 * 60 * 1000);
  sweep.unref();
}
await app.listen({ port: config.port, host: config.host });
```
and in `shutdown` add `await identity?.close();` after `store.close()`.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/server test && pnpm --filter @glasshouse/server typecheck && pnpm --filter @glasshouse/server build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "feat(server): cookie sessions, local sign-in, password change and CSRF checks"
```

---

### Task 4: Company sign-in (Authelia OIDC)

**Files:**
- Modify: `apps/server/src/http/auth/oidc.ts` (add `createOidcLogin`; the types and `safeReturnTo` exist since Task 3)
- Create: `apps/server/src/identity/provision.ts`, `apps/server/src/identity/provision.test.ts`, `apps/server/src/http/auth/oidc.test.ts`
- Modify: `apps/server/src/http/auth/authRoutes.ts` (OIDC routes), `apps/server/src/main.ts`, `apps/server/package.json`

**Interfaces:**
- Consumes: Task 3's `AuthRouteDeps`, `SessionAuth`, `AuthConfig`; Task 2's store.
- Produces:
  - `interface OidcClaims { sub: string; email: string | null; emailVerified: boolean; name: string | null }`
  - `interface OidcLogin { start(returnTo: string): Promise<string>; finish(callbackUrl: URL): Promise<{ claims: OidcClaims; returnTo: string }> }` (`start` returns the IdP URL; `finish` throws `OidcError` with a user-facing message)
  - `createOidcLogin(options: { issuer: string; clientId: string; clientSecret: string; redirectUri: string; now?: () => number }): Promise<OidcLogin>`
  - `provisionOidcUser(store, claims, options: { defaultRole: Role; bootstrapAdmin: string | null; now: string }): Promise<{ user: User } | { refused: string }>`
  - `safeReturnTo(value: unknown): string`
  - HTTP: `GET /auth/oidc/start?returnTo=/path` → 302 to the IdP; `GET /auth/oidc/callback` → 302 to `returnTo` with a session cookie, or 302 to `/?signin_error=<message>`.

- [ ] **Step 1: Install**

```bash
pnpm --filter @glasshouse/server add openid-client
pnpm --filter @glasshouse/server add -D oauth2-mock-server
```

- [ ] **Step 2: Write the failing tests**

`apps/server/src/identity/provision.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MemoryIdentityStore } from './memoryIdentityStore';
import { provisionOidcUser } from './provision';

const NOW = '2026-10-18T09:00:00.000Z';
const opts = { defaultRole: 'viewer' as const, bootstrapAdmin: 'few@company.test', now: NOW };
const claims = (over = {}) => ({ sub: 'sub-ploy', email: 'ploy@company.test', emailVerified: true, name: 'Ploy S.', ...over });

describe('provisionOidcUser', () => {
  it('creates a new SSO user with the default role, and the bootstrap admin as admin', async () => {
    const store = new MemoryIdentityStore();
    const a = await provisionOidcUser(store, claims(), opts);
    expect('user' in a && a.user).toMatchObject({ role: 'viewer', source: 'oidc', oidcSubject: 'sub-ploy', displayName: 'Ploy S.' });
    const b = await provisionOidcUser(store, claims({ sub: 'sub-few', email: 'FEW@company.test', name: 'Few' }), opts);
    expect('user' in b && b.user.role).toBe('admin');
  });

  it('finds the same user again by subject, keeps the role and refreshes name and email', async () => {
    const store = new MemoryIdentityStore();
    const first = await provisionOidcUser(store, claims(), opts);
    if (!('user' in first)) throw new Error('refused');
    await store.updateUser(first.user.id, { role: 'reviewer' });
    const again = await provisionOidcUser(store, claims({ name: 'Ploy Suk', email: 'ploy.s@company.test' }), opts);
    expect('user' in again && again.user).toMatchObject({ id: first.user.id, role: 'reviewer', displayName: 'Ploy Suk', email: 'ploy.s@company.test' });
  });

  it('links an existing local account by verified email, never through an unverified email', async () => {
    const store = new MemoryIdentityStore();
    await store.createUser({ id: 'local-1', email: 'ploy@company.test', displayName: 'Ploy', role: 'editor', source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, active: true, createdAt: NOW, lastLoginAt: null });
    const unverified = await provisionOidcUser(store, claims({ emailVerified: false }), opts);
    expect(unverified).toEqual({ refused: expect.stringMatching(/already/) });
    const linked = await provisionOidcUser(store, claims(), opts);
    expect('user' in linked && linked.user).toMatchObject({ id: 'local-1', role: 'editor', oidcSubject: 'sub-ploy' });
  });

  it('provisions a user without an email by subject, and refuses a switched-off one', async () => {
    const store = new MemoryIdentityStore();
    const noEmail = await provisionOidcUser(store, claims({ email: null, sub: 'sub-x', name: null }), opts);
    expect('user' in noEmail && noEmail.user).toMatchObject({ oidcSubject: 'sub-x', displayName: 'sub-x' });
    if ('user' in noEmail) await store.updateUser(noEmail.user.id, { active: false });
    expect(await provisionOidcUser(store, claims({ email: null, sub: 'sub-x' }), opts)).toEqual({ refused: expect.stringMatching(/switched off/) });
  });
});
```

`apps/server/src/http/auth/oidc.test.ts` (against a real OIDC test server):
```ts
import { OAuth2Server } from 'oauth2-mock-server';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { AuthConfig } from '../../config';
import { MemoryIdentityStore } from '../../identity/memoryIdentityStore';
import { MemoryCommandStore } from '../../store/memoryStore';
import { WorkspaceService } from '../../workspaceService';
import { buildApp } from '../app';
import { registerAuthRoutes } from './authRoutes';
import { LoginThrottle } from './loginThrottle';
import { createOidcLogin } from './oidc';
import { createSessionAuth, SESSION_COOKIE } from './sessionAuth';

const PUBLIC = 'http://localhost:5399';
let idp: OAuth2Server;
let claims: Record<string, unknown> = {};
const apps: FastifyInstance[] = [];

beforeAll(async () => {
  idp = new OAuth2Server();
  await idp.issuer.keys.generate('RS256');
  await idp.start(0, '127.0.0.1');
  idp.service.on('beforeTokenSigning', (token) => Object.assign(token.payload, claims));
});
afterAll(async () => {
  await idp.stop();
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function setup(store = new MemoryIdentityStore()) {
  const config: AuthConfig = { mode: 'on', publicUrl: new URL(PUBLIC), localLogin: false, oidc: { issuer: idp.issuer.url!, clientId: 'glasshouse', clientSecret: 'test-secret' }, bootstrapAdmin: 'few@company.test', defaultRole: 'viewer', secureCookies: false, seedUsers: [] };
  const oidc = await createOidcLogin({ ...config.oidc!, redirectUri: `${PUBLIC}/auth/oidc/callback` });
  const sessions = createSessionAuth(store, { secure: false });
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({ service, authenticate: sessions.authenticate, publicOrigin: PUBLIC, authRoutes: (a) => registerAuthRoutes(a, { store, sessions, config, oidc, throttle: new LoginThrottle(), now: () => new Date() }) });
  apps.push(app);
  return { app, store };
}

/** Browser stand-in: start → IdP (auto-approves) → back to our callback. */
async function signIn(app: FastifyInstance, returnTo = '/rooms/r1/plan') {
  const start = await app.inject({ url: `/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}` });
  expect(start.statusCode).toBe(302);
  const atIdp = await fetch(start.headers.location as string, { redirect: 'manual' });
  const back = new URL(atIdp.headers.get('location')!);
  return app.inject({ url: `${back.pathname}${back.search}` });
}

it('signs a new company user in with the default role and returns them where they were', async () => {
  claims = { sub: 'authelia-ploy', email: 'ploy@company.test', email_verified: true, name: 'Ploy S.' };
  const { app } = await setup();
  const res = await signIn(app);
  expect(res.statusCode).toBe(302);
  expect(res.headers.location).toBe('/rooms/r1/plan');
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
  const me = await app.inject({ url: '/auth/me', headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` } });
  expect(me.json()).toMatchObject({ name: 'Ploy S.', email: 'ploy@company.test', role: 'viewer' });
  expect((await app.inject({ url: '/auth/config' })).json()).toEqual({ mode: 'on', localLogin: false, sso: true });
});

it('makes the bootstrap email an admin', async () => {
  claims = { sub: 'authelia-few', email: 'few@company.test', email_verified: true, name: 'Few' };
  const { app } = await setup();
  const cookie = (await signIn(app)).cookies.find((c) => c.name === SESSION_COOKIE)!;
  expect((await app.inject({ url: '/auth/me', headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` } })).json()).toMatchObject({ role: 'admin' });
});

it('refuses a switched-off user and an unknown or replayed callback', async () => {
  claims = { sub: 'authelia-off', email: 'off@company.test', email_verified: true, name: 'Off' };
  const { app, store } = await setup();
  await signIn(app);
  const user = await store.findUserBySubject('authelia-off');
  await store.updateUser(user!.id, { active: false });
  const refused = await signIn(app);
  expect(refused.headers.location).toMatch(/^\/\?signin_error=/);
  const bogus = await app.inject({ url: '/auth/oidc/callback?code=x&state=not-ours' });
  expect(bogus.headers.location).toMatch(/^\/\?signin_error=/);
});

it('never redirects off-site after sign-in', async () => {
  claims = { sub: 'authelia-r', email: 'r@company.test', email_verified: true, name: 'R' };
  const { app } = await setup();
  expect((await signIn(app, 'https://evil.test/')).headers.location).toBe('/');
  expect((await signIn(app, '//evil.test/x')).headers.location).toBe('/');
});
```
(If `idp.start(0, …)` doesn't pick a free port in the installed version, use a fixed free port such as 18980 and say so in the report.)

- [ ] **Step 3: Run to verify they fail** — `pnpm --filter @glasshouse/server exec vitest run src/identity/provision.test.ts src/http/auth/oidc.test.ts` — Expected: FAIL.

- [ ] **Step 4: Implement**

`apps/server/src/identity/provision.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { OidcClaims } from '../http/auth/oidc';
import { DuplicateUserError, type IdentityStore, type Role, type User } from './types';

const NAME_MAX = 80;
const ALREADY = 'An account with this email already exists in Glasshouse. Ask an admin to link it.';

/** Who an SSO sign-in is: by subject first, then a local account with the same *verified* email, else a new user. */
export async function provisionOidcUser(
  store: IdentityStore,
  claims: OidcClaims,
  { defaultRole, bootstrapAdmin, now }: { defaultRole: Role; bootstrapAdmin: string | null; now: string },
): Promise<{ user: User } | { refused: string }> {
  const displayName = (claims.name ?? claims.email ?? claims.sub).trim().slice(0, NAME_MAX) || claims.sub;
  let user = await store.findUserBySubject(claims.sub);
  if (!user && claims.email) {
    const byEmail = await store.findUserByEmail(claims.email);
    if (byEmail && byEmail.oidcSubject === null) {
      if (!claims.emailVerified) return { refused: ALREADY };
      user = await store.updateUser(byEmail.id, { oidcSubject: claims.sub });
    }
  }
  try {
    if (!user) {
      const isBootstrap = bootstrapAdmin !== null && claims.emailVerified && claims.email !== null && claims.email.toLowerCase() === bootstrapAdmin.toLowerCase();
      const created: User = {
        id: randomUUID(), email: claims.email ?? `${claims.sub}@sso.invalid`, displayName, role: isBootstrap ? 'admin' : defaultRole, source: 'oidc',
        oidcSubject: claims.sub, passwordHash: null, mustChangePassword: false, active: true, createdAt: now, lastLoginAt: now,
      };
      await store.createUser(created);
      return { user: created };
    }
    if (!user.active) return { refused: 'Your Glasshouse account is switched off. Ask an admin.' };
    const updated = await store.updateUser(user.id, { displayName, ...(claims.email && claims.emailVerified ? { email: claims.email } : {}), lastLoginAt: now });
    return updated ? { user: updated } : { refused: 'Your account could not be found. Try again.' };
  } catch (e) {
    if (e instanceof DuplicateUserError) return { refused: ALREADY };
    throw e;
  }
}
```

`apps/server/src/http/auth/oidc.ts`:
```ts
import * as client from 'openid-client';

export interface OidcClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface OidcLogin {
  /** The IdP URL to send the browser to. */
  start(returnTo: string): Promise<string>;
  finish(callbackUrl: URL): Promise<{ claims: OidcClaims; returnTo: string }>;
}

export class OidcError extends Error {}

/** A sign-in started but never finished is forgotten after this; the map is also capped. */
const PENDING_TTL_MS = 10 * 60 * 1000;
const PENDING_MAX = 1000;
const LOOPBACK = new Set(['localhost', '127.0.0.1']);

/** Only same-site paths: never an absolute or protocol-relative URL. */
export const safeReturnTo = (value: unknown): string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';

export async function createOidcLogin(options: { issuer: string; clientId: string; clientSecret: string; redirectUri: string; now?: () => number }): Promise<OidcLogin> {
  const now = options.now ?? (() => Date.now());
  const issuer = new URL(options.issuer);
  // Plain http only for a loopback test IdP; Authelia is always https.
  const insecure = issuer.protocol === 'http:' && LOOPBACK.has(issuer.hostname);
  const config = await client.discovery(issuer, options.clientId, options.clientSecret, undefined, insecure ? { execute: [client.allowInsecureRequests] } : undefined);
  const pending = new Map<string, { verifier: string; nonce: string; returnTo: string; at: number }>();
  const prune = (): void => {
    const cutoff = now() - PENDING_TTL_MS;
    for (const [state, p] of pending) if (p.at < cutoff) pending.delete(state);
    while (pending.size >= PENDING_MAX) pending.delete(pending.keys().next().value!);
  };
  return {
    async start(returnTo) {
      prune();
      const state = client.randomState();
      const verifier = client.randomPKCECodeVerifier();
      const nonce = client.randomNonce();
      pending.set(state, { verifier, nonce, returnTo: safeReturnTo(returnTo), at: now() });
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: options.redirectUri,
        scope: 'openid profile email',
        code_challenge: await client.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
        state,
        nonce,
      });
      return url.href;
    },
    async finish(callbackUrl) {
      const error = callbackUrl.searchParams.get('error');
      if (error) throw new OidcError(error === 'access_denied' ? 'Sign-in was cancelled.' : `The company sign-in refused: ${error}.`);
      const state = callbackUrl.searchParams.get('state') ?? '';
      const p = pending.get(state);
      if (!p || p.at < now() - PENDING_TTL_MS) throw new OidcError('This sign-in link has expired. Try again.');
      pending.delete(state);
      const tokens = await client.authorizationCodeGrant(config, callbackUrl, { pkceCodeVerifier: p.verifier, expectedState: state, expectedNonce: p.nonce });
      const c = tokens.claims();
      if (!c?.sub) throw new OidcError('The company sign-in did not say who you are.');
      const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
      return { claims: { sub: c.sub, email: str(c.email), emailVerified: c.email_verified === true, name: str(c.name) ?? str(c.preferred_username) }, returnTo: p.returnTo };
    },
  };
}
```

`apps/server/src/http/auth/authRoutes.ts` — add inside `registerAuthRoutes` (import `provisionOidcUser`, `OidcError`, `safeReturnTo`):
```ts
  if (deps.oidc) {
    const oidc = deps.oidc;
    const failTo = (reply: FastifyReply, message: string) => reply.redirect(`/?signin_error=${encodeURIComponent(message)}`);
    app.get('/auth/oidc/start', async (request, reply) => {
      const returnTo = safeReturnTo((request.query as { returnTo?: unknown }).returnTo);
      return reply.redirect(await oidc.start(returnTo));
    });
    app.get('/auth/oidc/callback', async (request, reply) => {
      let result: Awaited<ReturnType<OidcLogin['finish']>>;
      try {
        result = await oidc.finish(new URL(request.url, config.publicUrl));
      } catch (e) {
        if (e instanceof OidcError) return failTo(reply, e.message);
        request.log.error(e, 'Company sign-in failed');
        return failTo(reply, 'The company sign-in failed. Try again, or ask an admin.');
      }
      const outcome = await provisionOidcUser(store, result.claims, { defaultRole: config.defaultRole, bootstrapAdmin: config.bootstrapAdmin, now: now().toISOString() });
      if ('refused' in outcome) return failTo(reply, outcome.refused);
      await sessions.startSession(reply, outcome.user);
      return reply.redirect(result.returnTo);
    });
  }
```

`apps/server/src/main.ts` — in the `on` branch, before `buildApp`:
```ts
  const oidc = auth.oidc ? await createOidcLogin({ ...auth.oidc, redirectUri: new URL('/auth/oidc/callback', auth.publicUrl).href }) : null;
```
and pass `oidc` into `registerAuthRoutes` deps. (Discovery failing at boot stops the server with the IdP's error — loud, as it should be.)

- [ ] **Step 5: Run tests** — `pnpm --filter @glasshouse/server test && pnpm --filter @glasshouse/server typecheck && pnpm --filter @glasshouse/server build` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "feat(server): company sign-in through Authelia (OIDC with PKCE)"
```

---

### Task 5: Roles on every change, stamped names, admin API, CLI

**Files:**
- Create: `apps/server/src/permissions.ts`, `apps/server/src/permissions.test.ts`, `apps/server/src/http/admin.ts`, `apps/server/src/http/admin.test.ts`, `apps/server/src/cli.ts`, `apps/server/src/cli.test.ts`
- Modify: `apps/server/src/workspaceService.ts`, `apps/server/src/workspaceService.test.ts`, `apps/server/src/main.ts`, `apps/server/build.mjs`, `apps/server/package.json`

**Interfaces:**
- Consumes: Task 1 (`byId`, `forbidden`), Task 2 store, Task 3 `Actor`/`buildApp` `admin` dep.
- Produces:
  - `requiredRole(command: WorkspaceCommand): Role`, `stampCommand(command: WorkspaceCommand, actor: { id: string; name: string }, at: string): WorkspaceCommand`, `ROLE_LABEL: Record<Role, string>`
  - `WorkspaceService` refuses an actor below `requiredRole` with code `forbidden`; when `actor.verified`, logs and applies the stamped command; clock from `OpenOptions.now`.
  - `registerAdmin(api, deps: { store: IdentityStore; localLogin: boolean; now: () => Date })` — HTTP (admin role only, else 403 `forbidden`): `GET /api/admin/users` → `AdminUser[]`; `POST /api/admin/users {email, displayName, role}` → `201 { user, temporaryPassword }`; `PATCH /api/admin/users/:id {role?, active?, displayName?}` → `200 AdminUser`; `POST /api/admin/users/:id/reset-password` → `200 { temporaryPassword }`. `AdminUser = { id, email, displayName, role, source, active, mustChangePassword, createdAt, lastLoginAt }` (never the hash).
  - `runCli(args: string[], store: IdentityStore, print: (line: string) => void, now?: () => Date): Promise<number>` (exit code); bundled as `dist/cli.js`: `node dist/cli.js create-admin <email> "<Name>"`, `node dist/cli.js reset-password <email>`.

- [ ] **Step 1: Write the failing tests**

`apps/server/src/permissions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { WorkspaceCommand } from '@glasshouse/domain';
import { requiredRole, stampCommand } from './permissions';

const review = (command: object) => ({ type: 'review', roomId: 'r', command }) as WorkspaceCommand;

describe('requiredRole', () => {
  it('follows the role matrix', () => {
    expect(requiredRole({ type: 'room/rename', roomId: 'r', name: 'X' })).toBe('editor');
    expect(requiredRole({ type: 'project/import', file: {} as never, resolution: {} as never })).toBe('editor');
    expect(requiredRole(review({ type: 'review/submit', designedBy: '', at: 't' }))).toBe('editor');
    expect(requiredRole(review({ type: 'note/add', id: 'n', text: 'x', at: 't' }))).toBe('editor');
    expect(requiredRole(review({ type: 'review/approve', reviewer: 'x', at: 't' }))).toBe('reviewer');
    expect(requiredRole(review({ type: 'review/acknowledge', reservedRangeId: 'x', reason: 'y', by: 'z', at: 't' }))).toBe('reviewer');
    expect(requiredRole({ type: 'template/delete', id: 't' })).toBe('admin');
    expect(requiredRole({ type: 'catalog/import', templates: [] })).toBe('admin');
    expect(requiredRole({ type: 'project/delete', projectId: 'p' })).toBe('admin');
  });
});

describe('stampCommand', () => {
  const me = { id: 'u-nok', name: 'Nok P.' };
  it('writes the signed-in person and the server time over whatever the browser sent', () => {
    expect(stampCommand(review({ type: 'review/approve', reviewer: 'Someone Else', at: 'client', byId: 'spoof' }), me, 'server')).toEqual(review({ type: 'review/approve', reviewer: 'Nok P.', at: 'server', byId: 'u-nok' }));
    expect(stampCommand(review({ type: 'note/add', id: 'n', text: 'x', at: 'client' }), me, 'server')).toEqual(review({ type: 'note/add', id: 'n', text: 'x', at: 'server', by: 'Nok P.', byId: 'u-nok' }));
    expect(stampCommand(review({ type: 'review/new-draft', at: 'client' }), me, 'server')).toEqual(review({ type: 'review/new-draft', at: 'server' }));
  });
  it('leaves other commands untouched', () => {
    const c: WorkspaceCommand = { type: 'room/rename', roomId: 'r', name: 'X' };
    expect(stampCommand(c, me, 'server')).toBe(c);
  });
});
```

Append to `apps/server/src/workspaceService.test.ts`:
```ts
describe('roles and stamped names', () => {
  const NOW = '2026-10-18T09:00:00.000Z';
  const viewer = { id: 'u-v', name: 'Vee', role: 'viewer' as const, verified: true };
  const editor = { id: 'u-e', name: 'Eddie', role: 'editor' as const, verified: true };
  const reviewer = { id: 'u-r', name: 'Rae', role: 'reviewer' as const, verified: true };
  const open = () => WorkspaceService.open(new MemoryCommandStore(), { now: () => NOW });
  const go = (svc: WorkspaceService, actor: typeof editor | typeof viewer | typeof reviewer, id: string, command: WorkspaceCommand) => svc.submit({ clientId: actor.id, commandId: id, command }, actor);

  it('refuses a change above the actor’s role, with a clear reason', async () => {
    const svc = await open();
    expect(await go(svc, viewer, '1', { type: 'project/create', id: 'p', name: 'P' })).toMatchObject({ kind: 'rejected', error: { code: 'forbidden', message: expect.stringMatching(/Viewer/) } });
    expect(await go(svc, editor, '2', { type: 'project/create', id: 'p', name: 'P' })).toMatchObject({ kind: 'accepted' });
    expect(await go(svc, editor, '3', { type: 'project/delete', projectId: 'p' })).toMatchObject({ kind: 'rejected', error: { code: 'forbidden' } });
  });

  it('a reviewer can’t approve their own submission, whatever name they send', async () => {
    const svc = await open();
    for (const [i, c] of readyRoomCommands().entries()) await go(svc, reviewer, `s${i}`, c);
    await go(svc, reviewer, 'sub', { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: 'Not Me', at: 'x' } });
    const own = await go(svc, reviewer, 'app', { type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: 'Someone Else', at: 'x', byId: 'u-other' } });
    expect(own).toMatchObject({ kind: 'rejected', error: { code: 'forbidden' } });
    const logged = (await svc.commandsAfter(0, 100)).find((e) => e.commandId === 'sub')!;
    expect(logged.command).toMatchObject({ command: { designedBy: 'Rae', byId: 'u-r', at: NOW } });
  });

  it('stamps nothing for the dev stand-in', async () => {
    const svc = await open();
    const dev = { id: 'dev:Dev', name: 'Dev', role: 'admin' as const, verified: false };
    await go(svc, dev as never, '1', { type: 'project/create', id: 'p', name: 'P' });
    expect((await svc.commandsAfter(0, 1))[0]!.command).toEqual({ type: 'project/create', id: 'p', name: 'P' });
  });
});
```
with this helper at the top of that test file (the same state as `ready()` in `packages/domain/src/commands/review.test.ts`):
```ts
import { createObject, createWorkspace, type Rack, type Template } from '@glasshouse/domain';

/** Room "r" ready for approval: one rack with one 2U server of known demand. */
function readyRoomCommands(): WorkspaceCommand[] {
  const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' };
  const template = createWorkspace().catalog.find((t) => t.id === 'tpl-server-2u') as Template;
  return [
    { type: 'project/create', id: 'p', name: 'P' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' },
    { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template } },
  ];
}
```

`apps/server/src/http/admin.test.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryIdentityStore } from '../identity/memoryIdentityStore';
import type { Role, User } from '../identity/types';
import { MemoryCommandStore } from '../store/memoryStore';
import { WorkspaceService } from '../workspaceService';
import { registerAdmin } from './admin';
import { buildApp } from './app';
import { registerDevAuthRoutes } from './devAuth';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
const NOW = '2026-10-18T09:00:00.000Z';
const user = (id: string, role: Role, over: Partial<User> = {}): User => ({ id, email: `${id}@company.test`, displayName: id, role, source: 'local', oidcSubject: null, passwordHash: 'x', mustChangePassword: false, active: true, createdAt: NOW, lastLoginAt: null, ...over });

async function setup(as: User, others: User[] = []) {
  const store = new MemoryIdentityStore();
  for (const u of [as, ...others]) await store.createUser(u);
  const service = await WorkspaceService.open(new MemoryCommandStore());
  const app = await buildApp({
    service, publicOrigin: null, authRoutes: registerDevAuthRoutes,
    authenticate: async () => { const u = await store.findUserById(as.id); return u && u.active ? { id: u.id, name: u.displayName, role: u.role, verified: true } : null; },
    admin: (api) => registerAdmin(api, { store, localLogin: true, now: () => new Date(NOW) }),
  });
  apps.push(app);
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url, headers: { 'x-glasshouse': '1' }, ...(payload ? { payload } : {}) });
  return { app, store, call };
}

describe('admin users API', () => {
  it('is for admins only', async () => {
    const { call } = await setup(user('ed', 'editor'));
    expect((await call('GET', '/api/admin/users')).statusCode).toBe(403);
  });

  it('lists users without password hashes and creates a local user with a one-time password', async () => {
    const { call, store } = await setup(user('ad', 'admin'));
    const created = await call('POST', '/api/admin/users', { email: 'new@company.test', displayName: 'New Person', role: 'editor' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ user: { email: 'new@company.test', role: 'editor', source: 'local', mustChangePassword: true }, temporaryPassword: expect.any(String) });
    expect(JSON.stringify((await call('GET', '/api/admin/users')).json())).not.toMatch(/passwordHash|scrypt/);
    expect((await store.findUserByEmail('new@company.test'))?.mustChangePassword).toBe(true);
    expect((await call('POST', '/api/admin/users', { email: 'NEW@company.test', displayName: 'Dup', role: 'viewer' })).statusCode).toBe(409);
  });

  it('switching a user off ends their sessions', async () => {
    const { call, store } = await setup(user('ad', 'admin'), [user('ed', 'editor')]);
    await store.createSession({ tokenHash: 'h', userId: 'ed', createdAt: NOW, lastSeenAt: NOW, expiresAt: '2026-10-25T00:00:00.000Z' });
    expect((await call('PATCH', '/api/admin/users/ed', { active: false })).json()).toMatchObject({ active: false });
    expect(await store.findSession('h')).toBeNull();
  });

  it('never leaves the workspace without an admin', async () => {
    const { call } = await setup(user('ad', 'admin'), [user('ad2', 'admin', { active: false })]);
    expect((await call('PATCH', '/api/admin/users/ad', { role: 'editor' })).statusCode).toBe(409);
    expect((await call('PATCH', '/api/admin/users/ad', { active: false })).statusCode).toBe(409);
  });

  it('resets a local password and refuses it for an SSO user', async () => {
    const { call, store } = await setup(user('ad', 'admin'), [user('ed', 'editor'), user('sso', 'viewer', { source: 'oidc', passwordHash: null, oidcSubject: 's' })]);
    const r = await call('POST', '/api/admin/users/ed/reset-password');
    expect(r.json()).toEqual({ temporaryPassword: expect.any(String) });
    expect((await store.findUserById('ed'))?.mustChangePassword).toBe(true);
    expect((await call('POST', '/api/admin/users/sso/reset-password')).statusCode).toBe(400);
  });
});
```

`apps/server/src/cli.test.ts`:
```ts
import { expect, it } from 'vitest';
import { runCli } from './cli';
import { MemoryIdentityStore } from './identity/memoryIdentityStore';
import { verifyPassword } from './identity/passwords';

it('creates the first admin and resets a password, printing the one-time password', async () => {
  const store = new MemoryIdentityStore();
  const out: string[] = [];
  expect(await runCli(['create-admin', 'few@company.test', 'Few N.'], store, (l) => out.push(l))).toBe(0);
  const temp = out.join('\n').match(/Temporary password: (\S+)/)![1]!;
  const few = await store.findUserByEmail('few@company.test');
  expect(few).toMatchObject({ role: 'admin', source: 'local', mustChangePassword: true });
  expect(await verifyPassword(temp, few!.passwordHash!)).toBe(true);
  expect(await runCli(['reset-password', 'few@company.test'], store, (l) => out.push(l))).toBe(0);
  expect(await runCli(['reset-password', 'nobody@company.test'], store, (l) => out.push(l))).toBe(1);
  expect(await runCli(['bogus'], store, (l) => out.push(l))).toBe(2);
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @glasshouse/server exec vitest run src/permissions.test.ts src/workspaceService.test.ts src/http/admin.test.ts src/cli.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/server/src/permissions.ts`:
```ts
import type { ReviewCommand, WorkspaceCommand } from '@glasshouse/domain';
import type { Role } from './identity/types';

export const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', editor: 'Editor', reviewer: 'Reviewer', admin: 'Admin' };

const ADMIN_ONLY = new Set<string>(['template/create', 'template/update', 'template/delete', 'catalog/seed', 'catalog/import', 'project/delete']);
const REVIEWER_ONLY = new Set<ReviewCommand['type']>(['review/approve', 'review/acknowledge', 'review/unacknowledge']);

/** The role matrix (P1 design): everything else is an editor's job. */
export function requiredRole(command: WorkspaceCommand): Role {
  if (ADMIN_ONLY.has(command.type)) return 'admin';
  if (command.type === 'review') return REVIEWER_ONLY.has(command.command.type) ? 'reviewer' : 'editor';
  return 'editor';
}

/** The signed-in person and the server's clock go on review records, whatever the browser sent. */
export function stampCommand(command: WorkspaceCommand, actor: { id: string; name: string }, at: string): WorkspaceCommand {
  if (command.type !== 'review') return command;
  const c = command.command;
  switch (c.type) {
    case 'review/submit':
      return { ...command, command: { ...c, designedBy: actor.name, byId: actor.id, at } };
    case 'review/approve':
      return { ...command, command: { ...c, reviewer: actor.name, byId: actor.id, at } };
    case 'review/acknowledge':
      return { ...command, command: { ...c, by: actor.name, byId: actor.id, at } };
    case 'note/add':
      return { ...command, command: { ...c, by: actor.name, byId: actor.id, at } };
    default:
      return { ...command, command: { ...c, at } };
  }
}
```

`apps/server/src/workspaceService.ts`:
- store `now` in the instance: add constructor param `private readonly now: () => string` passed from `open` as `options.now ?? (() => new Date().toISOString())`.
- in `submitNow`, after the `BROWSER_ONLY` check:
```ts
    const needed = requiredRole(command);
    if (!atLeast(actor.role, needed)) {
      return { kind: 'rejected', error: err('forbidden', `${ROLE_LABEL[actor.role]}s can't make this change. Ask an admin for ${ROLE_LABEL[needed]} access.`).error };
    }
    const toApply = actor.verified ? stampCommand(command, actor, this.now()) : command;
```
  then use `toApply` for `apply(...)`, the `entry.command`, and everything after (imports: `requiredRole`, `stampCommand`, `ROLE_LABEL` from `./permissions`; `atLeast` from `./identity/types`).
- Update existing tests' actor literals to the new `Actor` shape (`role: 'admin', verified: false` keeps their behaviour).

`apps/server/src/http/admin.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hashPassword, temporaryPassword } from '../identity/passwords';
import { DuplicateUserError, ROLES, type IdentityStore, type User } from '../identity/types';

const toAdminUser = ({ passwordHash: _hash, oidcSubject: _sub, ...rest }: User) => rest;
const createBody = z.object({ email: z.string().email().max(200), displayName: z.string().trim().min(1).max(80), role: z.enum(ROLES) });
const patchBody = z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional(), displayName: z.string().trim().min(1).max(80).optional() });
const refuse = (reply: FastifyReply, status: number, code: string, message: string) => reply.code(status).send({ error: { code, message, targets: [] } });

export function registerAdmin(api: FastifyInstance, { store, localLogin, now }: { store: IdentityStore; localLogin: boolean; now: () => Date }): void {
  api.register(async (admin) => {
    admin.addHook('preHandler', async (request, reply) => {
      if (request.actor?.role !== 'admin') return refuse(reply, 403, 'forbidden', 'Only admins can manage users.');
    });

    admin.get('/api/admin/users', async () => (await store.listUsers()).map(toAdminUser));

    admin.post('/api/admin/users', async (request, reply) => {
      if (!localLogin) return refuse(reply, 400, 'invalid_value', 'Sign-in with a password is switched off; people join through the company account.');
      const body = createBody.safeParse(request.body);
      if (!body.success) return refuse(reply, 400, 'invalid_value', 'Give an email, a name and a role.');
      const temp = temporaryPassword();
      const user: User = {
        id: randomUUID(), email: body.data.email, displayName: body.data.displayName, role: body.data.role, source: 'local', oidcSubject: null,
        passwordHash: await hashPassword(temp), mustChangePassword: true, active: true, createdAt: now().toISOString(), lastLoginAt: null,
      };
      try {
        await store.createUser(user);
      } catch (e) {
        if (e instanceof DuplicateUserError) return refuse(reply, 409, 'invalid_value', 'Someone with this email already has an account.');
        throw e;
      }
      return reply.code(201).send({ user: toAdminUser(user), temporaryPassword: temp });
    });

    admin.patch('/api/admin/users/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = patchBody.safeParse(request.body);
      if (!body.success) return refuse(reply, 400, 'invalid_value', 'Nothing to change.');
      const target = await store.findUserById(id);
      if (!target) return refuse(reply, 404, 'not_found', 'That user no longer exists.');
      const losesAdmin = target.role === 'admin' && target.active && ((body.data.role !== undefined && body.data.role !== 'admin') || body.data.active === false);
      if (id === request.actor!.id && (losesAdmin || body.data.active === false)) return refuse(reply, 409, 'invalid_value', 'You can’t remove your own admin access or switch yourself off. Ask another admin.');
      if (losesAdmin && (await store.countActiveAdmins()) <= 1) return refuse(reply, 409, 'invalid_value', 'This is the last admin. Make someone else an admin first.');
      const updated = await store.updateUser(id, body.data);
      if (body.data.active === false) await store.deleteUserSessions(id);
      return updated ? toAdminUser(updated) : refuse(reply, 404, 'not_found', 'That user no longer exists.');
    });

    admin.post('/api/admin/users/:id/reset-password', async (request, reply) => {
      const { id } = request.params as { id: string };
      const target = await store.findUserById(id);
      if (!target) return refuse(reply, 404, 'not_found', 'That user no longer exists.');
      if (target.source !== 'local') return refuse(reply, 400, 'invalid_value', 'This person signs in with the company account; reset it there.');
      const temp = temporaryPassword();
      await store.updateUser(id, { passwordHash: await hashPassword(temp), mustChangePassword: true });
      await store.deleteUserSessions(id);
      return { temporaryPassword: temp };
    });
  });
}
```

`apps/server/src/cli.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { hashPassword, temporaryPassword } from './identity/passwords';
import { PgIdentityStore } from './identity/pgIdentityStore';
import type { IdentityStore } from './identity/types';

const USAGE = 'Usage: node dist/cli.js create-admin <email> "<Display Name>" | reset-password <email>';

/** Exit codes: 0 done, 1 refused, 2 usage. The one-time password is printed once and never stored in clear. */
export async function runCli(args: string[], store: IdentityStore, print: (line: string) => void, now: () => Date = () => new Date()): Promise<number> {
  const [cmd, email, ...nameParts] = args;
  if (cmd === 'create-admin' && email && nameParts.length > 0) {
    if (await store.findUserByEmail(email)) {
      print(`A user with ${email} already exists.`);
      return 1;
    }
    const temp = temporaryPassword();
    await store.createUser({
      id: randomUUID(), email, displayName: nameParts.join(' ').trim(), role: 'admin', source: 'local', oidcSubject: null,
      passwordHash: await hashPassword(temp), mustChangePassword: true, active: true, createdAt: now().toISOString(), lastLoginAt: null,
    });
    print(`Created admin ${email}.`);
    print(`Temporary password: ${temp}`);
    print('They change it at first sign-in.');
    return 0;
  }
  if (cmd === 'reset-password' && email) {
    const user = await store.findUserByEmail(email);
    if (!user || user.source !== 'local') {
      print(`No local account for ${email}.`);
      return 1;
    }
    const temp = temporaryPassword();
    await store.updateUser(user.id, { passwordHash: await hashPassword(temp), mustChangePassword: true });
    await store.deleteUserSessions(user.id);
    print(`Temporary password: ${temp}`);
    return 0;
  }
  print(USAGE);
  return 2;
}

const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required.');
    process.exit(2);
  }
  const store = await PgIdentityStore.connect(url);
  const code = await runCli(process.argv.slice(2), store, (l) => console.log(l));
  await store.close();
  process.exit(code);
}
```

`apps/server/build.mjs` — bundle both entries: replace `entryPoints: ['src/main.ts'], outfile: 'dist/main.js',` with `entryPoints: ['src/main.ts', 'src/cli.ts'], outdir: 'dist',`. `package.json` scripts add `"cli": "node dist/cli.js"`.

`apps/server/src/main.ts` — pass `admin: (api) => registerAdmin(api, { store: idStore, localLogin: auth.localLogin, now: () => new Date() })` in the `on` branch.

- [ ] **Step 4: Run tests** — `pnpm --filter @glasshouse/server test && pnpm --filter @glasshouse/server typecheck && pnpm --filter @glasshouse/server build` and check `apps/server/dist/cli.js` exists. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): role checks and stamped names on every change; admin users API and CLI"
```

---

### Task 6: Web sign-in, user menu, sessions that end mid-edit

**Files:**
- Create: `apps/web/src/auth/authApi.ts`, `authStore.ts`, `authStore.test.ts`, `SignInScreen.tsx`, `SignInScreen.test.tsx`, `ChangePasswordScreen.tsx`, `ChangePasswordScreen.test.tsx`, `UserMenu.tsx`, `auth.css`, `apps/web/src/sync/pendingStash.ts`, `pendingStash.test.ts`
- Modify: `apps/web/src/sync/httpTransport.ts`, `syncClient.ts`, `syncClient.test.ts`, `syncEngine.ts`, `serverMode.ts`, `serverMode.test.ts`, `apps/web/src/app/App.tsx`, `apps/web/src/app/TitleBlock.tsx`, `apps/web/src/i18n/en.ts`, `th.ts`, `apps/web/vite.config.ts` (proxy `/auth`)

**Interfaces:**
- Consumes: server HTTP from Tasks 3–5.
- Produces:
  - `authApi`: `getAuthConfig(): Promise<AuthConfig>` (`{ mode: 'dev' } | { mode: 'on'; localLogin: boolean; sso: boolean }`), `getMe(): Promise<AuthUser | null>` (`AuthUser = { id; name; email; role: Role; mustChangePassword: boolean }`, null on 401), `login(email, password): Promise<{ mustChangePassword: boolean }>` (throws `Error` with the server message), `changePassword(current, next): Promise<void>`, `logout(): Promise<void>`, `ssoUrl(returnTo: string): string`; `type Role = 'viewer' | 'editor' | 'reviewer' | 'admin'`; `class AuthError extends Error { code: 'unauthorised' | 'password_change_required' }`.
  - `useAuthStore`: `{ status: 'unknown' | 'dev' | 'signed-out' | 'must-change' | 'signed-in'; config: AuthConfig | null; user: AuthUser | null; sessionEnded: boolean; init(): Promise<void>; signedOut(sessionEnded: boolean): void }` and `resetAuthStore()`.
  - `httpTransport` throws `AuthError` on 401 and on 403 `password_change_required` (any request, including `fetchWorkspace`).
  - `SyncCallbacks.onAuthLost(): void`; `SyncClient.clientId` getter; `SyncClient.pendingCommands(): { commandId: string; command: WorkspaceCommand }[]`; `SyncEngine.pendingList()`.
  - `pendingStash`: `saveStash(entry: { userId: string; clientId: string; commands: {commandId, command}[] }): void`, `takeStash(userId: string, now?: number): { clientId; commands } | null` (sessionStorage key `glasshouse:unsent`, max age 24 h).
  - `startServerSync(transport?, isCancelled?, me?: AuthUser | null)` posts a stash for `me.id` with its original `clientId` before loading the workspace; on `onAuthLost` it saves the stash and calls `useAuthStore.getState().signedOut(true)`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/sync/pendingStash.test.ts`:
```ts
import { beforeEach, expect, it } from 'vitest';
import { saveStash, takeStash } from './pendingStash';

beforeEach(() => sessionStorage.clear());
const commands = [{ commandId: 'c1', command: { type: 'project/create' as const, id: 'p', name: 'P' } }];

it('gives unsent edits back once, to the same user, while fresh', () => {
  saveStash({ userId: 'u1', clientId: 'tab-1', commands });
  expect(takeStash('u2')).toBeNull();
  expect(takeStash('u1')).toEqual({ clientId: 'tab-1', commands });
  expect(takeStash('u1')).toBeNull();
});

it('drops a stash older than a day or that is unreadable', () => {
  saveStash({ userId: 'u1', clientId: 'tab-1', commands });
  expect(takeStash('u1', Date.now() + 25 * 60 * 60 * 1000)).toBeNull();
  sessionStorage.setItem('glasshouse:unsent', '{nope');
  expect(takeStash('u1')).toBeNull();
});
```

Append to `apps/web/src/sync/syncClient.test.ts`:
```ts
it('stops and reports when the session ends, keeping the unsent edit', async () => {
  const server = fakeServer();
  (server.transport.postCommands as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new AuthError('unauthorised', 'Sign in to use Glasshouse.'));
  const cb = { ...callbacks(), onAuthLost: vi.fn() };
  const client = new SyncClient(server.transport, { seq: 0, workspace: createWorkspace() }, cb, { clientId: 'me', newId: () => '1' });
  client.start();
  client.dispatch(create('p', 'Riverside'));
  await client.flush();
  expect(cb.onAuthLost).toHaveBeenCalledTimes(1);
  expect(server.posts).toEqual([['1']]);
  expect(client.pendingCommands().map((c) => c.commandId)).toEqual(['1']);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(server.posts).toEqual([['1']]);
});
```
(import `AuthError` from `../auth/authApi`; `callbacks()` gains `onAuthLost: vi.fn()` — update the helper so every existing test passes it.)

Append to `apps/web/src/sync/serverMode.test.ts`:
```ts
it('keeps unsent edits across a sign-in: sends them first, with the old tab id, then loads', async () => {
  saveStash({ userId: 'u1', clientId: 'old-tab', commands: [{ commandId: 'c9', command: { type: 'project/create', id: 'p', name: 'Kept' } }] });
  const order: string[] = [];
  const t = transport({
    postCommands: vi.fn(async (clientId, commands) => { order.push(`post:${clientId}:${commands.map((c) => c.commandId).join(',')}`); return { accepted: commands.map((c, i) => ({ commandId: c.commandId, seq: i + 1 })), rejected: null, skipped: [] }; }),
    fetchWorkspace: vi.fn(async () => { order.push('fetch'); return { seq: 1, workspace: createWorkspace() }; }),
  });
  const stop = await startServerSync(t, () => false, { id: 'u1', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: false });
  expect(order.slice(0, 2)).toEqual(['post:old-tab:c9', 'fetch']);
  stop();
});
```
(import `saveStash` from `./pendingStash`; `sessionStorage.clear()` in the file's `beforeEach`.)

`apps/web/src/auth/authStore.test.ts`:
```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from './authStore';

const respond = (routes: Record<string, [number, unknown]>) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const [status, body] = routes[String(input)] ?? [404, {}];
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });

beforeEach(() => resetAuthStore());
afterEach(() => vi.restoreAllMocks());

it('knows dev mode, signed-out, must-change and signed-in', async () => {
  respond({ '/auth/config': [200, { mode: 'dev' }] });
  await useAuthStore.getState().init();
  expect(useAuthStore.getState().status).toBe('dev');

  vi.restoreAllMocks();
  respond({ '/auth/config': [200, { mode: 'on', localLogin: true, sso: true }], '/auth/me': [401, { error: { code: 'unauthorised' } }] });
  await useAuthStore.getState().init();
  expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', config: { sso: true } });

  vi.restoreAllMocks();
  respond({ '/auth/config': [200, { mode: 'on', localLogin: true, sso: false }], '/auth/me': [200, { id: 'u1', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: true }] });
  await useAuthStore.getState().init();
  expect(useAuthStore.getState().status).toBe('must-change');
});
```

`apps/web/src/auth/SignInScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from './authStore';
import { SignInScreen } from './SignInScreen';

beforeEach(() => resetAuthStore());
afterEach(() => vi.restoreAllMocks());

it('offers the company sign-in and the password form the server allows', () => {
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: true, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('link', { name: 'Sign in with your company account' })).toHaveAttribute('href', expect.stringMatching(/^\/auth\/oidc\/start\?returnTo=/));
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
});

it('shows the server’s reason when a password sign-in fails, and why the session ended', async () => {
  useAuthStore.setState({ status: 'signed-out', sessionEnded: true, config: { mode: 'on', localLogin: true, sso: false } });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'That email and password don’t match an account.' } }), { status: 401 }));
  render(<SignInScreen />);
  expect(screen.getByText(/Your session ended/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Email'), 'p@company.test');
  await userEvent.type(screen.getByLabelText('Password'), 'wrong-password-1');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('don’t match');
});

it('shows a company sign-in refusal passed back in the URL', () => {
  window.history.replaceState(null, '', '/?signin_error=Your%20Glasshouse%20account%20is%20switched%20off.');
  useAuthStore.setState({ status: 'signed-out', config: { mode: 'on', localLogin: false, sso: true } });
  render(<SignInScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent('switched off');
  window.history.replaceState(null, '', '/');
});
```

`apps/web/src/auth/ChangePasswordScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { ChangePasswordScreen } from './ChangePasswordScreen';

afterEach(() => vi.restoreAllMocks());

it('checks the new password matches, then changes it and signs in', async () => {
  const init = vi.spyOn(useAuthStore.getState(), 'init').mockResolvedValue();
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  render(<ChangePasswordScreen />);
  await userEvent.type(screen.getByLabelText('Temporary password'), 'temp-password-1');
  await userEvent.type(screen.getByLabelText('New password'), 'a-new-long-password');
  await userEvent.type(screen.getByLabelText('New password again'), 'a-different-one!');
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(screen.getByRole('alert')).toHaveTextContent('don’t match');
  expect(fetchSpy).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText('New password again'));
  await userEvent.type(screen.getByLabelText('New password again'), 'a-new-long-password');
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(fetchSpy).toHaveBeenCalledWith('/auth/password', expect.objectContaining({ method: 'POST' }));
  expect(init).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @glasshouse/web exec vitest run src/auth src/sync` — Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/auth/authApi.ts`:
```ts
export type Role = 'viewer' | 'editor' | 'reviewer' | 'admin';
export type AuthConfig = { mode: 'dev' } | { mode: 'on'; localLogin: boolean; sso: boolean };
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

/** The server says the session is gone (or must change its password): the sync client stops and keeps its edits. */
export class AuthError extends Error {
  constructor(
    readonly code: 'unauthorised' | 'password_change_required',
    message: string,
  ) {
    super(message);
  }
}

const JSON_HEADERS = { 'content-type': 'application/json', 'x-glasshouse': '1' };
const messageOf = async (res: Response, fallback: string): Promise<string> => {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
};

export async function getAuthConfig(): Promise<AuthConfig> {
  const res = await fetch('/auth/config');
  if (!res.ok) throw new Error(`The Glasshouse server answered ${res.status}`);
  return (await res.json()) as AuthConfig;
}

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch('/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`The Glasshouse server answered ${res.status}`);
  return (await res.json()) as AuthUser;
}

export async function login(email: string, password: string): Promise<{ mustChangePassword: boolean }> {
  const res = await fetch('/auth/login', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(await messageOf(res, 'Sign-in failed. Try again.'));
  return (await res.json()) as { mustChangePassword: boolean };
}

export async function changePassword(current: string, next: string): Promise<void> {
  const res = await fetch('/auth/password', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ current, next }) });
  if (!res.ok) throw new Error(await messageOf(res, 'The password could not be changed.'));
}

export async function logout(): Promise<void> {
  const res = await fetch('/auth/logout', { method: 'POST', headers: { 'x-glasshouse': '1' } });
  if (!res.ok && res.status !== 401) throw new Error(await messageOf(res, 'Sign-out failed.'));
}

export const ssoUrl = (returnTo: string): string => `/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}`;
```

`apps/web/src/auth/authStore.ts`:
```ts
import { create } from 'zustand';
import { getAuthConfig, getMe, type AuthConfig, type AuthUser } from './authApi';

type Status = 'unknown' | 'dev' | 'signed-out' | 'must-change' | 'signed-in';

interface AuthState {
  status: Status;
  config: AuthConfig | null;
  user: AuthUser | null;
  /** The server ended the session while the app was open: the sign-in screen says so. */
  sessionEnded: boolean;
  error: string | null;
  init: () => Promise<void>;
  signedOut: (sessionEnded: boolean) => void;
}

const initial = { status: 'unknown' as Status, config: null, user: null, sessionEnded: false, error: null };

export const useAuthStore = create<AuthState>()((set) => ({
  ...initial,
  init: async () => {
    try {
      const config = await getAuthConfig();
      if (config.mode === 'dev') return set({ status: 'dev', config, user: null, error: null });
      const user = await getMe();
      set({ config, user, error: null, status: user === null ? 'signed-out' : user.mustChangePassword ? 'must-change' : 'signed-in' });
    } catch (e) {
      set({ status: 'signed-out', error: e instanceof Error ? e.message : String(e) });
    }
  },
  signedOut: (sessionEnded) => set({ status: 'signed-out', user: null, sessionEnded }),
}));

export const resetAuthStore = (): void => useAuthStore.setState({ ...initial });
```

`apps/web/src/sync/pendingStash.ts`:
```ts
import type { WorkspaceCommand } from '@glasshouse/domain';

const KEY = 'glasshouse:unsent';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Stash {
  userId: string;
  clientId: string;
  commands: { commandId: string; command: WorkspaceCommand }[];
  savedAt: number;
}

/** Edits the server hadn't confirmed when the session ended, kept for this tab until the same person signs in. */
export function saveStash(entry: Omit<Stash, 'savedAt'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...entry, savedAt: Date.now() }));
  } catch (e) {
    console.error('Glasshouse could not keep unsent edits for after sign-in', e);
  }
}

export function takeStash(userId: string, now = Date.now()): { clientId: string; commands: Stash['commands'] } | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Stash;
    if (s.userId !== userId || now - s.savedAt > MAX_AGE_MS || !Array.isArray(s.commands)) return null;
    return { clientId: s.clientId, commands: s.commands };
  } catch {
    return null;
  }
}
```

`apps/web/src/sync/httpTransport.ts` — add a helper and use it in `fetchWorkspace` (before the `!res.ok` check) and `postCommands` (before the `>= 500` check):
```ts
import { AuthError } from '../auth/authApi';
…
async function authFailure(res: Response): Promise<AuthError | null> {
  if (res.status === 401) return new AuthError('unauthorised', 'Your session has ended.');
  if (res.status === 403) {
    const body = (await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === 'password_change_required') return new AuthError('password_change_required', 'Change your temporary password first.');
  }
  return null;
}
```
`const auth = await authFailure(res); if (auth) throw auth;`

`apps/web/src/sync/syncEngine.ts` — add:
```ts
  /** Every edit the server hasn't confirmed yet, oldest first (kept across a sign-in). */
  pendingList(): { commandId: string; command: WorkspaceCommand }[] {
    return this.pending.map(({ commandId, command }) => ({ commandId, command }));
  }
```

`apps/web/src/sync/syncClient.ts`:
- `SyncCallbacks` gains `onAuthLost(): void;`
- add `get clientId(): string` (rename the private field to `id` if needed) and `pendingCommands() { return this.engine.pendingList(); }`
- add a private `authLost = false`; in `sendAll`'s catch: if `e instanceof AuthError` → `this.engine.markUnsent(batch.map((b) => b.commandId)); this.authLost = true; this.stop(); this.callbacks.onAuthLost(); return;` (before the generic retry branch). In `resync`'s catch: same check → `this.stop(); this.callbacks.onAuthLost(); return;`.
- `dispatch` and `flush` do nothing to the network while `authLost` (edits still apply locally and queue).

`apps/web/src/sync/serverMode.ts`:
- signature `startServerSync(transport = httpTransport(), isCancelled = () => false, me: AuthUser | null = null)`.
- before `fetchWorkspace`:
```ts
  if (me) {
    const stash = takeStash(me.id);
    if (stash && stash.commands.length > 0) {
      try {
        const outcome = await transport.postCommands(stash.clientId, stash.commands);
        if (outcome.rejected) store.setNotice(outcome.rejected.error.message);
      } catch (e) {
        // Couldn't send them: keep them for the next try rather than lose them.
        saveStash({ userId: me.id, clientId: stash.clientId, commands: stash.commands });
        store.setNotice(`Some changes from before you signed in aren't sent yet: ${describe(e)}`);
      }
    }
  }
```
- `onAuthLost: () => { if (me) saveStash({ userId: me.id, clientId: client.clientId, commands: client.pendingCommands() }); unloadGuard.set(false); useAuthStore.getState().signedOut(true); }`.

`apps/web/src/auth/SignInScreen.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { GlasshouseMark } from '../ui/icons';
import { login, ssoUrl } from './authApi';
import { useAuthStore } from './authStore';
import './auth.css';

export function SignInScreen() {
  const m = useT();
  const config = useAuthStore((s) => s.config);
  const sessionEnded = useAuthStore((s) => s.sessionEnded);
  const init = useAuthStore((s) => s.init);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).get('signin_error'));
  const here = `${window.location.pathname}${window.location.search.replace(/[?&]signin_error=[^&]*/, '')}` || '/';
  const sso = config?.mode === 'on' && config.sso;
  const local = config?.mode === 'on' && config.localLogin;
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      await init();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="signin" aria-labelledby="signin-h">
      <div className="signin__card glass">
        <header className="signin__head">
          <GlasshouseMark />
          <h1 id="signin-h">{m.auth.title}</h1>
          <LanguageSwitch />
        </header>
        {sessionEnded ? <p className="signin__note">{m.auth.sessionEnded}</p> : null}
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
        {sso ? (
          <a className="btn btn--ink signin__sso" href={ssoUrl(here)}>
            {m.auth.sso}
          </a>
        ) : null}
        {sso && local ? <p className="signin__or">{m.auth.or}</p> : null}
        {local ? (
          <form className="review-form" onSubmit={(e) => void submit(e)}>
            <div className="field">
              <label htmlFor="signin-email" className="field__label">{m.auth.email}</label>
              <div className="field__box"><input id="signin-email" className="field__input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            </div>
            <div className="field">
              <label htmlFor="signin-password" className="field__label">{m.auth.password}</label>
              <div className="field__box"><input id="signin-password" className="field__input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            </div>
            <button type="submit" className="btn" disabled={busy}>{m.auth.signIn}</button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
```

`apps/web/src/auth/ChangePasswordScreen.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { changePassword } from './authApi';
import { useAuthStore } from './authStore';
import './auth.css';

export function ChangePasswordScreen() {
  const m = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (next !== again) return setError(m.auth.mismatch);
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      await useAuthStore.getState().init();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const field = (id: string, label: string, value: string, set: (v: string) => void, complete: string) => (
    <div className="field">
      <label htmlFor={id} className="field__label">{label}</label>
      <div className="field__box"><input id={id} className="field__input" type="password" autoComplete={complete} value={value} onChange={(e) => set(e.target.value)} required /></div>
    </div>
  );
  return (
    <main className="signin" aria-labelledby="pw-h">
      <form className="signin__card glass review-form" onSubmit={(e) => void submit(e)}>
        <h1 id="pw-h">{m.auth.changeTitle}</h1>
        <p className="signin__note">{m.auth.changeNote}</p>
        {error ? <p role="alert" className="field__error">{error}</p> : null}
        {field('pw-current', m.auth.temporary, current, setCurrent, 'current-password')}
        {field('pw-next', m.auth.newPassword, next, setNext, 'new-password')}
        {field('pw-again', m.auth.newAgain, again, setAgain, 'new-password')}
        <button type="submit" className="btn btn--ink" disabled={busy}>{m.auth.change}</button>
      </form>
    </main>
  );
}
```

`apps/web/src/auth/UserMenu.tsx`:
```tsx
import { useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { logout } from './authApi';
import { useAuthStore } from './authStore';

/** The user corner of the title block (server mode with sign-in): who you are, your role, Users for admins, sign out. */
export function UserMenu() {
  const m = useT();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const signOut = async (): Promise<void> => {
    try {
      await logout();
      useAuthStore.getState().signedOut(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <span className="user-menu">
      <button type="button" className="btn btn--sm" aria-label={m.auth.menu(user.name)} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <span className="user-menu__name">{user.name}</span>
      </button>
      {open ? (
        <span className="user-menu__panel glass" role="menu">
          <span className="user-menu__who">{user.email}</span>
          <span className="user-menu__role">{m.auth.role[user.role]}</span>
          {user.role === 'admin' ? <Link role="menuitem" to="/admin/users" className="btn btn--sm btn--quiet" onClick={() => setOpen(false)}>{m.auth.users}</Link> : null}
          <button type="button" role="menuitem" className="btn btn--sm btn--quiet" onClick={() => void signOut()}>{m.auth.signOut}</button>
          {error ? <span role="alert" className="field__error">{error}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
```
`apps/web/src/auth/auth.css`: style `.signin` (full-height centred glass card over the grid ground, max-width 420 px, 16 px gutters on phones), `.signin__head` (mark, title, language switch in one row), `.signin__sso` (full-width primary), `.signin__or` (small divider text), `.user-menu` (relative), `.user-menu__panel` (absolute, right-aligned under the button, column of items, z-index above the title block), `.user-menu__role` (stamp-like small caps). Use the existing tokens (`--ink`, `--ink-2`, `--line`, `--radius-control`, `--shadow-float`); no new colours.

`apps/web/src/app/App.tsx` — server mode waits for sign-in:
```tsx
import { useAuthStore } from '../auth/authStore';
import { SignInScreen } from '../auth/SignInScreen';
import { ChangePasswordScreen } from '../auth/ChangePasswordScreen';
…
  const authStatus = useAuthStore((s) => s.status);
  const me = useAuthStore((s) => s.user);
  useEffect(() => {
    if (SERVER_MODE) void useAuthStore.getState().init();
  }, []);
  useEffect(() => {
    if (SERVER_MODE) {
      if (authStatus !== 'dev' && authStatus !== 'signed-in') return;
      let stop: (() => void) | null = null;
      let cancelled = false;
      void startServerSync(undefined, () => cancelled, me).then((s) => (cancelled ? s() : (stop = s)));
      return () => {
        cancelled = true;
        stop?.();
      };
    }
    …local mode unchanged…
  }, [repository, authStatus, me]);

  if (SERVER_MODE && authStatus === 'unknown') return <p className="app-loading" role="status">{messagesFor(useLangStore.getState().lang).shell.opening}</p>;
  if (SERVER_MODE && authStatus === 'signed-out') return <SignInScreen />;
  if (SERVER_MODE && authStatus === 'must-change') return <ChangePasswordScreen />;
  …existing load handling…
```
(`useWorkspaceStore`'s `load` starts as `loading`; leave it — the sync start sets it.)

`apps/web/src/app/TitleBlock.tsx` — inside `title-block__tools`, after the Catalog link: `{SERVER_MODE ? <UserMenu /> : null}`.

`apps/web/vite.config.ts` — `server.proxy` gains `'/auth': 'http://127.0.0.1:8787'`.

i18n — `en.ts` add an `auth` block:
```ts
  auth: {
    title: 'Sign in to Glasshouse',
    sso: 'Sign in with your company account',
    or: 'or',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    sessionEnded: 'Your session ended. Sign in again — changes you hadn’t sent yet will be sent then.',
    changeTitle: 'Choose your own password',
    changeNote: 'You signed in with a temporary password. Choose a new one of at least 12 characters.',
    temporary: 'Temporary password',
    newPassword: 'New password',
    newAgain: 'New password again',
    change: 'Change password',
    mismatch: 'The new passwords don’t match.',
    users: 'Users',
    signOut: 'Sign out',
    menu: (name: string) => `Account menu for ${name}`,
    role: { viewer: 'Viewer', editor: 'Editor', reviewer: 'Reviewer', admin: 'Admin' },
  },
```
`th.ts`:
```ts
  auth: {
    title: 'เข้าสู่ระบบ Glasshouse',
    sso: 'เข้าสู่ระบบด้วยบัญชีบริษัท',
    or: 'หรือ',
    email: 'อีเมล',
    password: 'รหัสผ่าน',
    signIn: 'เข้าสู่ระบบ',
    sessionEnded: 'เซสชันหมดอายุแล้ว เข้าสู่ระบบอีกครั้ง การแก้ไขที่ยังไม่ได้ส่งจะถูกส่งหลังจากนั้น',
    changeTitle: 'ตั้งรหัสผ่านของคุณเอง',
    changeNote: 'คุณเข้าสู่ระบบด้วยรหัสผ่านชั่วคราว ตั้งรหัสผ่านใหม่อย่างน้อย 12 ตัวอักษร',
    temporary: 'รหัสผ่านชั่วคราว',
    newPassword: 'รหัสผ่านใหม่',
    newAgain: 'ยืนยันรหัสผ่านใหม่',
    change: 'เปลี่ยนรหัสผ่าน',
    mismatch: 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน',
    users: 'ผู้ใช้',
    signOut: 'ออกจากระบบ',
    menu: (name) => `เมนูบัญชีของ ${name}`,
    role: { viewer: 'ผู้ดู', editor: 'ผู้แก้ไข', reviewer: 'ผู้ตรวจ', admin: 'ผู้ดูแล' },
  },
```

- [ ] **Step 4: Run tests** — `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck && pnpm --filter @glasshouse/web e2e` (local mode must be unchanged). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): sign-in, password change, user menu; unsent edits survive an ended session"
```

---

### Task 7: Role-aware screens and verified names

**Files:**
- Create: `apps/web/src/auth/useCan.ts`, `apps/web/src/auth/useCan.test.ts`, `apps/web/src/ui/person.ts`, `apps/web/src/ui/person.test.ts`
- Modify: `apps/web/src/store/workspaceStore.ts` (readOnlyReason), `apps/web/src/sync/serverMode.ts` (viewer read-only; offline restores it), `apps/web/src/app/Shell.tsx` (banner by reason), `apps/web/src/features/review/ApprovalPanel.tsx`, `UnknownsPanel.tsx`, `NotesPanel.tsx`, `HistoryPanel.tsx`, `apps/web/src/features/sheet/SheetTitleBlock.tsx`, `SheetTables.tsx`, `apps/web/src/features/catalog/CatalogScreen.tsx`, `apps/web/src/i18n/en.ts`, `th.ts` (history strings use `params.verified`), and the related component tests.

**Interfaces:**
- Consumes: Task 6 `useAuthStore`, `SERVER_MODE`; Task 1 `userId`/`byId`/`params.verified`.
- Produces:
  - `useCan(): { me: AuthUser | null; edit: boolean; review: boolean; admin: boolean; verifiedNames: boolean }` — local mode and dev mode: everything true, `verifiedNames` false; signed in: by rank.
  - `personLabel(m: Messages, p: { name: string; userId?: string }): string` — `p.name` when `userId` is set, else `m.review.unverified(p.name)`.
  - store: `readOnlyReason: 'other-tab' | 'offline' | 'view-only' | null`; `setReadOnly(readOnly: boolean, reason?: ReadOnlyReason)` (reason defaults: `true` → keeps existing reason or `'other-tab'`; `false` → `null`).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/ui/person.test.ts`:
```ts
import { expect, it } from 'vitest';
import { messagesFor } from '../i18n';
import { personLabel } from './person';

it('labels typed names unverified and signed-in people plainly', () => {
  const m = messagesFor('en');
  expect(personLabel(m, { name: 'Ploy' })).toBe('Ploy (unverified)');
  expect(personLabel(m, { name: 'Ploy S.', userId: 'u1' })).toBe('Ploy S.');
});
```

`apps/web/src/auth/useCan.test.ts`:
```ts
import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { resetAuthStore, useAuthStore } from './authStore';
import { useCan } from './useCan';

beforeEach(() => resetAuthStore());
const as = (role: 'viewer' | 'editor' | 'reviewer' | 'admin') =>
  useAuthStore.setState({ status: 'signed-in', user: { id: 'u', name: 'U', email: 'u@x', role, mustChangePassword: false } });

it('follows the role ladder when signed in', () => {
  as('viewer');
  expect(renderHook(() => useCan()).result.current).toMatchObject({ edit: false, review: false, admin: false, verifiedNames: true });
  as('reviewer');
  expect(renderHook(() => useCan()).result.current).toMatchObject({ edit: true, review: true, admin: false });
  as('admin');
  expect(renderHook(() => useCan()).result.current).toMatchObject({ edit: true, review: true, admin: true });
});

it('allows everything, with typed names, when nobody signs in (local or dev mode)', () => {
  useAuthStore.setState({ status: 'dev' });
  expect(renderHook(() => useCan()).result.current).toMatchObject({ edit: true, review: true, admin: true, verifiedNames: false });
});
```

Component tests to add (in the existing test files next to each component; render with the auth store set as in `useCan.test.ts`):
- `ApprovalPanel` signed in as a reviewer: no "Reviewer name" field; the approve confirmation names the signed-in user; when `revision.designedBy.userId` equals the user's id, the Approve button is disabled with the text "You submitted this revision. Another reviewer has to approve it."; signed in as an editor on an in-review revision: "Only reviewers can approve." and no approve button; the designer line shows "Ploy S." (no "(unverified)") for a name with a `userId`.
- `UnknownsPanel` as an editor: the acknowledge form is replaced by "Only reviewers can accept unknown demand."; as a reviewer: no "Your name" field.
- `NotesPanel` signed in: no "Your name (optional, unverified)" field; a note with `byId` shows its author without "(unverified)".
- `Shell` with `readOnlyReason: 'view-only'`: banner "You can view this workspace. Ask an admin for edit access."
- `CatalogScreen` signed in as an editor: a note "Only admins can change the catalog." and every create/edit/delete/import control disabled.
- `HistoryPanel`: an event with `params.verified` shows no "(unverified)".

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @glasshouse/web exec vitest run src/ui/person.test.ts src/auth src/features/review src/features/catalog src/app/Shell.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/ui/person.ts`:
```ts
import type { Messages } from '../i18n';

/** Signed-in people are shown by name; typed names (local mode, or imported) keep "(unverified)". */
export const personLabel = (m: Messages, p: { name: string; userId?: string }): string => (p.userId ? p.name : m.review.unverified(p.name));
```
(If `Messages` isn't exported from `../i18n`, export the existing messages type from there.)

`apps/web/src/auth/useCan.ts`:
```ts
import { SERVER_MODE } from '../sync/serverMode';
import type { AuthUser, Role } from './authApi';
import { useAuthStore } from './authStore';

const RANK: Record<Role, number> = { viewer: 0, editor: 1, reviewer: 2, admin: 3 };

export function useCan(): { me: AuthUser | null; edit: boolean; review: boolean; admin: boolean; verifiedNames: boolean } {
  const status = useAuthStore((s) => s.status);
  const me = useAuthStore((s) => s.user);
  if (!SERVER_MODE && status === 'unknown') return { me: null, edit: true, review: true, admin: true, verifiedNames: false };
  if (status !== 'signed-in' || !me) return { me: null, edit: true, review: true, admin: true, verifiedNames: false };
  const r = RANK[me.role];
  return { me, edit: r >= RANK.editor, review: r >= RANK.reviewer, admin: r >= RANK.admin, verifiedNames: true };
}
```
(`status === 'dev'` and local mode both fall into the "everything allowed, typed names" branch.)

`apps/web/src/store/workspaceStore.ts`:
```ts
export type ReadOnlyReason = 'other-tab' | 'offline' | 'view-only';
…Data: readOnlyReason: ReadOnlyReason | null;  (initialData: null)
…WorkspaceState: setReadOnly: (readOnly: boolean, reason?: ReadOnlyReason) => void;
setReadOnly: (readOnly, reason) => set((s) => ({ readOnly, readOnlyReason: readOnly ? (reason ?? s.readOnlyReason ?? 'other-tab') : null })),
```

`apps/web/src/sync/serverMode.ts`:
- after the workspace loads: `const viewOnly = me?.role === 'viewer'; if (viewOnly) store.setReadOnly(true, 'view-only');`
- in `onConnection('live')`: `viewOnly ? s.setReadOnly(true, 'view-only') : s.setReadOnly(false);`
- in the offline timer: `setReadOnly(true, 'offline')`.
- in `stop()`: `setReadOnly(false)` (unchanged behaviour).

`apps/web/src/app/Shell.tsx` — replace the banner block:
```tsx
      {readOnly && readOnlyReason === 'view-only' && connection !== 'offline' ? (
        <p className="read-only-banner" role="status">{m.shell.viewOnly}</p>
      ) : connection === 'offline' || (readOnly && connection !== 'local') ? (
        <p className="read-only-banner" role="alert">{m.shell.offline}</p>
      ) : readOnly ? (
        <p className="read-only-banner" role="alert">{m.shell.otherTab}</p>
      ) : null}
```
(`const readOnlyReason = useWorkspaceStore((s) => s.readOnlyReason);`)

`apps/web/src/features/review/ApprovalPanel.tsx`:
- `const can = useCan();`
- designer line: `revision.designedBy ? personLabel(m, revision.designedBy) : '—'`; approved stamp: `m.review.stampBy(personLabel(m, revision.approvedBy))` — and change `stampBy` to take the already-labelled text (`(by: string) => \`by ${by}\`` in en; Thai equivalent).
- when `can.verifiedNames`: hide the designer and reviewer name fields; submit sends `designedBy: can.me!.name`, approve sends `reviewer: can.me!.name` (the server overwrites anyway; the optimistic apply needs a name).
- in-review: if `!can.review` render `<p className="review-note">{m.review.reviewersOnly}</p>` instead of the approve form; if `can.me && revision.designedBy?.userId === can.me.id` render the form with the Approve button disabled and `<p className="review-note">{m.review.ownSubmission}</p>`.
- submit form only when `can.edit`; "Start new draft" only when `can.edit`.

`UnknownsPanel.tsx`: acknowledge form only when `can.review` (else `m.review.reviewersOnlyUnknowns`); no name field when `can.verifiedNames` (send `by: can.me!.name`); acknowledgement lines use `personLabel`.
`NotesPanel.tsx`: add-note form only when `can.edit`; no name field when `can.verifiedNames` (send `by: can.me!.name`); author line: `n.byId ? m.review.noteByVerified(n.by!, time) : m.review.noteBy(n.by, time)` with `noteByVerified: (by, time) => \`${by} · ${time}\``.
`HistoryPanel.tsx`, `SheetTitleBlock.tsx`, `SheetTables.tsx`: every place that prints `(unverified)` or `m.review.unverified(name)` for a revision person uses `personLabel`; acknowledgement lines in the sheet use `personLabel(m, a.by)`.
`CatalogScreen.tsx`: `const can = useCan();` when `!can.admin` show `<p className="review-note">{m.catalog.adminsOnly}</p>` at the top and pass `disabled` to every create/edit/save/delete/import/seed control (read the component to find them; the server refuses them anyway — this keeps people from filling a form that can't be saved).
i18n history (`en.ts` and `th.ts` `history` codes `submitted`, `approved`, `acknowledged`, `note_added`): append " (unverified)" / " (ไม่ได้ยืนยัน)" only when `!p.verified`.
New strings — `en.ts`: `shell.viewOnly: 'You can view this workspace. Ask an admin for edit access.'`, `review.reviewersOnly: 'Only reviewers can approve.'`, `review.ownSubmission: 'You submitted this revision. Another reviewer has to approve it.'`, `review.reviewersOnlyUnknowns: 'Only reviewers can accept unknown demand.'`, `review.noteByVerified`, `catalog.adminsOnly: 'Only admins can change the catalog.'`. `th.ts`: `'คุณดูพื้นที่ทำงานนี้ได้อย่างเดียว ขอสิทธิ์แก้ไขจากผู้ดูแล'`, `'เฉพาะผู้ตรวจเท่านั้นที่อนุมัติได้'`, `'คุณเป็นผู้ส่งฉบับนี้ ต้องให้ผู้ตรวจคนอื่นอนุมัติ'`, `'เฉพาะผู้ตรวจเท่านั้นที่ยอมรับค่ากำลังไฟที่ไม่ทราบได้'`, `noteByVerified: (by, time) => \`${by} · ${time}\``, `'เฉพาะผู้ดูแลเท่านั้นที่แก้ไขแคตตาล็อกได้'`.

- [ ] **Step 4: Run tests** — `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck && pnpm --filter @glasshouse/web e2e` — Expected: PASS (local mode: every control still there, names still "(unverified)").

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): role-aware review, notes and catalog; verified names on the shared server"
```

---

### Task 8: Users screen for admins

**Files:**
- Create: `apps/web/src/features/admin/adminApi.ts`, `UsersScreen.tsx`, `UsersScreen.test.tsx`, `users.css`
- Modify: `apps/web/src/app/routes.tsx`, `apps/web/src/i18n/en.ts`, `th.ts`

**Interfaces:**
- Consumes: server admin API (Task 5), `useCan` (Task 7), `Role` (Task 6).
- Produces: route `/admin/users` (inside the Shell; non-admins see "Only admins can manage users." and a link home); `adminApi`: `listUsers(): Promise<AdminUser[]>`, `createUser(input: { email; displayName; role }): Promise<{ user: AdminUser; temporaryPassword: string }>`, `updateUser(id, patch: { role?; active?; displayName? }): Promise<AdminUser>`, `resetPassword(id): Promise<{ temporaryPassword: string }>` — each throws `Error` with the server's message; `AdminUser = { id; email; displayName; role: Role; source: 'oidc' | 'local'; active: boolean; mustChangePassword: boolean; createdAt: string; lastLoginAt: string | null }`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/admin/UsersScreen.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from '../../auth/authStore';
import { UsersScreen } from './UsersScreen';

const users = [
  { id: 'a', email: 'few@company.test', displayName: 'Few', role: 'admin', source: 'oidc', active: true, mustChangePassword: false, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: '2026-10-18T08:00:00.000Z' },
  { id: 'b', email: 'ploy@company.test', displayName: 'Ploy', role: 'viewer', source: 'local', active: true, mustChangePassword: true, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: null },
];

beforeEach(() => {
  resetAuthStore();
  useAuthStore.setState({ status: 'signed-in', user: { id: 'a', name: 'Few', email: 'few@company.test', role: 'admin', mustChangePassword: false } });
});
afterEach(() => vi.restoreAllMocks());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

it('lists people, changes a role, and shows a new user’s one-time password', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === '/api/admin/users' && (!init || init.method === undefined)) return json(users);
    if (url === '/api/admin/users/b' && init?.method === 'PATCH') return json({ ...users[1], role: 'editor' });
    if (url === '/api/admin/users' && init?.method === 'POST') return json({ user: { ...users[1], id: 'c', email: 'new@company.test', displayName: 'New' }, temporaryPassword: 'TempPass-123456' }, 201);
    return json({ error: { message: 'unexpected' } }, 500);
  });
  render(<MemoryRouter><UsersScreen /></MemoryRouter>);
  const row = (await screen.findByRole('row', { name: /Ploy/ }));
  expect(within(row).getByText('Local')).toBeInTheDocument();
  await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Role for Ploy' }), 'editor');
  expect(fetchSpy).toHaveBeenCalledWith('/api/admin/users/b', expect.objectContaining({ method: 'PATCH' }));
  await userEvent.type(screen.getByLabelText('Email'), 'new@company.test');
  await userEvent.type(screen.getByLabelText('Name'), 'New');
  await userEvent.click(screen.getByRole('button', { name: 'Add user' }));
  expect(await screen.findByText('TempPass-123456')).toBeInTheDocument();
  expect(screen.getByText(/Shown once/)).toBeInTheDocument();
});

it('shows the server’s refusal, such as removing the last admin', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
    init?.method === 'PATCH' ? json({ error: { message: 'This is the last admin. Make someone else an admin first.' } }, 409) : json(users),
  );
  render(<MemoryRouter><UsersScreen /></MemoryRouter>);
  const row = await screen.findByRole('row', { name: /Few/ });
  await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Role for Few' }), 'editor');
  expect(await screen.findByRole('alert')).toHaveTextContent('last admin');
});

it('turns non-admins away', () => {
  useAuthStore.setState({ status: 'signed-in', user: { id: 'b', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: false } });
  render(<MemoryRouter><UsersScreen /></MemoryRouter>);
  expect(screen.getByText('Only admins can manage users.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @glasshouse/web exec vitest run src/features/admin` — Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/features/admin/adminApi.ts`:
```ts
import type { Role } from '../../auth/authApi';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  source: 'oidc' | 'local';
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const HEADERS = { 'content-type': 'application/json', 'x-glasshouse': '1' };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `The server answered ${res.status}.`);
  }
  return (await res.json()) as T;
}

export const listUsers = (): Promise<AdminUser[]> => call('/api/admin/users');
export const createUser = (input: { email: string; displayName: string; role: Role }) =>
  call<{ user: AdminUser; temporaryPassword: string }>('/api/admin/users', { method: 'POST', headers: HEADERS, body: JSON.stringify(input) });
export const updateUser = (id: string, patch: { role?: Role; active?: boolean; displayName?: string }) =>
  call<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(patch) });
export const resetPassword = (id: string) => call<{ temporaryPassword: string }>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', headers: HEADERS });
```

`apps/web/src/features/admin/UsersScreen.tsx`:
```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Role } from '../../auth/authApi';
import { useCan } from '../../auth/useCan';
import { useT } from '../../i18n';
import { formatTime } from '../../ui/time';
import { createUser, listUsers, resetPassword, updateUser, type AdminUser } from './adminApi';
import './users.css';

const ROLES: Role[] = ['viewer', 'editor', 'reviewer', 'admin'];

export function UsersScreen() {
  const m = useT();
  const can = useCan();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('editor');

  useEffect(() => {
    if (!can.admin) return;
    listUsers().then(setUsers, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [can.admin]);

  if (!can.admin) {
    return (
      <section className="users glass">
        <p>{m.users.adminsOnly}</p>
        <Link to="/" className="btn btn--sm">{m.shell.backToProjects}</Link>
      </section>
    );
  }

  const run = async (work: () => Promise<void>): Promise<void> => {
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const replace = (u: AdminUser): void => setUsers((list) => (list ?? []).map((x) => (x.id === u.id ? u : x)));
  const add = (e: FormEvent): void => {
    e.preventDefault();
    void run(async () => {
      const r = await createUser({ email: email.trim(), displayName: name.trim(), role });
      setUsers((list) => [...(list ?? []), r.user]);
      setSecret({ who: r.user.email, password: r.temporaryPassword });
      setEmail('');
      setName('');
    });
  };

  return (
    <section className="users glass" aria-labelledby="users-h">
      <h1 id="users-h">{m.users.title}</h1>
      <p className="review-note">{m.users.note}</p>
      {error ? <p role="alert" className="field__error">{error}</p> : null}
      {secret ? (
        <div className="users__secret" role="status">
          <p>{m.users.tempFor(secret.who)}</p>
          <code className="mono">{secret.password}</code>
          <p className="review-note">{m.users.shownOnce}</p>
          <button type="button" className="btn btn--sm" onClick={() => setSecret(null)}>{m.common.close}</button>
        </div>
      ) : null}
      <table className="users__table">
        <thead>
          <tr><th>{m.users.name}</th><th>{m.users.email}</th><th>{m.users.role}</th><th>{m.users.signIn}</th><th>{m.users.status}</th><th>{m.users.lastSignIn}</th><th /></tr>
        </thead>
        <tbody>
          {(users ?? []).map((u) => (
            <tr key={u.id} aria-label={u.displayName}>
              <td>{u.displayName}{u.mustChangePassword ? <span className="users__flag">{m.users.mustChange}</span> : null}</td>
              <td>{u.email}</td>
              <td>
                <select aria-label={m.users.roleFor(u.displayName)} value={u.role} onChange={(e) => void run(async () => replace(await updateUser(u.id, { role: e.target.value as Role })))}>
                  {ROLES.map((r) => <option key={r} value={r}>{m.auth.role[r]}</option>)}
                </select>
              </td>
              <td>{u.source === 'oidc' ? m.users.sso : m.users.local}</td>
              <td>
                <button type="button" className="btn btn--sm btn--quiet" aria-pressed={u.active} onClick={() => void run(async () => replace(await updateUser(u.id, { active: !u.active })))}>
                  {u.active ? m.users.active : m.users.off}
                </button>
              </td>
              <td className="mono">{u.lastLoginAt ? formatTime(u.lastLoginAt) : m.common.none}</td>
              <td>
                {u.source === 'local' ? (
                  <button type="button" className="btn btn--sm btn--quiet" onClick={() => void run(async () => setSecret({ who: u.email, password: (await resetPassword(u.id)).temporaryPassword }))}>
                    {m.users.reset}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="users__add review-form" onSubmit={add} aria-labelledby="users-add-h">
        <h2 id="users-add-h">{m.users.addTitle}</h2>
        <div className="field"><label htmlFor="nu-email" className="field__label">{m.users.email}</label><div className="field__box"><input id="nu-email" className="field__input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></div>
        <div className="field"><label htmlFor="nu-name" className="field__label">{m.users.name}</label><div className="field__box"><input id="nu-name" className="field__input" value={name} onChange={(e) => setName(e.target.value)} required /></div></div>
        <div className="field"><label htmlFor="nu-role" className="field__label">{m.users.role}</label><div className="field__box"><select id="nu-role" className="field__input" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{m.auth.role[r]}</option>)}</select></div></div>
        <button type="submit" className="btn btn--ink">{m.users.add}</button>
      </form>
    </section>
  );
}
```
`users.css`: the screen sits in the main area like the Catalog screen (glass panel, max-width 1100 px, scrolls on its own); table rows 40 px with the existing hairline token, the role select and status toggle sized like other `btn--sm` controls, `.users__flag` a small warn stamp ("Must change password"), `.users__secret` an emphasised box with the password in mono at `--text-md`. Phones: the table scrolls horizontally inside the panel, never the page.

`apps/web/src/app/routes.tsx`: add `{ path: 'admin/users', element: <UsersScreen /> }` inside the Shell children (before `*`).

i18n — `en.ts`:
```ts
  users: {
    title: 'Users',
    note: 'Everyone with access to Glasshouse. Roles build on each other: Viewer, Editor, Reviewer, Admin.',
    adminsOnly: 'Only admins can manage users.',
    name: 'Name', email: 'Email', role: 'Role', signIn: 'Sign-in', status: 'Status', lastSignIn: 'Last sign-in',
    roleFor: (name: string) => `Role for ${name}`,
    sso: 'Company account', local: 'Local',
    active: 'Active', off: 'Switched off',
    mustChange: 'Must change password',
    reset: 'Reset password',
    addTitle: 'Add someone with a password',
    add: 'Add user',
    tempFor: (who: string) => `Temporary password for ${who}:`,
    shownOnce: 'Shown once. Give it to them directly; they choose their own at first sign-in.',
  },
```
`th.ts`:
```ts
  users: {
    title: 'ผู้ใช้',
    note: 'ทุกคนที่เข้าใช้ Glasshouse ได้ สิทธิ์ต่อยอดกัน: ผู้ดู ผู้แก้ไข ผู้ตรวจ ผู้ดูแล',
    adminsOnly: 'เฉพาะผู้ดูแลเท่านั้นที่จัดการผู้ใช้ได้',
    name: 'ชื่อ', email: 'อีเมล', role: 'สิทธิ์', signIn: 'การเข้าสู่ระบบ', status: 'สถานะ', lastSignIn: 'เข้าสู่ระบบล่าสุด',
    roleFor: (name) => `สิทธิ์ของ ${name}`,
    sso: 'บัญชีบริษัท', local: 'บัญชีในระบบ',
    active: 'ใช้งานอยู่', off: 'ปิดใช้งาน',
    mustChange: 'ต้องเปลี่ยนรหัสผ่าน',
    reset: 'รีเซ็ตรหัสผ่าน',
    addTitle: 'เพิ่มผู้ใช้แบบรหัสผ่าน',
    add: 'เพิ่มผู้ใช้',
    tempFor: (who) => `รหัสผ่านชั่วคราวของ ${who}:`,
    shownOnce: 'แสดงครั้งเดียว ส่งให้เจ้าตัวโดยตรง แล้วเขาจะตั้งรหัสผ่านเองเมื่อเข้าสู่ระบบครั้งแรก',
  },
```
(The unit test's English labels — "Email", "Name", "Add user", "Role for Ploy", "Local", "Shown once" — must match these strings; the table's "Name"/"Email" headers and the form labels share the same text, so the form uses `getByLabelText`.)

- [ ] **Step 4: Run tests** — `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): Users screen for admins"
```

---

### Task 9: End-to-end sign-in tests, Authelia setup notes, docs

**Files:**
- Create: `apps/server/scripts/mock-idp.mjs`, `apps/web/playwright.auth.config.ts`, `apps/web/e2e-auth/auth.spec.ts`
- Modify: `apps/web/package.json` (script `e2e:auth`), root `package.json` (script `e2e:auth`), `apps/web/tsconfig.json` (include `e2e-auth`, the new config), `docs/superpowers/specs/2026-10-17-p1-shared-server-design.md`, `DESIGN.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the test IdP script and e2e config**

`apps/server/scripts/mock-idp.mjs`:
```js
// A local OpenID provider for the sign-in e2e: auto-approves and signs in "Ploy SSO". Never used in production.
import { OAuth2Server } from 'oauth2-mock-server';

const port = Number(process.argv[2] ?? 5398);
const server = new OAuth2Server();
await server.issuer.keys.generate('RS256');
server.service.on('beforeTokenSigning', (token) => {
  Object.assign(token.payload, { sub: 'sso-ploy', email: 'ploy.sso@company.test', email_verified: true, name: 'Ploy SSO' });
});
await server.start(port, '127.0.0.1');
console.log(`mock IdP at ${server.issuer.url}`);
```

`apps/web/playwright.auth.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const PORT = 5399;
const IDP = 5398;
const WEB_DIR = fileURLToPath(new URL('./dist-server', import.meta.url));

// The real server with sign-in on (memory store, seeded local users) and a local OpenID provider.
export default defineConfig({
  testDir: './e2e-auth',
  reporter: 'list',
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: [
    { command: `pnpm --filter @glasshouse/server exec node scripts/mock-idp.mjs ${IDP}`, url: `http://127.0.0.1:${IDP}/.well-known/openid-configuration`, reuseExistingServer: false, timeout: 60_000 },
    {
      command: 'pnpm vite build --outDir dist-server && pnpm --filter @glasshouse/server exec tsx src/main.ts',
      env: {
        VITE_GLASSHOUSE_SERVER: '1',
        GLASSHOUSE_AUTH: 'on',
        GLASSHOUSE_STORE: 'memory',
        GLASSHOUSE_WEB_DIR: WEB_DIR,
        GLASSHOUSE_PUBLIC_URL: `http://localhost:${PORT}`,
        GLASSHOUSE_OIDC_ISSUER: `http://127.0.0.1:${IDP}`,
        GLASSHOUSE_OIDC_CLIENT_ID: 'glasshouse',
        GLASSHOUSE_OIDC_CLIENT_SECRET: 'e2e-secret',
        GLASSHOUSE_DEFAULT_ROLE: 'viewer',
        GLASSHOUSE_SEED_USERS: 'admin@company.test:admin-password-1:admin:Ada Admin;rev@company.test:review-password-1:reviewer:Rae Reviewer;ed@company.test:editor-password-1:editor:Eddie Editor',
        PORT: String(PORT),
        HOST: '127.0.0.1',
      },
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
```
(`baseURL` is `localhost` to match `GLASSHOUSE_PUBLIC_URL`, so the Origin check passes.)

- [ ] **Step 2: Write the e2e tests**

`apps/web/e2e-auth/auth.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Account menu for / }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Glasshouse' })).toBeVisible();
}

test('the workspace is behind sign-in, and a wrong password is explained', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to Glasshouse' })).toBeVisible();
  expect((await page.request.get('/api/workspace')).status()).toBe(401);
  await signIn(page, 'ed@company.test', 'not-the-password');
  await expect(page.getByRole('alert')).toContainText('don’t match');
});

test('an editor signs in, edits, and signs out', async ({ page }) => {
  await signIn(page, 'ed@company.test', 'editor-password-1');
  await expect(page.getByText('Connected to the Glasshouse server')).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Editor project');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Projects' }).getByText('Editor project')).toBeVisible();
  await expect(page.getByText(/Saved to the server/)).toBeVisible();
  await signOut(page);
});

test('an admin adds a person, who must choose their own password', async ({ page }) => {
  await signIn(page, 'admin@company.test', 'admin-password-1');
  await page.goto('/admin/users');
  await page.getByLabel('Email').fill('newbie@company.test');
  await page.getByLabel('Name').fill('New Bie');
  await page.getByLabel('Role', { exact: true }).selectOption('editor');
  await page.getByRole('button', { name: 'Add user' }).click();
  const temp = (await page.locator('.users__secret code').textContent())!.trim();
  await signOut(page);
  await signIn(page, 'newbie@company.test', temp);
  await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
  await page.getByLabel('Temporary password').fill(temp);
  await page.getByLabel('New password', { exact: true }).fill('newbie-password-1');
  await page.getByLabel('New password again').fill('newbie-password-1');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Connected to the Glasshouse server')).toBeVisible();
});

test('a company sign-in creates a viewer, who can look but not change', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in with your company account' }).click();
  await expect(page.getByText('You can view this workspace. Ask an admin for edit access.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account menu for Ploy SSO' })).toBeVisible();
  const refused = await page.request.post('/api/commands', { headers: { 'x-glasshouse': '1' }, data: { clientId: 'x', commands: [{ commandId: 'v1', command: { type: 'project/create', id: 'pv', name: 'Nope' } }] } });
  expect(await refused.json()).toMatchObject({ rejected: { error: { code: 'forbidden' } } });
});

test('a reviewer who submitted can’t approve; another reviewer can, and names are verified', async ({ browser }) => {
  const rae = await (await browser.newContext()).newPage();
  await signIn(rae, 'rev@company.test', 'review-password-1');
  await expect(rae.getByText('Connected to the Glasshouse server')).toBeVisible();
  // An approvable room (the domain review test's ready() state), built through the API as Rae.
  const template = ((await (await rae.request.get('/api/workspace')).json()) as { workspace: { catalog: { id: string }[] } }).workspace.catalog.find((t) => t.id === 'tpl-server-2u');
  const rack = { type: 'rack', id: 'rk-e2e', name: 'RK-01', x: 1, y: 0.6, w: 0.8, d: 1.1, angle: 0, height: null, notes: '', capacityU: 42, usableDepthMm: 1000, owner: 'oxygenai', clearance: { front: 1, rear: 0.6 }, devices: [], reserved: [] };
  const commands = [
    { type: 'project/create', id: 'p-e2e', name: 'Review e2e' },
    { type: 'site/create', projectId: 'p-e2e', id: 's-e2e', name: 'Site' },
    { type: 'room/create', siteId: 's-e2e', id: 'r-e2e', floorAreaId: 'fa-e2e', name: 'MDF-E2E' },
    { type: 'plan', roomId: 'r-e2e', command: { type: 'object/add', object: rack } },
    { type: 'plan', roomId: 'r-e2e', command: { type: 'device/place', id: 'srv-e2e', rackId: 'rk-e2e', bottomU: 1, template } },
  ].map((command, i) => ({ commandId: `setup-${i}`, command }));
  const setup = await rae.request.post('/api/commands', { headers: { 'x-glasshouse': '1' }, data: { clientId: 'e2e-setup', commands } });
  expect(await setup.json()).toMatchObject({ rejected: null });
  await rae.goto('/rooms/r-e2e/review');
  await rae.getByRole('button', { name: 'Submit for review' }).click();
  await rae.getByRole('button', { name: 'Confirm submit' }).click();
  await expect(rae.getByText('You submitted this revision. Another reviewer has to approve it.')).toBeVisible();
  await expect(rae.getByRole('button', { name: 'Approve revision' })).toBeDisabled();

  const ada = await (await browser.newContext()).newPage();
  await signIn(ada, 'admin@company.test', 'admin-password-1');
  await ada.goto('/rooms/r-e2e/review');
  await ada.getByRole('button', { name: 'Approve revision' }).click();
  await ada.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(ada.getByText('by Ada Admin')).toBeVisible();
  await expect(ada.getByText('Rae Reviewer', { exact: true })).toBeVisible();
  await expect(ada.getByText(/\(unverified\)/)).toHaveCount(0);
});
```
> Implementer: the rack literal mirrors `createObject('rack', …)` defaults in `packages/domain/src/objects.ts`; if a field differs (e.g. width/depth defaults or extra optional fields), copy the real defaults so the server's schema check accepts it. If the approvable state needs more than this (check `approvalBlockers`), add the missing command and say so in the report.

`apps/web/package.json` scripts: `"e2e:auth": "playwright test -c playwright.auth.config.ts"`; root: `"e2e:auth": "pnpm --filter @glasshouse/web e2e:auth"`; `apps/web/tsconfig.json` include adds `"e2e-auth"` and `"playwright.auth.config.ts"`.

- [ ] **Step 3: Run** — `pnpm e2e:auth` — Expected: 5 passed.

- [ ] **Step 4: Docs**

`docs/superpowers/specs/2026-10-17-p1-shared-server-design.md` — add a section "Running with sign-in (Plan B)":
- Environment: `GLASSHOUSE_AUTH=on`, `GLASSHOUSE_PUBLIC_URL=https://glasshouse.<company>`, `DATABASE_URL`, `GLASSHOUSE_OIDC_ISSUER=https://auth.<company>`, `GLASSHOUSE_OIDC_CLIENT_ID=glasshouse`, `GLASSHOUSE_OIDC_CLIENT_SECRET=<plain secret>`, `GLASSHOUSE_BOOTSTRAP_ADMIN=<your email>`, optional `GLASSHOUSE_LOCAL_LOGIN=off`, `GLASSHOUSE_DEFAULT_ROLE=viewer`.
- Authelia client (in Authelia's `configuration.yml`):
```yaml
identity_providers:
  oidc:
    clients:
      - client_id: 'glasshouse'
        client_name: 'Glasshouse'
        client_secret: '$pbkdf2-sha512$310000$...'   # hash of the plain secret; the plain one goes in GLASSHOUSE_OIDC_CLIENT_SECRET
        public: false
        authorization_policy: 'two_factor'
        require_pkce: true
        pkce_challenge_method: 'S256'
        redirect_uris:
          - 'https://glasshouse.<company>/auth/oidc/callback'
        scopes: ['openid', 'profile', 'email']
        token_endpoint_auth_method: 'client_secret_basic'
```
  (generate the hash with `authelia crypto hash generate pbkdf2 --password '<secret>'`).
- First admin without SSO: `DATABASE_URL=… node dist/cli.js create-admin few@company.test "Few"`.
- Password storage note: scrypt (node:crypto) instead of argon2id — no native module in the image; parameters N=32768, r=8, p=1.
- Mark the role matrix's product defaults as shipped: new SSO users are Viewers; project delete is admin-only; accepting unknown demand is reviewer-only; notes need Editor.

`DESIGN.md` — add under the shell section: the sign-in screen (glass card centred on the grid ground, company sign-in first, password form below an "or"), the user menu in the title block's tools corner (name, email, role stamp, Users for admins, Sign out), the view-only banner, and the Users screen (table, one-time password box).

- [ ] **Step 5: Full gate**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm e2e && pnpm e2e:server && pnpm e2e:auth && pnpm test:db`
Expected: all PASS (Docker running for `test:db`; ports 5199, 5299, 5398, 5399 free).

- [ ] **Step 6: Commit**

```bash
git add apps docs DESIGN.md package.json
git commit -m "test(e2e): sign-in, roles and separation of duties end to end; Authelia setup notes"
```

---

## After Plan B

Plan C (room claiming, immutable approvals with content hash, Docker image, security headers, `/api/ready`, backups and restore drill, ambiguous-append recovery, single-instance lock, pilot) is written against the shipped Plan B interfaces: `Actor` (with role), `requiredRole`, the `IdentityStore`, and the admin API.
