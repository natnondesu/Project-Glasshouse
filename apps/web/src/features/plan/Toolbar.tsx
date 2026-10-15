import { useEffect, useRef, useState } from 'react';
import { IconChevronCorner } from '../../ui/icons';
import { usePersistentState } from '../../ui/usePersistentState';
import { useT } from '../../i18n';
import { SOLO_TOOLS, TOOL_GROUPS, TOOL_SPECS, type Tool, type ToolGroupId } from './tools';

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
  tool: Tool;
  active: boolean;
  onTool: (tool: Tool) => void;
  /** A group's face opens its list instead of picking straight away. */
  menu?: { open: boolean; onToggle: () => void };
}

function ToolButton({ tool, active, onTool, menu }: ToolButtonProps) {
  const spec = TOOL_SPECS[tool];
  const label = useT().tools.spec[tool].label;
  const [hover, setHover] = useState(false);
  const hintId = `hint-${tool}`;
  return (
    <span className="tool-cell" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className="tool"
        aria-pressed={active}
        aria-label={label}
        aria-describedby={hover && !menu?.open ? hintId : undefined}
        {...(menu ? { 'aria-haspopup': 'menu' as const, 'aria-expanded': menu.open } : {})}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onClick={() => (menu ? menu.onToggle() : onTool(tool))}
      >
        <spec.Icon />
      </button>
      {hover && !menu?.open ? <Hint tool={tool} id={hintId} /> : null}
    </span>
  );
}

interface GroupProps {
  group: (typeof TOOL_GROUPS)[number];
  tool: Tool;
  current: Tool;
  onTool: (tool: Tool) => void;
}

function Group({ group, tool, current, onTool }: GroupProps) {
  const [open, setOpen] = useState(false);
  const cell = useRef<HTMLSpanElement>(null);
  const m = useT();
  const groupLabel = m.tools.group[group.id];
  const flyout = useRef<HTMLSpanElement>(null);
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
    <span ref={cell} className="tool-group" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      {/* Clicking the group always shows its tools: many people never find the corner arrow. */}
      <ToolButton tool={current} active={tool === current} onTool={onTool} menu={group.tools.length > 1 ? { open, onToggle: () => setOpen((o) => !o) } : undefined} />
      {group.tools.length > 1 ? (
        <button type="button" className="tool-group__more" aria-label={m.tools.more(groupLabel)} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <IconChevronCorner />
        </button>
      ) : null}
      {open ? (
        <span ref={flyout} className="tool-flyout glass" role="menu" aria-label={m.tools.groupTools(groupLabel)}>
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
  const [last, setLast] = usePersistentState<Partial<Record<ToolGroupId, Tool>>>('glasshouse:tool-groups', {});
  const choose = (t: Tool): void => {
    const group = TOOL_GROUPS.find((g) => g.tools.includes(t));
    if (group && last[group.id] !== t) setLast({ ...last, [group.id]: t });
    onTool(t);
  };
  // A tool picked by keyboard shortcut also becomes its group's face.
  const faceOf = (g: (typeof TOOL_GROUPS)[number]): Tool => (g.tools.includes(tool) ? tool : last[g.id] && g.tools.includes(last[g.id]!) ? last[g.id]! : g.tools[0]!);

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
        <ToolButton key={t} tool={t} active={tool === t} onTool={choose} />
      ))}
      {TOOL_GROUPS.map((g) => (
        <span key={g.id} className="tool-group-wrap">
          <span className="toolbar__sep" aria-hidden="true" />
          <Group group={g} tool={tool} current={faceOf(g)} onTool={choose} />
        </span>
      ))}
    </div>
  );
}
