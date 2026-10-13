import { Fragment } from 'react';
import { TOOLS, type Tool } from './tools';

export function Toolbar({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Plan tools" aria-orientation="vertical">
      {TOOLS.map((spec, i) => (
        <Fragment key={spec.id}>
          {i > 0 && TOOLS[i - 1]?.group !== spec.group ? <span className="toolbar__sep" aria-hidden="true" /> : null}
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
