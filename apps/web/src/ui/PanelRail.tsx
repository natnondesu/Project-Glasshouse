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
  return (
    <aside className={`panel-rail panel-rail--${side} glass${className ? ` ${className}` : ''}`} aria-label={`${label} (collapsed)`}>
      <button type="button" className="icon-btn" aria-label={`Show ${label.toLowerCase()}`} aria-expanded={false} title={`Show ${label.toLowerCase()}`} onClick={onExpand}>
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
  return (
    <button
      type="button"
      className={`panel-tab panel-tab--${side} glass${className ? ` ${className}` : ''}`}
      aria-label={`Hide ${label.toLowerCase()}`}
      aria-expanded
      title={`Hide ${label.toLowerCase()}`}
      onClick={onCollapse}
    >
      <Icon />
    </button>
  );
}
