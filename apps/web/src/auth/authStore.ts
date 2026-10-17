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
  /** Re-reads who the server says I am, so a role changed by an admin applies without signing in again. */
  refresh: () => Promise<void>;
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
  refresh: async () => {
    const user = await getMe();
    if (user === null) return set({ status: 'signed-out', user: null, sessionEnded: true });
    set({ user, status: user.mustChangePassword ? 'must-change' : 'signed-in' });
  },
}));

export const resetAuthStore = (): void => useAuthStore.setState({ ...initial });
