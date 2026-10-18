import type { ReactNode } from 'react';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { BrandPanel } from './brand/BrandPanel';
import './auth.css';

/** The two-panel page behind sign-in and "choose your own password": brand on one side, the card on the other. */
export function AuthShell({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <div className="signin">
      <BrandPanel />
      <main className="signin__panel" aria-labelledby={labelledBy}>
        <div className="signin__lang">
          <LanguageSwitch />
        </div>
        <div className="signin__stage">{children}</div>
      </main>
    </div>
  );
}
