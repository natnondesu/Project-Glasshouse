import { createStore, get, set } from 'idb-keyval';
import type { Repository } from './repository';

const KEY = 'current';

function createIdbRepository(dbName = 'glasshouse'): Repository {
  const store = createStore(dbName, 'workspace');
  return {
    load: async () => (await get<unknown>(KEY, store)) ?? null,
    save: async (workspace) => {
      await set(KEY, workspace, store);
    },
  };
}

export const idbRepository = createIdbRepository();
