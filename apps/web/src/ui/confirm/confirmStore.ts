import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  /** What happens, in a sentence: what goes, and whether undo brings it back. */
  body: string;
  confirmLabel: string;
  /** Removals are red; a change that adds or grows something is the ordinary primary button. */
  tone?: 'danger' | 'primary';
}

interface ConfirmState {
  request: ConfirmRequest | null;
  resolve: ((ok: boolean) => void) | null;
  ask: (request: ConfirmRequest) => Promise<boolean>;
  answer: (ok: boolean) => void;
}

/** One confirmation at a time, shown by <ConfirmDialog> in the app shell. A new ask cancels an open one. */
export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  request: null,
  resolve: null,
  ask: (request) =>
    new Promise<boolean>((resolve) => {
      get().resolve?.(false);
      set({ request, resolve });
    }),
  answer: (ok) => {
    const { resolve } = get();
    set({ request: null, resolve: null });
    resolve?.(ok);
  },
}));

export const confirmAction = (request: ConfirmRequest): Promise<boolean> => useConfirmStore.getState().ask(request);
