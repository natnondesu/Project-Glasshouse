import { apply, approvedRevisionChanges, createWorkspace, currentRevision, draftEditRoom, err, findRoom, newlyApprovedRevisions, parseWorkspace, withSample, type DomainError, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import type { ClaimRegistry } from './claims';
import { atLeast } from './identity/types';
import { ROLE_LABEL, requiredRole, stampCommand } from './permissions';
import type { Actor, ApprovalRecord, CommandStore, LoggedCommand } from './store/commandStore';

export const SNAPSHOT_EVERY = 200;
const REPLAY_PAGE = 1000;
/** Only meaningful for a browser-local workspace. */
const BROWSER_ONLY = new Set<string>(['backup/mark', 'sample/load']);

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
  /** One editor per room draft; omit in dev mode, where nobody is signed in. */
  claims?: ClaimRegistry;
  onError?: (message: string, error: unknown) => void;
}

type Listener = (entry: LoggedCommand) => void;

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const commandIdOf = (item: unknown): string => (isRecord(item) && typeof item.commandId === 'string' ? item.commandId : '');
const rejected = (message: string): SubmitOutcome => ({ kind: 'rejected', error: err('invalid_value', message).error });

type ApprovalOutcome = { ok: true; record: ApprovalRecord | null } | { ok: false; roomId: string };

/** The record for an approval: what was approved, by whom, when, under which seq. Null only for commands that are not approvals. */
function approvalRecord(seq: number, command: WorkspaceCommand, after: Workspace, actor: Actor): ApprovalOutcome {
  if (command.type !== 'review' || command.command.type !== 'review/approve') return { ok: true, record: null };
  const loc = findRoom(after, command.roomId);
  const rev = loc ? currentRevision(loc.room.plan) : null;
  if (!loc || !rev || rev.state !== 'approved' || !rev.approvedHash || !rev.approvedAt) return { ok: false, roomId: command.roomId };
  return {
    ok: true,
    record: { seq, roomId: loc.room.id, revision: rev.number, contentHash: rev.approvedHash, approverId: actor.id, approverName: rev.approvedBy?.name ?? actor.name, approvedAt: rev.approvedAt },
  };
}

/** Applies logged commands after `from` to `workspace`; throws on a gap or a command that won't apply. */
async function replayAfter(store: CommandStore, from: { seq: number; workspace: Workspace }, onEntry: (e: LoggedCommand, state: { seq: number; workspace: Workspace }) => void = () => {}): Promise<{ seq: number; workspace: Workspace }> {
  let { seq, workspace } = from;
  for (;;) {
    const page = await store.commandsAfter(seq, REPLAY_PAGE);
    if (page.length === 0) return { seq, workspace };
    for (const entry of page) {
      if (entry.seq !== seq + 1) throw new Error(`The command log has a gap after seq ${seq} (next is ${entry.seq}).`);
      const result = apply(workspace, entry.command);
      if (result === undefined) throw new Error(`Replaying seq ${entry.seq} failed: unknown change type "${entry.command.type}".`);
      if (!result.ok) throw new Error(`Replaying seq ${entry.seq} failed: ${result.error.message}`);
      workspace = result.value;
      seq = entry.seq;
      onEntry(entry, { seq, workspace });
    }
  }
}

/**
 * The one place edits are accepted. Holds the workspace in memory, applies commands strictly one at a time,
 * validates the result, logs it, then tells subscribers. Single instance by design (see the P1 design doc).
 */
export class WorkspaceService {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<Listener>();
  private sinceSnapshot = 0;
  /** True after an append error, until the log tail has been re-read. */
  private recovering = false;

  private constructor(
    private readonly store: CommandStore,
    private current: { seq: number; workspace: Workspace },
    private readonly snapshotEvery: number,
    private readonly onError: (message: string, error: unknown) => void,
    private readonly now: () => string,
    private readonly claims: ClaimRegistry | null,
  ) {}

  static async open(store: CommandStore, options: OpenOptions = {}): Promise<WorkspaceService> {
    const onError = options.onError ?? ((message, error) => console.error(message, error));
    const now = options.now ?? (() => new Date().toISOString());
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
        const seeded = withSample(workspace, now());
        if (!seeded.ok) throw new Error(`The sample projects could not be built: ${seeded.error.message}`);
        workspace = seeded.value;
      }
    }
    ({ seq, workspace } = await replayAfter(store, { seq, workspace }));
    // Always snapshot after boot: keeps the replay tail short and pins a seeded sample's IDs.
    await store.saveSnapshot(seq, workspace);
    return new WorkspaceService(store, { seq, workspace }, options.snapshotEvery ?? SNAPSHOT_EVERY, onError, now, options.claims ?? null);
  }

  get state(): { seq: number; workspace: Workspace } {
    return this.current;
  }

  get claimRegistry(): ClaimRegistry | null {
    return this.claims;
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

  /** Items interleave with other clients' commands on purpose: each takes its own place in the one global order; batching only saves round trips. */
  async submitBatch(clientId: string, items: { commandId: string; command: WorkspaceCommand }[], actor: Actor): Promise<BatchOutcome> {
    const accepted: BatchOutcome['accepted'] = [];
    for (const [i, item] of items.entries()) {
      const commandId = commandIdOf(item);
      const outcome = await this.submit({ ...item, clientId }, actor);
      if (outcome.kind === 'rejected') {
        return { accepted, rejected: { commandId, error: outcome.error }, skipped: items.slice(i + 1).map(commandIdOf) };
      }
      accepted.push({ commandId, seq: outcome.seq });
    }
    return { accepted, rejected: null, skipped: [] };
  }

  async ready(): Promise<{ ok: true; seq: number } | { ok: false; reason: string }> {
    // The healthcheck is what notices a broken database first, so it also finishes any recovery the next edit would.
    try {
      await this.enqueue(async () => {
        if (this.recovering) await this.recover();
      });
    } catch (e) {
      this.onError('Catching up with the command log failed', e);
      return { ok: false, reason: 'Catching up with the database log failed.' };
    }
    try {
      await this.store.ping();
    } catch (e) {
      // The reason is served without sign-in: details go to the log only.
      this.onError('The database is not answering', e);
      return { ok: false, reason: 'The database is not answering.' };
    }
    return { ok: true, seq: this.current.seq };
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

  private async submitNow(submission: Submission, actor: Actor): Promise<SubmitOutcome> {
    if (!isRecord(submission)) return rejected('Each change needs a submission object.');
    const { clientId, commandId, command } = submission;
    if (!isNonEmptyString(clientId) || !isNonEmptyString(commandId)) return rejected('Each change needs a clientId and a commandId.');
    if (typeof command !== 'object' || command === null || !isNonEmptyString(command.type)) return rejected('Each change needs a command with a type.');
    if (this.recovering) await this.recover();
    const previous = await this.store.findCommand(clientId, commandId);
    if (previous) return { kind: 'accepted', seq: previous.seq, duplicate: true };
    if (BROWSER_ONLY.has(command.type)) return rejected(`"${command.type}" only applies to a workspace stored in one browser.`);
    if (command.type === 'review' && !(isRecord(command.command) && isNonEmptyString(command.command.type))) return rejected('Each review change needs a command with a type.');
    if (actor.verified && actor.name.trim() === '') {
      return { kind: 'rejected', error: err('forbidden', 'Your account has no name. Ask an admin to set one.').error };
    }
    const needed = requiredRole(command);
    if (!atLeast(actor.role, needed)) {
      return { kind: 'rejected', error: err('forbidden', `${ROLE_LABEL[actor.role]}s can't make this change. Ask an admin for ${ROLE_LABEL[needed]} access.`).error };
    }
    const claimRoom = this.claims && actor.verified ? draftEditRoom(command) : null;
    if (claimRoom && !this.claims!.canEdit(claimRoom, actor.id)) {
      const held = this.claims!.holder(claimRoom)!;
      return { kind: 'rejected', error: err('claimed', `${held.name} is editing this room, so your change wasn't saved.`, [claimRoom]).error };
    }
    const toApply = actor.verified ? stampCommand(command, actor, this.now()) : command;
    let result: ReturnType<typeof apply> | undefined;
    try {
      result = apply(this.current.workspace, toApply);
    } catch (e) {
      return rejected(`That change could not be applied: ${describe(e)}`);
    }
    // apply() returns undefined for a command type its switch does not know.
    if (result === undefined) return rejected(`Unknown change type "${toApply.type}".`);
    if (!result.ok) return { kind: 'rejected', error: result.error };
    const checked = parseWorkspace(result.value);
    if (!checked.ok) return rejected(`That change would leave the workspace invalid: ${checked.error.message}`);
    const touched = approvedRevisionChanges(this.current.workspace, result.value);
    if (touched.length > 0) {
      const t = touched[0]!;
      const advice = toApply.type === 'project/import' ? 'Import the file as a copy instead.' : 'Start a new draft.';
      return { kind: 'rejected', error: err('invalid_value', `Revision ${t.revision} of ${t.roomName} is approved, so it can't be changed. ${advice}`, [t.roomId]).error };
    }
    // Only a review can approve a room here. A copy or a new project may carry approvals as history; a merge into rooms that exist may not.
    if (toApply.type === 'project/import' && toApply.resolution.mode === 'merge') {
      const made = newlyApprovedRevisions(this.current.workspace, result.value)[0];
      if (made) {
        return { kind: 'rejected', error: err('invalid_value', `This file marks revision ${made.revision} of ${made.roomName} as approved, but it isn't approved here. Import it as a copy instead.`, [made.roomId]).error };
      }
    }
    const approval = approvalRecord(this.current.seq + 1, toApply, result.value, actor);
    if (!approval.ok) {
      this.onError(`Approval at seq ${this.current.seq + 1} has no approved revision with a fingerprint and time`, toApply);
      return { kind: 'rejected', error: err('invalid_value', "The approval couldn't be recorded, so it wasn't saved. Try again; if it keeps failing, tell an admin.", [approval.roomId]).error };
    }
    const entry: LoggedCommand = { seq: this.current.seq + 1, clientId, commandId, actor, command: toApply };
    try {
      await this.store.append(entry, approval.record);
    } catch (e) {
      // The insert may have committed before the error reached us. Re-read the log before the next command
      // so a landed row is applied (and answered as a duplicate) instead of colliding with the next seq.
      this.recovering = true;
      throw e;
    }
    this.current = { seq: entry.seq, workspace: result.value };
    if (claimRoom) {
      const step = command.type === 'review' ? command.command.type : null;
      if (step === 'review/submit' || step === 'review/discard-draft') this.claims!.release(claimRoom, actor.id, { admin: false });
      else this.claims!.touch(claimRoom, actor);
    }
    this.claims?.prune((roomId) => findRoom(this.current.workspace, roomId) !== null);
    this.notify(entry);
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

  /** Brings memory up to the log after an append whose outcome was unknown. Subscribers hear about landed commands. */
  private async recover(): Promise<void> {
    // State advances before each announcement, so a failed trailing read leaves nothing announced twice.
    this.current = await replayAfter(this.store, this.current, (entry, state) => {
      this.current = state;
      this.notify(entry);
    });
    this.recovering = false;
  }

  private notify(entry: LoggedCommand): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (e) {
        this.onError(`A live-update listener failed at seq ${entry.seq}`, e);
      }
    }
  }

  private async writeSnapshot(): Promise<void> {
    await this.store.saveSnapshot(this.current.seq, this.current.workspace);
    this.sinceSnapshot = 0;
  }
}
