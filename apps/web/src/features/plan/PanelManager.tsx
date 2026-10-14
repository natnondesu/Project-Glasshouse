import { panelOf, rackCurrentA, wayPhase, type PlanContent, type RoomObject } from '@glasshouse/domain';
import { useRef, useState, type PointerEvent } from 'react';
import { usePersistentState } from '../../ui/usePersistentState';
import { feedColor } from './feeds';
import type { CommitFn } from './usePlanGestures';
import './panel-manager.css';

const RATINGS_A = [6, 10, 16, 20, 25, 32, 40, 50, 63];
const WAY_COUNTS = [4, 6, 8, 12, 18, 24, 36, 48];

interface PanelManagerProps {
  panel: RoomObject;
  content: PlanContent;
  commit: CommitFn;
  onClose: () => void;
}

/** Floating MCB panel schedule: which feed is on which way, at what rating and phase. */
export function PanelManager({ panel, content, commit, onClose }: PanelManagerProps) {
  const config = panelOf(panel);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = usePersistentState('glasshouse:panel-manager-pos', { x: 96, y: 72 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const feeds = content.feeds.filter((f) => f.sourceId === panel.id);
  const unassigned = feeds.filter((f) => f.way === undefined).length;
  const rackName = (id: string): string => content.objects.find((o) => o.id === id)?.name ?? 'Removed rack';
  const act = (problem: string | null): void => setError(problem);

  const onGrab = (e: PointerEvent<HTMLElement>): void => {
    if ((e.target as Element).closest('button')) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDrag = (e: PointerEvent<HTMLElement>): void => {
    if (drag.current) setPos({ x: Math.max(0, e.clientX - drag.current.dx), y: Math.max(0, e.clientY - drag.current.dy) });
  };

  return (
    <section className="panel-mgr glass" role="dialog" aria-label={`${panel.name} ways`} style={{ left: pos.x, top: pos.y }}>
      <header className="panel-mgr__head" onPointerDown={onGrab} onPointerMove={onDrag} onPointerUp={() => (drag.current = null)}>
        <h2>
          <span className="mono">{panel.name}</span> ways
        </h2>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Close ${panel.name} ways`} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="panel-mgr__config">
        <div className="seg seg--compact" role="group" aria-label="Panel phase">
          <button type="button" aria-pressed={config.phase === 'single'} onClick={() => act(commit({ type: 'panel/configure', id: panel.id, patch: { phase: 'single' } }))}>
            Single-phase
          </button>
          <button type="button" aria-pressed={config.phase === 'three'} onClick={() => act(commit({ type: 'panel/configure', id: panel.id, patch: { phase: 'three' } }))}>
            Three-phase
          </button>
        </div>
        <label className="panel-mgr__count">
          <span>Ways</span>
          <select value={config.ways.length} onChange={(e) => act(commit({ type: 'panel/configure', id: panel.id, patch: { wayCount: Number(e.target.value) } }))}>
            {[...new Set([...WAY_COUNTS, config.ways.length])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="field__error panel-mgr__error">
          {error}
        </p>
      ) : null}
      <div className="panel-mgr__scroll">
        <table className="panel-mgr__table">
          <thead>
            <tr>
              <th scope="col">Way</th>
              <th scope="col">Phase</th>
              <th scope="col">Rating</th>
              <th scope="col">Label</th>
              <th scope="col">Feed</th>
              <th scope="col">Load</th>
            </tr>
          </thead>
          <tbody>
            {config.ways.map((way, i) => {
              const n = i + 1;
              const feed = feeds.find((f) => f.way === n);
              const rack = feed ? content.objects.find((o) => o.id === feed.rackId) : undefined;
              const amps = rack ? rackCurrentA(rack) : 0;
              const over = amps > way.ratingA;
              return (
                <tr key={n} className={feed ? 'is-used' : undefined}>
                  <td className="mono">{n}</td>
                  <td className="mono">{wayPhase(config, n)}</td>
                  <td>
                    <select aria-label={`Way ${n} rating`} value={way.ratingA} onChange={(e) => act(commit({ type: 'panel/way', id: panel.id, way: n, patch: { ratingA: Number(e.target.value) } }))}>
                      {[...new Set([...RATINGS_A, way.ratingA])].sort((a, b) => a - b).map((a) => (
                        <option key={a} value={a}>{`${a} A`}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <WayLabel key={way.label} n={n} value={way.label} onCommit={(label) => act(commit({ type: 'panel/way', id: panel.id, way: n, patch: { label } }))} />
                  </td>
                  <td>
                    <span className="panel-mgr__feed">
                      {feed ? <span className="panel-mgr__swatch" style={{ background: feedColor(feed, content) }} aria-hidden="true" /> : null}
                      <select
                        aria-label={`Way ${n} feed`}
                        value={feed?.id ?? ''}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next) act(commit({ type: 'feed/update', id: next, patch: { way: n } }));
                          else if (feed) act(commit({ type: 'feed/update', id: feed.id, patch: { way: null } }));
                        }}
                      >
                        <option value="">—</option>
                        {feeds
                          .filter((f) => f.way === undefined || f.way === n)
                          .map((f) => (
                            <option key={f.id} value={f.id}>{`${rackName(f.rackId)} · ${f.label}`}</option>
                          ))}
                      </select>
                    </span>
                  </td>
                  <td className={`mono panel-mgr__load${over ? ' is-over' : ''}`}>{feed ? `${amps.toFixed(1)} / ${way.ratingA} A` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="panel-mgr__foot">
        {unassigned > 0 ? `${unassigned} ${unassigned === 1 ? 'feed' : 'feeds'} from this panel ${unassigned === 1 ? 'has' : 'have'} no way yet.` : 'Every feed from this panel is on a way.'}
        <span className="panel-mgr__note">Load assumes 230 V with each feed carrying the whole rack.</span>
      </footer>
    </section>
  );
}

function WayLabel({ n, value, onCommit }: { n: number; value: string; onCommit: (label: string) => void }) {
  const [text, setText] = useState(value);
  const save = (): void => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      aria-label={`Way ${n} label`}
      className="panel-mgr__label"
      value={text}
      placeholder="—"
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
      }}
    />
  );
}
