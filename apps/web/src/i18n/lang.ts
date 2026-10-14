import { create } from 'zustand';

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

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: storedLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // Not remembered this time; the switch still applies for this visit.
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

/** Tests and first paint: put `<html lang>` in step with the stored choice. */
export function syncDocumentLang(): void {
  document.documentElement.lang = useLangStore.getState().lang;
}
