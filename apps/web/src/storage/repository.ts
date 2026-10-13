import type { Workspace } from '@glasshouse/domain';

/** The storage boundary. P1 replaces the browser implementation with an API client (ADR-0001). */
export interface Repository {
  load(): Promise<unknown | null>;
  save(workspace: Workspace): Promise<void>;
}
