import { useLangStore } from './lang';

/** EN / ไทย in the title bar, remembered per browser. Each label is in its own language. */
export function LanguageSwitch() {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  return (
    <div className="seg seg--compact lang-switch" role="group" aria-label="Language / ภาษา">
      <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => void setLang('en')}>
        EN
      </button>
      <button type="button" lang="th" aria-pressed={lang === 'th'} onClick={() => void setLang('th')}>
        ไทย
      </button>
    </div>
  );
}
