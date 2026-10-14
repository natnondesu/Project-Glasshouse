import { en, type Messages } from './en';
import { useLangStore, type Lang } from './lang';
import { th } from './th';

export type { Messages } from './en';
export { useLangStore, syncDocumentLang, type Lang } from './lang';

export const messagesFor = (lang: Lang): Messages => (lang === 'th' ? th : en);

/** The active language's messages. Parameterised entries are functions, so Thai can order words its own way. */
export function useT(): Messages {
  return messagesFor(useLangStore((s) => s.lang));
}
