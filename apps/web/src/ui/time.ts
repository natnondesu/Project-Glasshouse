import { useLangStore } from '../i18n/lang';

/** Thai dates keep the Gregorian year so they match file names and other documents (2026, not 2569). */
const LOCALE = { en: undefined, th: 'th-TH-u-ca-gregory' } as const;

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(LOCALE[useLangStore.getState().lang], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** A calendar day without the time, for "archived on". */
export function formatDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(LOCALE[useLangStore.getState().lang], { day: '2-digit', month: 'short', year: 'numeric' });
}
