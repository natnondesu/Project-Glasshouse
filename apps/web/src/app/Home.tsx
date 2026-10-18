import { liveCounts, newId } from '@glasshouse/domain';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { HomeHero } from '../features/home/HomeHero';
import { lastRoomId } from '../features/home/lastRoom';
import { RoomCard } from '../features/home/RoomCard';
import { heroRoom, roomGroups } from '../features/home/rooms';
import '../features/home/home.css';
import { useCan } from '../auth/useCan';
import { useT } from '../i18n';
import { useWorkspaceStore } from '../store/workspaceStore';
import { IconPlus } from '../ui/icons';
import { useDocumentTitle } from '../ui/useDocumentTitle';

export function Home() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const navigate = useNavigate();
  const m = useT();
  const can = useCan();
  useDocumentTitle(null);
  const [error, setError] = useState<string | null>(null);
  const [lastId] = useState(lastRoomId);
  const hero = heroRoom(workspace, lastId);
  const groups = roomGroups(workspace);

  if (!hero && liveCounts(workspace).projects === 0) {
    return (
      <section className="home glass">
        <h1>{m.shell.homeTitle(false)}</h1>
        <p>{m.shell.homeBody(false)}</p>
      </section>
    );
  }
  const addRoom = (siteId: string): void => {
    const id = newId();
    const problem = dispatch({ type: 'room/create', siteId, id, floorAreaId: newId(), name: m.tree.newRoom });
    setError(problem?.message ?? null);
    if (!problem) void navigate(`/rooms/${id}/plan`);
  };
  return (
    <div className="home-page">
      {hero ? <HomeHero summary={hero} lastOpened={hero.room.id === lastId} /> : <h1 className="visually-hidden">{m.home.allRooms}</h1>}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
      {groups.map(({ project, site, rooms }) => (
        <section key={site.id} className="home-rooms" aria-labelledby={`home-site-${site.id}`}>
          <h2 id={`home-site-${site.id}`} className="home-rooms__head">
            <span>{site.name}</span>
            <span className="home-rooms__project">{project.name}</span>
          </h2>
          <div className="home-rooms__grid">
            {rooms.map((r) => (
              <RoomCard key={r.room.id} summary={r} lastOpened={r.room.id === lastId} />
            ))}
            {can.edit ? (
              <button type="button" className="home-add" onClick={() => addRoom(site.id)}>
                <IconPlus className="home-add__icon" />
                <span className="home-add__title">{m.home.newRoomIn(site.name)}</span>
                <span className="home-add__body">{m.home.addRoomBody}</span>
              </button>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
