import { formatWatts, latestApproved } from '@glasshouse/domain';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { IconArrowRight } from '../../ui/icons';
import { pad2 } from '../../ui/StatusStamp';
import { holdsTotal, RoomStatus } from './RoomCard';
import type { RoomSummary } from './rooms';
import { SceneBoundary } from './SceneBoundary';

// three.js is large: Home draws its text at once and brings the 3D in after.
const HeroScene = lazy(() => import('./HeroScene'));

/** `lastOpened`: this really is the room opened last, not just the first room there is. */
export function HomeHero({ summary, lastOpened }: { summary: RoomSummary; lastOpened: boolean }) {
  const m = useT();
  const { room, site, project, revision } = summary;
  const approved = latestApproved(room.plan);
  const by = revision.state === 'approved' ? revision.approvedBy?.name : revision.designedBy?.name;
  const when = (revision.state === 'approved' ? revision.approvedAt : revision.submittedAt)?.slice(0, 10);
  // Something holds approval: the way to it leads; opening the room is still one step aside.
  const holds = revision.state === 'approved' ? 0 : holdsTotal(summary);
  return (
    <section className="home-hero glass" aria-labelledby="home-hero-name">
      <div className="home-hero__text">
        <div className="home-hero__title">
          <h1 id="home-hero-name">{room.name}</h1>
          <p>
            {project.name} <span aria-hidden="true">/</span> {site.name}
            {lastOpened ? <span className="home-hero__last">{m.home.lastOpened}</span> : null}
          </p>
        </div>
        <p className={`home-hero__stamp home-hero__stamp--${revision.state}`}>
          <span className="mono">{m.revision.stamp[revision.state]}</span>
          <span className="mono">{[`R${pad2(revision.number)}`, when, by].filter(Boolean).join(' · ')}</span>
        </p>
        <dl className="home-hero__facts">
          <div>
            <dt>{m.home.racksLabel}</dt>
            <dd className="mono">{summary.racks}</dd>
          </div>
          <div>
            <dt>{m.home.devicesLabel}</dt>
            <dd className="mono">{summary.devices}</dd>
          </div>
          <div>
            <dt>{m.home.powerLabel}</dt>
            <dd className="mono">
              {formatWatts(summary.knownW)}
              <small>{m.power.ofShort(formatWatts(summary.limitW))}</small>
            </dd>
          </div>
        </dl>
        <RoomStatus summary={summary} />
        <div className="home-hero__actions">
          {holds > 0 ? (
            <>
              <Link to={`/rooms/${room.id}/review`} className="btn btn--ink">
                {m.home.resolve(holds)}
                <IconArrowRight />
              </Link>
              <Link to={`/rooms/${room.id}/plan`} className="btn">
                {m.home.openRoom}
              </Link>
            </>
          ) : (
            <Link to={`/rooms/${room.id}/plan`} className="btn btn--ink">
              {m.home.openRoom}
              <IconArrowRight />
            </Link>
          )}
          {approved ? (
            <Link to={`/rooms/${room.id}/install-sheet`} className="btn">
              {m.views.installSheet(pad2(approved.number))}
            </Link>
          ) : null}
        </div>
      </div>
      <div className="home-hero__paper">
        <SceneBoundary key={room.id} message={m.home.scene3dFailed} reload={m.home.reload}>
          <Suspense fallback={<p className="home-hero__fallback">{m.home.loading3d}</p>}>
            <HeroScene location={{ project, site, room }} />
          </Suspense>
        </SceneBoundary>
      </div>
    </section>
  );
}
