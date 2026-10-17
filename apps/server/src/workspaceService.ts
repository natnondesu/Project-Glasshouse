import { apply, createWorkspace, err, parseWorkspace, withSample, type DomainError, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { atLeast } from './identity/types';
import { ROLE_LABEL, requiredRole, stampCommand } from './permissions';
import type { Actor, CommandStore, LoggedCommand } from './store/commandStore';

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
  onError?: (message: string, error: unknown) => void;
}

type Listener = (entry: LoggedCommand) => void;

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const commandIdOf = (item: unknown): string => (isRecord(item) && typeof item.commandId === 'string' ? item.commandId : '');
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
    private readonly now: () => string,
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
    for (;;) {
      const page = await store.commandsAfter(seq, REPLAY_PAGE);
      if (page.length === 0) break;
      for (const entry of page) {
        if (entry.seq !== seq + 1) throw new Error(`The command log has a gap after seq ${seq} (next is ${entry.seq}).`);
        const result = apply(workspace, entry.command);
        if (result === undefined) throw new Error(`Replaying seq ${entry.seq} failed: unknown change type "${entry.command.type}".`);
        if (!result.ok) throw new Error(`Replaying seq ${entry.seq} failed: ${result.error.message}`);
        workspace = result.value;
        seq = entry.seq;
      }
    }
    // Always snapshot after boot: keeps the replay tail short and pins a seeded sample's IDs.
    await store.saveSnapshot(seq, workspace);
    return new WorkspaceService(store, { seq, workspace }, options.snapshotEvery ?? SNAPSHOT_EVERY, onError, now);
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
    const entry: LoggedCommand = { seq: this.current.seq + 1, clientId, commandId, actor, command: toApply };
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
