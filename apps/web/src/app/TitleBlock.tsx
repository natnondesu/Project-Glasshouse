import { currentRevision, exportProjectFile } from '@glasshouse/domain';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useRoomLocation, useViewedRevisionNumber } from '../store/hooks';
import { useWorkspaceStore, type SaveState } from '../store/workspaceStore';
import { downloadJson, slugify } from '../ui/files';
import { GlasshouseMark, IconDownload } from '../ui/icons';
import { pad2, StatusStamp } from '../ui/StatusStamp';

function Cell({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="title-block__cell">
      <dt className="lbl">{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{children}</dd>
    </div>
  );
}

const time = (d: Date): string => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function SaveStatus({ save }: { save: SaveState }) {
  switch (save.kind) {
    case 'idle':
      return <span className="save-status">Stored in this browser</span>;
    case 'saving':
      return <span className="save-status">Saving…</span>;
    case 'saved':
      return <span className="save-status">Saved in this browser · {time(save.at)}</span>;
    case 'failed':
      return (
        <span className="save-status save-status--failed" role="alert">
          Couldn't save: {save.reason}
        </span>
      );
  }
}

export function TitleBlock({ roomId }: { roomId: string | null }) {
  const location = useRoomLocation(roomId);
  const save = useWorkspaceStore((s) => s.save);
  const viewedNumber = useViewedRevisionNumber();
  const viewed = location && viewedNumber !== null ? location.room.plan.revisions.find((r) => r.number === viewedNumber) : undefined;
  const revision = viewed ?? (location ? currentRevision(location.room.plan) : null);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportProject = (): void => {
    if (!location) return;
    const file = exportProjectFile(workspace, location.project.id, new Date().toISOString());
    if (!file.ok) {
      setExportError(file.error.message);
      return;
    }
    setExportError(null);
    downloadJson(`${slugify(location.project.name)}.glasshouse.json`, file.value);
  };
  return (
    <header className="title-block glass">
      <Link to="/" className="title-block__mark">
        <GlasshouseMark />
        <span>Glasshouse</span>
      </Link>
      <dl className="title-block__cells">
        <Cell label="Project">
          {location?.project.name ?? '—'}
          {location?.project.isSample ? <span className="stamp">SAMPLE</span> : null}
        </Cell>
        <Cell label="Site">{location?.site.name ?? '—'}</Cell>
        <Cell label="Room">{location?.room.name ?? '—'}</Cell>
        <Cell label="Rev" mono>
          {revision ? pad2(revision.number) : '—'}
        </Cell>
        <Cell label="Status">{revision ? <StatusStamp state={revision.state} /> : '—'}</Cell>
      </dl>
      <div className="title-block__actions">
        {location ? (
          <button type="button" className="btn btn--sm" onClick={exportProject}>
            <IconDownload />
            Export project file
          </button>
        ) : null}
        {exportError ? (
          <span role="alert" className="save-status save-status--failed">
            {exportError}
          </span>
        ) : null}
        <SaveStatus save={save} />
      </div>
    </header>
  );
}
