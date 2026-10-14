import { feedRoute, isPowerSource, newId, nextFeedLabel, panelOf, type PlanContent, type PowerFeed, type RoomObject } from '@glasshouse/domain';
import { useState } from 'react';
import { IconPlus, IconTrash } from '../../ui/icons';
import { toScreen, type View } from '../../viewport/math';
import type { CommitFn } from './usePlanGestures';
import { useT } from '../../i18n';

/** Feed colours by letter: A blue, B amber, C green, D violet, then repeat. */
const FEED_COLORS = ['#1c64c8', '#c77700', '#11795a', '#7a4fc2'];

export function feedLetter(feed: PowerFeed, content: Pick<PlanContent, 'feeds'>): string {
  const m = /([A-Z])$/.exec(feed.label.trim());
  if (m) return m[1]!;
  return String(content.feeds.filter((f) => f.targetId === feed.targetId).indexOf(feed) + 1);
}

export function feedColor(feed: PowerFeed, content: Pick<PlanContent, 'feeds'>): string {
  const letter = feedLetter(feed, content);
  const i = /[A-Z]/.test(letter) ? letter.charCodeAt(0) - 65 : Number(letter) - 1;
  return FEED_COLORS[((i % FEED_COLORS.length) + FEED_COLORS.length) % FEED_COLORS.length]!;
}

const TAG_R_PX = 8;

/** Power runs on the drawing: dashed coloured lines from each panel, tagged with the feed letter at the rack. */
export function FeedLayer({ content, view }: { content: PlanContent; view: View }) {
  return (
    <g className="feeds" aria-hidden="true">
      {content.feeds.map((feed) => {
        const route = feedRoute(content, feed);
        if (!route || route.length < 2) return null;
        const pts = route.map((p) => toScreen(view, p));
        const color = feedColor(feed, content);
        const [ex, ey] = pts[pts.length - 2]!;
        const [tx, ty] = pts[pts.length - 1]!;
        // Tag a little way back from the rack, on the last leg, so tags of several feeds don't stack.
        const k = Math.min(0.5, 22 / (Math.hypot(tx - ex, ty - ey) || 1));
        const tag = [tx + (ex - tx) * k, ty + (ey - ty) * k];
        return (
          <g key={feed.id} className="feed" style={{ color }}>
            <polyline className="feed__run" points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />
            <circle className="feed__source" cx={pts[0]![0]} cy={pts[0]![1]} r={3} />
            <circle className="feed__tag-bg" cx={tag[0]} cy={tag[1]} r={TAG_R_PX} />
            <text className="feed__tag" x={tag[0]} y={tag[1]} textAnchor="middle" dominantBaseline="central">
              {feedLetter(feed, content)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** A rack's feeds in its inspector: which panel each comes from, add and remove. */
export function RackFeeds({ rack, content, commit }: { rack: RoomObject; content: PlanContent; commit: CommitFn }) {
  const [error, setError] = useState<string | null>(null);
  const m = useT();
  const panels = content.objects.filter(isPowerSource);
  const feeds = content.feeds.filter((f) => f.targetId === rack.id);
  const act = (problem: string | null): void => setError(problem);
  return (
    <fieldset className="inspector__group" aria-label={m.feeds.group}>
      <legend className="lbl">{m.feeds.group}</legend>
      {feeds.length === 0 ? <p className="inspector__note">{m.feeds.notConnected}</p> : null}
      <ul className="feed-list">
        {feeds.map((f) => (
          <li key={f.id} className="feed-list__item">
            <span className="feed-list__swatch" style={{ background: feedColor(f, content) }} aria-hidden="true" />
            <label className="feed-list__label" htmlFor={`${f.id}-source`}>
              {f.label}
            </label>
            <select
              id={`${f.id}-source`}
              aria-label={m.feeds.source(f.label)}
              className="feed-list__select"
              value={f.sourceId}
              onChange={(e) => act(commit({ type: 'feed/update', id: f.id, patch: { sourceId: e.target.value } }))}
            >
              {panels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {content.objects.find((o) => o.id === f.sourceId)?.type === 'mcb' ? (
              <WayPicker feed={f} content={content} onPick={(way) => act(commit({ type: 'feed/update', id: f.id, patch: { way } }))} />
            ) : (
              <span />
            )}
            <button type="button" className="icon-btn icon-btn--sm" aria-label={m.feeds.remove(f.label)} title={m.feeds.remove(f.label)} onClick={() => act(commit({ type: 'feed/remove', id: f.id }))}>
              <IconTrash />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn--sm"
        disabled={panels.length === 0}
        onClick={() => act(commit({ type: 'feed/add', feed: { id: newId(), targetId: rack.id, sourceId: panels[0]!.id, label: nextFeedLabel(content, rack.id) } }))}
      >
        <IconPlus />
        {m.feeds.add}
      </button>
      {panels.length === 0 ? <p className="inspector__note">{m.feeds.needSource}</p> : null}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** The MCB way a feed is wired to; ways taken by other feeds are shown but disabled. */
function WayPicker({ feed, content, onPick }: { feed: PowerFeed; content: PlanContent; onPick: (way: number | null) => void }) {
  const source = content.objects.find((o) => o.id === feed.sourceId)!;
  const ways = panelOf(source).ways.length;
  const m = useT();
  const taken = new Map(content.feeds.filter((f) => f.sourceId === source.id && f.id !== feed.id && f.way !== undefined).map((f) => [f.way!, f]));
  return (
    <select className="feed-list__select feed-list__way" aria-label={m.feeds.way(feed.label)} value={feed.way ?? ''} onChange={(e) => onPick(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{m.feeds.wayNone}</option>
      {Array.from({ length: ways }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n} disabled={taken.has(n)}>{m.feeds.wayOption(n, taken.has(n))}</option>
      ))}
    </select>
  );
}

/** A power source's own input: the one source upstream of it (a UPS fed from an MCB way, a PDU from a UPS…). */
function SourceInput({ panel, content, commit }: { panel: RoomObject; content: PlanContent; commit: CommitFn }) {
  const [error, setError] = useState<string | null>(null);
  const m = useT();
  const input = content.feeds.find((f) => f.targetId === panel.id);
  const upstream = content.objects.filter((o) => isPowerSource(o) && o.id !== panel.id);
  const pick = (sourceId: string): void => {
    if (!sourceId) setError(input ? commit({ type: 'feed/remove', id: input.id }) : null);
    else if (input) setError(commit({ type: 'feed/update', id: input.id, patch: { sourceId } }));
    else setError(commit({ type: 'feed/add', feed: { id: newId(), targetId: panel.id, sourceId, label: nextFeedLabel(content, panel.id) } }));
  };
  return (
    <fieldset className="inspector__group" aria-label={m.feeds.input}>
      <legend className="lbl">{m.feeds.input}</legend>
      <div className="feed-list__item feed-list__item--input">
        <label className="feed-list__label" htmlFor={`${panel.id}-input`}>
          {m.feeds.fedFrom}
        </label>
        <select id={`${panel.id}-input`} className="feed-list__select" value={input?.sourceId ?? ''} onChange={(e) => pick(e.target.value)}>
          <option value="">{m.feeds.notConnectedOption}</option>
          {upstream.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {input && content.objects.find((o) => o.id === input.sourceId)?.type === 'mcb' ? (
          <WayPicker feed={input} content={content} onPick={(way) => setError(commit({ type: 'feed/update', id: input.id, patch: { way } }))} />
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** What a power source feeds (racks and other sources), and its own input. MCB panels also open their ways. */
export function PanelFeeds({ panel, content, commit, onManage }: { panel: RoomObject; content: PlanContent; commit: CommitFn; onManage?: (id: string) => void }) {
  const feeds = content.feeds.filter((f) => f.sourceId === panel.id);
  const m = useT();
  return (
    <>
      <SourceInput panel={panel} content={content} commit={commit} />
      <fieldset className="inspector__group">
        <legend className="lbl">{m.feeds.out}</legend>
        {panel.type === 'mcb' && onManage ? (
          <button type="button" className="btn btn--sm" onClick={() => onManage(panel.id)}>
            {m.feeds.manageWays}
          </button>
        ) : null}
        {feeds.length === 0 ? (
          <p className="inspector__note">{m.feeds.nothingConnected}</p>
        ) : (
          <ul className="feed-list" aria-label={m.feeds.outOf(panel.name)}>
            {feeds.map((f) => (
              <li key={f.id} className="feed-list__item">
                <span className="feed-list__swatch" style={{ background: feedColor(f, content) }} aria-hidden="true" />
                <span>{`${content.objects.find((o) => o.id === f.targetId)?.name ?? m.feeds.removedObject} · ${f.label}${f.way ? m.feeds.onWay(f.way) : ''}`}</span>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </>
  );
}
