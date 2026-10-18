import { isInUse, loadA, panelLayout, panelNumbering, panelOf, rackCurrentA, wayPhase, type PanelLayout, type PanelPatch, type PlanContent, type RoomObject, type WayNumbering } from '@glasshouse/domain';
import { useState } from 'react';
import { useFloatingPanel } from '../../ui/useFloatingPanel';
import { IconGrip } from '../../ui/icons';
import { useT } from '../../i18n';
import { feedColor } from './feeds';
import { PanelFace } from './PanelFace';
import type { CommitFn } from './usePlanGestures';
import './panel-manager.css';

const RATINGS_A = [6, 10, 16, 20, 25, 32, 40, 50, 63];
const WAY_COUNTS = [4, 6, 8, 10, 12, 14, 16, 18, 24, 36, 48, 60, 72];
const LAYOUTS: PanelLayout[] = ['row', 'column', 'two_column'];
const NUMBERINGS: WayNumbering[] = ['odd_even', 'sequential'];

interface PanelManagerProps {
  panel: RoomObject;
  content: PlanContent;
  commit: CommitFn;
  onClose: () => void;
  readOnly?: boolean;
}

/** The panel ends this far above the bottom of the plan, wherever it was dragged to. */
const PANEL_BOTTOM_GAP_PX = 12;

/** Floating MCB panel manager: the panel face as it looks on the wall, and the picked breaker's rating, label and feed. */
export function PanelManager({ panel, content, commit, onClose, readOnly = false }: PanelManagerProps) {
  const config = panelOf(panel);
  const m = useT();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState(1);
  const { pos, headProps } = useFloatingPanel('glasshouse:panel-manager-pos', { x: 96, y: 72 });
  const feeds = content.feeds.filter((f) => f.sourceId === panel.id);
  const unassigned = feeds.filter((f) => f.way === undefined).length;
  const rackName = (id: string): string => content.objects.find((o) => o.id === id)?.name ?? m.feeds.removedObject;
  const act = (problem: string | null): void => setError(problem);
  const configure = (patch: PanelPatch): void => act(commit({ type: 'panel/configure', id: panel.id, patch }));
  const inUse = isInUse(panel);
  const layout = panelLayout(config);
  const n = Math.min(picked, config.ways.length);
  const way = config.ways[n - 1]!;
  const feed = feeds.find((f) => f.way === n);
  const target = feed ? content.objects.find((o) => o.id === feed.targetId) : undefined;
  // A way feeding another source (UPS, PDU…) carries everything downstream of it.
  const amps = !target ? 0 : target.type === 'rack' ? rackCurrentA(target) : loadA(content, target.id);

  return (
    <section className="panel-mgr glass" role="dialog" aria-label={m.panelMgr.title(panel.name)} style={{ left: pos.x, top: pos.y, maxHeight: `calc(100% - ${pos.y + PANEL_BOTTOM_GAP_PX}px)` }}>
      <header className="panel-mgr__head" title={m.panels.dragToMove} {...headProps}>
        <IconGrip className="panel-mgr__grip" />
        <h2>
          <span className="mono">{m.panelMgr.title(panel.name)}</span>
        </h2>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={m.panelMgr.close(panel.name)} onClick={onClose}>
          ×
        </button>
      </header>
      {/* Frozen: the edit controls lock, but the breaker tiles and the close button stay live so every way can still be read. */}
      <fieldset className="inspector__lock panel-mgr__body" disabled={readOnly}>
        <div className="panel-mgr__config">
          <label className="panel-mgr__use">
            <input type="checkbox" role="switch" checked={inUse} onChange={(e) => configure({ inUse: e.target.checked })} />
            <span className="panel-mgr__switch" aria-hidden="true" />
            <span>{m.panelMgr.inUse}</span>
          </label>
          <div className="seg seg--compact" role="group" aria-label={m.panelMgr.phase}>
            <button type="button" aria-pressed={config.phase === 'single'} onClick={() => configure({ phase: 'single' })}>
              {m.panelMgr.single}
            </button>
            <button type="button" aria-pressed={config.phase === 'three'} onClick={() => configure({ phase: 'three' })}>
              {m.panelMgr.three}
            </button>
          </div>
          <label className="panel-mgr__count">
            <span>{m.panelMgr.ways}</span>
            <select value={config.ways.length} onChange={(e) => configure({ wayCount: Number(e.target.value) })}>
              {[...new Set([...WAY_COUNTS, config.ways.length])].sort((a, b) => a - b).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="panel-mgr__count">
            <span>{m.panelMgr.layout}</span>
            <select value={layout} onChange={(e) => configure({ layout: e.target.value as PanelLayout })}>
              {LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {m.panelMgr.layoutOption[l]}
                </option>
              ))}
            </select>
          </label>
          {layout === 'two_column' ? (
            <label className="panel-mgr__count">
              <span>{m.panelMgr.numbering}</span>
              <select value={panelNumbering(config)} onChange={(e) => configure({ numbering: e.target.value as WayNumbering })}>
                {NUMBERINGS.map((o) => (
                  <option key={o} value={o}>
                    {m.panelMgr.numberingOption[o]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <MainRating key={config.mainRatingA ?? 'none'} value={config.mainRatingA} onCommit={(mainRatingA) => configure({ mainRatingA })} />
        </div>
        {!inUse && feeds.length > 0 ? (
          <p role="status" className="panel-mgr__warn">
            {m.panelMgr.stillWired(feeds.length, feeds.map((f) => m.feeds.feedOf(f.label, rackName(f.targetId))).join(', '))}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="field__error panel-mgr__error">
            {error}
          </p>
        ) : null}
      </fieldset>
      <div className="panel-mgr__scroll">
        <PanelFace name={panel.name} config={config} content={content} feeds={feeds} inUse={inUse} selected={n} onSelect={setPicked} />
      </div>
      <section className="panel-mgr__way" aria-label={m.panelMgr.editing(n, wayPhase(config, n))}>
        <h3 className="mono">{m.panelMgr.editing(n, wayPhase(config, n))}</h3>
        <fieldset className="inspector__lock panel-mgr__body" disabled={readOnly}>
          <select aria-label={m.panelMgr.wayRating(n)} value={way.ratingA} onChange={(e) => act(commit({ type: 'panel/way', id: panel.id, way: n, patch: { ratingA: Number(e.target.value) } }))}>
            {[...new Set([...RATINGS_A, way.ratingA])].sort((a, b) => a - b).map((a) => (
              <option key={a} value={a}>{`${a} A`}</option>
            ))}
          </select>
          <WayLabel key={`${n}:${way.label}`} n={n} value={way.label} onCommit={(label) => act(commit({ type: 'panel/way', id: panel.id, way: n, patch: { label } }))} />
          <span className="panel-mgr__feed">
            {feed ? <span className="panel-mgr__swatch" style={{ background: feedColor(feed, content) }} aria-hidden="true" /> : null}
            <select
              aria-label={m.panelMgr.wayFeed(n)}
              disabled={!inUse}
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
                  <option key={f.id} value={f.id}>{`${rackName(f.targetId)} · ${f.label}`}</option>
                ))}
            </select>
          </span>
          {inUse ? null : <span className="panel-mgr__off-note">{m.panelMgr.feedOff}</span>}
          <span className={`mono panel-mgr__load${amps > way.ratingA ? ' is-over' : ''}`}>{feed ? `${amps.toFixed(1)} / ${way.ratingA} A` : ''}</span>
        </fieldset>
      </section>
      <footer className="panel-mgr__foot">
        {unassigned > 0 ? m.panelMgr.unassigned(unassigned) : m.panelMgr.allAssigned}
        <span className="panel-mgr__note">{m.panelMgr.loadNote}</span>
      </footer>
    </section>
  );
}

/** Optional main breaker rating: emptied clears it. */
function MainRating({ value, onCommit }: { value: number | undefined; onCommit: (rating: number | null) => void }) {
  const m = useT();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const save = (): void => {
    const next = text.trim() === '' ? null : Number(text);
    if (next !== (value ?? null)) onCommit(next);
  };
  return (
    <label className="panel-mgr__count">
      <span>{m.panelMgr.main}</span>
      <input
        className="panel-mgr__main"
        aria-label={m.panelMgr.main}
        type="number"
        inputMode="decimal"
        min={1}
        max={630}
        step="any"
        placeholder={m.panelMgr.mainNone}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
      />
      <span>{m.panelMgr.mainUnit}</span>
    </label>
  );
}

function WayLabel({ n, value, onCommit }: { n: number; value: string; onCommit: (label: string) => void }) {
  const [text, setText] = useState(value);
  const m = useT();
  const save = (): void => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      aria-label={m.panelMgr.wayLabel(n)}
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
