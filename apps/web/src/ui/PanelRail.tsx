import { useT } from '../i18n';
import { IconChevronLeft, IconChevronRight } from './icons';
import './panels.css';

interface PanelRailProps {
  /** Shown vertically on the rail, e.g. "Projects". */
  label: string;
  side: 'left' | 'right';
  onExpand: () => void;
  className?: string;
}

/** What a collapsed side panel leaves behind: a slim rail that opens it again. */
export function PanelRail({ label, side, onExpand, className }: PanelRailProps) {
  const Icon = side === 'left' ? IconChevronRight : IconChevronLeft;
  const m = useT();
  return (
    <aside className={`panel-rail panel-rail--${side} glass${className ? ` ${className}` : ''}`} aria-label={m.panels.collapsed(label)}>
      <button type="button" className="icon-btn" aria-label={m.panels.show(label)} aria-expanded={false} title={m.panels.show(label)} onClick={onExpand}>
        <Icon />
      </button>
      <span className="panel-rail__label" aria-hidden="true" onClick={onExpand}>
        {label}
      </span>
    </aside>
  );
}

/** The tab on a panel's inner edge that collapses it. */
export function PanelCollapseTab({ label, side, onCollapse, className }: { label: string; side: 'left' | 'right'; onCollapse: () => void; className?: string }) {
  const Icon = side === 'left' ? IconChevronLeft : IconChevronRight;
  const m = useT();
  return (
    <button
      type="button"
      className={`panel-tab panel-tab--${side} glass${className ? ` ${className}` : ''}`}
      aria-label={m.panels.hide(label)}
      aria-expanded
      title={m.panels.hide(label)}
      onClick={onCollapse}
    >
      <Icon />
    </button>
  );
}
