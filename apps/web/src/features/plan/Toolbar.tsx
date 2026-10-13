import { Fragment } from 'react';
import { TOOLS, type Tool } from './tools';

const VIEW_ONLY = new Set<Tool>(['select', 'pan', 'measure']);

export function Toolbar({ tool, onTool, readOnly = false }: { tool: Tool; onTool: (tool: Tool) => void; readOnly?: boolean }) {
  const tools = readOnly ? TOOLS.filter((t) => VIEW_ONLY.has(t.id)) : TOOLS;
  return (
    <div className="toolbar glass" role="toolbar" aria-label="Plan tools" aria-orientation="vertical">
      {tools.map((spec, i) => (
        <Fragment key={spec.id}>
          {i > 0 && tools[i - 1]?.group !== spec.group ? <span className="toolbar__sep" aria-hidden="true" /> : null}
          <button
            type="button"
            className="tool"
            aria-pressed={tool === spec.id}
            aria-label={spec.label}
            title={spec.shortcut ? `${spec.label} (${spec.shortcut})` : spec.label}
            onClick={() => onTool(spec.id)}
          >
            <spec.Icon />
          </button>
        </Fragment>
      ))}
    </div>
  );
}
