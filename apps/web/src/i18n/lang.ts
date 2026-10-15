import { create } from 'zustand';
import type { Messages } from './en';

export type Lang = 'en' | 'th';

const KEY = 'glasshouse:lang';

function storedLang(): Lang {
  // Storage can be unavailable (private windows, blocked site data); English is a safe default.
  try {
    return localStorage.getItem(KEY) === 'th' ? 'th' : 'en';
  } catch {
    return 'en';
  }
}

// Thai is its own chunk: English users never download it. `lang` only becomes 'th' once it has loaded.
let thai: Messages | null = null;
export const loadedThai = (): Messages | null => thai;

async function ensure(lang: Lang): Promise<void> {
  if (lang === 'th' && !thai) thai = (await import('./th')).th;
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
}

export const useLangStore = create<LangState>((set) => ({
  lang: 'en',
  setLang: async (lang) => {
    await ensure(lang);
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // Not remembered this time; the switch still applies for this visit.
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

/** Before the first render: load the remembered language so Thai users never see English first. */
export async function loadStoredLang(): Promise<void> {
  const lang = storedLang();
  await ensure(lang);
  useLangStore.setState({ lang });
  document.documentElement.lang = lang;
}
