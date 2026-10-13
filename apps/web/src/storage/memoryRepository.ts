import type { Repository } from './repository';

export interface MemoryRepository extends Repository {
  saved: unknown | null;
  failNextSave(reason: string): void;
}

export function createMemoryRepository(initial: unknown | null = null): MemoryRepository {
  let failure: string | null = null;
  const repo: MemoryRepository = {
    saved: initial,
    load: () => Promise.resolve(repo.saved),
    save: (workspace) => {
      if (failure !== null) {
        const reason = failure;
        failure = null;
        return Promise.reject(new Error(reason));
      }
      repo.saved = workspace;
      return Promise.resolve();
    },
    failNextSave: (reason) => {
      failure = reason;
    },
  };
  return repo;
}
