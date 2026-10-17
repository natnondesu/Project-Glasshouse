import { en, type Messages } from './en';
import { loadedThai, useLangStore, type Lang } from './lang';

export type { Messages } from './en';
export { useLangStore, loadStoredLang } from './lang';

export const messagesFor = (lang: Lang): Messages => (lang === 'th' ? (loadedThai() ?? en) : en);

/** The active language's messages. Parameterised entries are functions, so Thai can order words its own way. */
export function useT(): Messages {
  return messagesFor(useLangStore((s) => s.lang));
}
