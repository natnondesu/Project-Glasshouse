import { panelLayout, wayPhase, wayPosition, type PanelConfig, type PlanContent, type PowerFeed } from '@glasshouse/domain';
import { useRef, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { feedColor } from './feeds';
import './panel-face.css';

interface PanelFaceProps {
  name: string;
  config: PanelConfig;
  content: PlanContent;
  feeds: PowerFeed[];
  inUse: boolean;
  selected: number;
  onSelect: (way: number) => void;
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** The panel's face as it hangs on the wall: main breaker on top when set, then the breakers in their arrangement. */
export function PanelFace({ name, config, content, feeds, inUse, selected, onSelect }: PanelFaceProps) {
  const m = useT();
  const grid = useRef<HTMLDivElement>(null);
  const layout = panelLayout(config);
  const at = new Map(config.ways.map((_, i) => [JSON.stringify(wayPosition(config, i + 1)), i + 1]));
  const rackName = (id: string): string => content.objects.find((o) => o.id === id)?.name ?? m.feeds.removedObject;

  const move = (e: KeyboardEvent<HTMLButtonElement>, n: number): void => {
    const step = ARROWS[e.key];
    if (!step) return;
    const from = wayPosition(config, n);
    const next = at.get(JSON.stringify({ column: from.column + step[0], row: from.row + step[1] }));
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    grid.current?.querySelector<HTMLElement>(`[data-way="${next}"]`)?.focus();
  };

  return (
    <div className={`panel-face panel-face--${layout}${inUse ? '' : ' is-off'}`} role="group" aria-label={m.panelMgr.face(name)}>
      {config.mainRatingA !== undefined ? (
        <div className="panel-face__main" role="img" aria-label={m.panelMgr.mainTile(config.mainRatingA)}>
          <span className="panel-face__main-lever" aria-hidden="true" />
          <span className="mono">{`${config.mainRatingA} A`}</span>
        </div>
      ) : null}
      <div ref={grid} className="panel-face__grid">
        {config.ways.map((way, i) => {
          const n = i + 1;
          const pos = wayPosition(config, n);
          const feed = feeds.find((f) => f.way === n);
          const phase = wayPhase(config, n);
          const feedText = feed ? m.feeds.feedOf(feed.label, rackName(feed.targetId)) : null;
          return (
            <button
              key={n}
              type="button"
              data-way={n}
              className={`way-tile${n === selected ? ' is-selected' : ''}${feed ? ' is-fed' : ''}${layout === 'two_column' && pos.column === 1 ? ' is-right' : ''}`}
              style={{ gridColumnStart: pos.column + 1, gridRowStart: pos.row + 1 }}
              tabIndex={n === selected ? 0 : -1}
              aria-pressed={n === selected}
              aria-label={m.panelMgr.tile(n, way.ratingA, phase, feedText, way.label)}
              onClick={(e) => {
                onSelect(n);
                // Safari doesn't focus a clicked button; without this the arrow keys still drive whatever had focus before.
                e.currentTarget.focus();
              }}
              onKeyDown={(e) => move(e, n)}
            >
              <span className="way-tile__lever" aria-hidden="true" />
              <span className="way-tile__head">
                <span className="way-tile__n mono">{n}</span>
                <span className="way-tile__spec mono">
                  <span>{`${way.ratingA} A`}</span>
                  <span>{phase}</span>
                </span>
              </span>
              {feed ? (
                <span className="way-tile__feed">
                  <span className="way-tile__swatch" style={{ background: feedColor(feed, content) }} aria-hidden="true" />
                  <span>{rackName(feed.targetId)}</span>
                  <span>{feed.label}</span>
                </span>
              ) : (
                <span className="way-tile__feed is-spare">{m.panelMgr.spare}</span>
              )}
              {way.label ? <span className="way-tile__label">{way.label}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
