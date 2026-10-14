import { feedRoute, newId, nextFeedLabel, type PlanContent, type PowerFeed, type RoomObject } from '@glasshouse/domain';
import { useState } from 'react';
import { IconPlus, IconTrash } from '../../ui/icons';
import { toScreen, type View } from '../../viewport/math';
import type { CommitFn } from './usePlanGestures';

/** Feed colours by letter: A blue, B amber, C green, D violet, then repeat. */
const FEED_COLORS = ['#1c64c8', '#c77700', '#11795a', '#7a4fc2'];

export function feedLetter(feed: PowerFeed, content: Pick<PlanContent, 'feeds'>): string {
  const m = /([A-Z])$/.exec(feed.label.trim());
  if (m) return m[1]!;
  return String(content.feeds.filter((f) => f.rackId === feed.rackId).indexOf(feed) + 1);
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
  const panels = content.objects.filter((o) => o.type === 'mcb');
  const feeds = content.feeds.filter((f) => f.rackId === rack.id);
  const act = (problem: string | null): void => setError(problem);
  return (
    <fieldset className="inspector__group" aria-label="Power feeds">
      <legend className="lbl">Power feeds</legend>
      {feeds.length === 0 ? <p className="inspector__note">Not connected to a panel yet.</p> : null}
      <ul className="feed-list">
        {feeds.map((f) => (
          <li key={f.id} className="feed-list__item">
            <span className="feed-list__swatch" style={{ background: feedColor(f, content) }} aria-hidden="true" />
            <label className="feed-list__label" htmlFor={`${f.id}-source`}>
              {f.label}
            </label>
            <select
              id={`${f.id}-source`}
              aria-label={`${f.label} source`}
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
            <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove ${f.label}`} title={`Remove ${f.label}`} onClick={() => act(commit({ type: 'feed/remove', id: f.id }))}>
              <IconTrash />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn--sm"
        disabled={panels.length === 0}
        onClick={() => act(commit({ type: 'feed/add', feed: { id: newId(), rackId: rack.id, sourceId: panels[0]!.id, label: nextFeedLabel(content, rack.id) } }))}
      >
        <IconPlus />
        Add power feed
      </button>
      {panels.length === 0 ? <p className="inspector__note">Place an MCB panel on the plan to connect this rack.</p> : null}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** What an MCB panel feeds, read-only: connections are made from the rack. */
export function PanelFeeds({ panel, content }: { panel: RoomObject; content: PlanContent }) {
  const feeds = content.feeds.filter((f) => f.sourceId === panel.id);
  return (
    <fieldset className="inspector__group">
      <legend className="lbl">Feeds</legend>
      {feeds.length === 0 ? (
        <p className="inspector__note">No racks connected. Connect a rack from its own inspector.</p>
      ) : (
        <ul className="feed-list" aria-label={`Racks fed from ${panel.name}`}>
          {feeds.map((f) => (
            <li key={f.id} className="feed-list__item">
              <span className="feed-list__swatch" style={{ background: feedColor(f, content) }} aria-hidden="true" />
              <span>{`${content.objects.find((o) => o.id === f.rackId)?.name ?? 'Removed rack'} · ${f.label}`}</span>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
