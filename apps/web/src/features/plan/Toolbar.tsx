import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { IconChevronCorner } from '../../ui/icons';
import { useT } from '../../i18n';
import { SOLO_TOOLS, TOOL_GROUPS, TOOL_SPECS, type Tool } from './tools';

const VIEW_ONLY: Tool[] = ['select', 'pan', 'measure'];

/** The hint card beside a tool: what it is, what it does, and its key. */
function Hint({ tool, id }: { tool: Tool; id: string }) {
  const spec = TOOL_SPECS[tool];
  const words = useT().tools.spec[tool];
  return (
    <span className="tool-hint" role="tooltip" id={id}>
      <strong>{words.label}</strong>
      <span>{words.hint}</span>
      {spec.shortcut ? <kbd>{spec.shortcut}</kbd> : null}
    </span>
  );
}

interface ToolButtonProps {
  /** Whose icon the button wears; clicking it picks this tool. */
  tool: Tool;
  active: boolean;
  onTool: (tool: Tool) => void;
  /** A group button names the variant that is active, while the icon stays the group's default. */
  label?: string;
  /** The tool the hint describes; the active variant for a group button. */
  hintTool?: Tool;
  hintHidden?: boolean;
}

function ToolButton({ tool, active, onTool, label, hintTool = tool, hintHidden = false }: ToolButtonProps) {
  const spec = TOOL_SPECS[tool];
  const defaultName = useT().tools.spec[tool].label;
  const name = label ?? defaultName;
  const [hover, setHover] = useState(false);
  const hintId = `hint-${hintTool}`;
  const hinted = hover && !hintHidden;
  return (
    <span className="tool-cell" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className="tool"
        aria-pressed={active}
        aria-label={name}
        aria-describedby={hinted ? hintId : undefined}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onClick={() => onTool(tool)}
      >
        <spec.Icon />
      </button>
      {hinted ? <Hint tool={hintTool} id={hintId} /> : null}
    </span>
  );
}

interface GroupProps {
  group: (typeof TOOL_GROUPS)[number];
  tool: Tool;
  onTool: (tool: Tool) => void;
}

function Group({ group, tool, onTool }: GroupProps) {
  const [open, setOpen] = useState(false);
  const cell = useRef<HTMLSpanElement>(null);
  const m = useT();
  const groupLabel = m.tools.group[group.id];
  const face = group.tools[0]!;
  const inGroup = group.tools.includes(tool);
  const variant = inGroup && tool !== face ? tool : null;
  const flyout = useRef<HTMLSpanElement>(null);
  // Menu keys: arrows and Home/End move through the tools; Escape closes and hands focus back to the arrow that opened it.
  const onMenuKey = (e: ReactKeyboardEvent): void => {
    if (!open) return;
    const items = [...(flyout.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number): void => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      cell.current?.querySelector<HTMLElement>('.tool-group__more')?.focus();
    }
  };
  // Keyboard users land on the current tool when the list opens.
  useEffect(() => {
    if (!open) return;
    const el = flyout.current;
    (el?.querySelector<HTMLElement>('[aria-checked="true"]') ?? el?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent): void => {
      if (!cell.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <span ref={cell} className="tool-group" onKeyDown={onMenuKey}>
      <ToolButton
        tool={face}
        active={inGroup}
        onTool={onTool}
        label={variant ? m.tools.activeVariant(m.tools.spec[variant].name, groupLabel) : undefined}
        hintTool={inGroup ? tool : face}
        hintHidden={open}
      />
      {group.tools.length > 1 ? (
        <button type="button" className="tool-group__more" aria-label={m.tools.more(groupLabel)} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <IconChevronCorner />
        </button>
      ) : null}
      {open ? (
        <span ref={flyout} className="tool-flyout popover-surface" role="menu" aria-label={m.tools.groupTools(groupLabel)}>
          <span className="tool-flyout__title">{groupLabel}</span>
          {group.tools.map((t) => {
            const spec = TOOL_SPECS[t];
            return (
              <button
                key={t}
                type="button"
                role="menuitemradio"
                aria-checked={tool === t}
                className="tool-flyout__item"
                onClick={() => {
                  onTool(t);
                  setOpen(false);
                }}
              >
                <spec.Icon aria-hidden="true" />
                <span className="tool-flyout__name">{m.tools.spec[t].name}</span>
                {spec.shortcut ? <kbd aria-hidden="true">{spec.shortcut}</kbd> : null}
              </button>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}

export function Toolbar({ tool, onTool, readOnly = false }: { tool: Tool; onTool: (tool: Tool) => void; readOnly?: boolean }) {
  const m = useT();
  if (readOnly) {
    return (
      <div className="toolbar glass" role="toolbar" aria-label={m.tools.toolbar} aria-orientation="vertical">
        {VIEW_ONLY.map((t) => (
          <ToolButton key={t} tool={t} active={tool === t} onTool={onTool} />
        ))}
      </div>
    );
  }
  return (
    <div className="toolbar glass" role="toolbar" aria-label={m.tools.toolbar} aria-orientation="vertical">
      {SOLO_TOOLS.map((t) => (
        <ToolButton key={t} tool={t} active={tool === t} onTool={onTool} />
      ))}
      {TOOL_GROUPS.map((g) => (
        <span key={g.id} className="tool-group-wrap">
          <span className="toolbar__sep" aria-hidden="true" />
          <Group group={g} tool={tool} onTool={onTool} />
        </span>
      ))}
    </div>
  );
}
