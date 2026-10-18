import { revisionIssues } from '@glasshouse/domain';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useLangStore, useT } from '../../i18n';
import { IconArrowRight, IconBlock, IconWarn } from '../../ui/icons';
import { pad2 } from '../../ui/StatusStamp';
import { relativeTime } from '../../ui/time';
import type { PickUp } from './pickUp';
import { RoomMiniPlan } from './RoomMiniPlan';

/** Thai dates keep the Gregorian calendar, as everywhere else in the app. */
const LOCALE = { en: undefined, th: 'th-TH-u-ca-gregory' } as const;

function PickUpStrip({ pick }: { pick: PickUp }) {
  const m = useT();
  const lang = useLangStore((s) => s.lang);
  const { room, edit } = pick;
  const { revision } = room;
  const blocked = useMemo(() => new Set(revisionIssues(revision).filter((i) => i.severity === 'block').flatMap((i) => i.targets)), [revision]);
  const approved = revision.state === 'approved';
  const when = edit ? (relativeTime(edit.at, Date.now(), lang) ?? m.home.justNow) : null;
  const by = edit && when ? (edit.byMe ? m.home.editedByYou(when) : m.home.editedBy(edit.name, when)) : null;
  const rev = `R${pad2(revision.number)} ${m.revision.state[revision.state].toLocaleLowerCase(lang)}`;
  return (
    <section className="pickup" aria-labelledby="pickup-h">
      <span className="pickup__plan">
        <RoomMiniPlan content={revision.content} blocked={blocked} />
      </span>
      <div className="pickup__text">
        <h2 id="pickup-h" className="pickup__label">
          {pick.kind === 'last' ? m.home.pickUp : m.home.pickUpAttention}
        </h2>
        <p className="pickup__room">
          <span className="pickup__name">
            {room.room.name} · {room.site.name}
          </span>
          <span className="pickup__meta"> — {[by, rev].filter(Boolean).join(' · ')}</span>
        </p>
      </div>
      {!approved && room.holds.blocks > 0 ? (
        <span className="pickup__holds pickup__holds--block">
          <IconBlock />
          {m.home.blocks(room.holds.blocks)}
        </span>
      ) : !approved && room.holds.needsAck > 0 ? (
        <span className="pickup__holds">
          <IconWarn />
          {m.checks.needsAck(room.holds.needsAck)}
        </span>
      ) : null}
      <Link to={`/rooms/${room.room.id}/plan`} className="btn btn--ink pickup__go" aria-label={m.home.continueTo(room.room.name)}>
        {m.home.continue}
        <IconArrowRight />
      </Link>
    </section>
  );
}

/** The page's head: what the workspace holds, and the way back into the work (no create actions here; the tree has them). */
export function WorkspaceBar({ projects, sites, rooms, pick }: { projects: number; sites: number; rooms: number; pick: PickUp | null }) {
  const m = useT();
  const lang = useLangStore((s) => s.lang);
  const today = new Date().toLocaleDateString(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <header className="workspace-bar glass">
      <div className="workspace-bar__title">
        <h1>{m.home.workspaceTitle}</h1>
        <p>
          {today} · {m.home.workspaceCounts(projects, sites, rooms)}
        </p>
      </div>
      {pick ? <PickUpStrip pick={pick} /> : null}
    </header>
  );
}
