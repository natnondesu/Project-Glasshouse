import { useEffect, useState } from 'react';
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from './theme';

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);
  useEffect(() => applyThemeChoice(choice), [choice]);
  return (
    <button type="button" className="btn btn--sm btn--quiet" onClick={() => setChoice(NEXT[choice])} aria-label={`Theme: ${LABEL[choice]}. Change theme`}>
      Theme · {LABEL[choice]}
    </button>
  );
}
