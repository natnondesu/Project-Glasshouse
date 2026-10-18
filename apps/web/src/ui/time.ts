import { useLangStore, type Lang } from '../i18n/lang';

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

const MINUTE_S = 60;
const HOUR_S = 3600;
const DAY_S = 86_400;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
const YEAR_DAYS = 365;
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();
/** "yesterday" reads well; "last week" after "Last signed in" does not, so only days use words. */
const relativeFormat = (lang: Lang, numeric: 'auto' | 'always'): Intl.RelativeTimeFormat => {
  const key = `${lang}:${numeric}`;
  let rtf = relativeFormats.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(lang, { numeric });
    relativeFormats.set(key, rtf);
  }
  return rtf;
};

/** "3 days ago" / "3 วันที่ผ่านมา" in the largest whole unit; null within the last minute, so the caller can say "just now". */
export function relativeTime(iso: string, now: number, lang: Lang): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, (now - then) / 1000);
  if (seconds < MINUTE_S) return null;
  const rtf = relativeFormat(lang, 'always');
  const days = Math.floor(seconds / DAY_S);
  if (seconds < HOUR_S) return rtf.format(-Math.floor(seconds / MINUTE_S), 'minute');
  if (seconds < DAY_S) return rtf.format(-Math.floor(seconds / HOUR_S), 'hour');
  if (days < WEEK_DAYS) return relativeFormat(lang, 'auto').format(-days, 'day');
  if (days < MONTH_DAYS) return rtf.format(-Math.floor(days / WEEK_DAYS), 'week');
  if (days < YEAR_DAYS) return rtf.format(-Math.floor(days / MONTH_DAYS), 'month');
  return rtf.format(-Math.floor(days / YEAR_DAYS), 'year');
}
