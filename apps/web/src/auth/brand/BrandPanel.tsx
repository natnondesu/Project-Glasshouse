import { useT } from '../../i18n';
import { RoomIllustration } from './RoomIllustration';
import './brand-panel.css';

const STEP_FIRST_DELAY_S = 0.9;
const STEP_STAGGER_S = 0.12;

/** The ink-coloured half of the sign-in page. Under ~900 px it shrinks to a band: lockup and headline only (brand-panel.css). */
export function BrandPanel() {
  const m = useT();
  const { headline, sub, steps, footer, illustration, captions } = m.auth.brand;
  return (
    <aside className="signin-brand">
      <img className="signin-brand__lockup" src="/brand/glasshouse-lockup-horizontal-dark.svg" width="200" height="54" alt="Glasshouse" />
      <div className="signin-brand__copy">
        <p className="signin-brand__headline">{headline}</p>
        <p className="signin-brand__sub">{sub}</p>
      </div>
      <ol className="signin-brand__steps">
        {steps.map((label, i) => (
          <li key={label} className="signin-brand__step" style={{ animationDelay: `${(STEP_FIRST_DELAY_S + STEP_STAGGER_S * i).toFixed(2)}s` }}>
            <span className="signin-brand__step-n">{String(i + 1).padStart(2, '0')}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="signin-brand__stage">
        <RoomIllustration label={illustration} captions={captions} />
      </div>
      <p className="signin-brand__footer">{footer}</p>
    </aside>
  );
}
