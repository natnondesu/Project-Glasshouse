import { expandPorts, PORT_MEDIA, PORT_MEDIA_LABEL, PORT_SPEEDS, validatePortGroups, type PortGroup } from '@glasshouse/domain';
import { IconPlus, IconTrash } from '../../ui/icons';

const MAX_GROUPS = 8;

/** "48 ports: Gi1/0/1 – Gi1/0/48", per group, so the naming is visible before saving. */
function preview(g: PortGroup): string {
  const ports = expandPorts([g]);
  if (ports.length === 0) return 'No ports';
  return ports.length === 1 ? `1 port: ${ports[0]!.name}` : `${ports.length} ports: ${ports[0]!.name} – ${ports[ports.length - 1]!.name}`;
}

/** A new group continues the last one's naming and numbering: Gi1/0/1–48 then Gi1/0/49. */
function nextGroup(groups: PortGroup[]): PortGroup {
  const last = groups[groups.length - 1];
  return last ? { count: 1, prefix: last.prefix, start: last.start + last.count, media: last.media, speed: last.speed } : { count: 1, prefix: '', start: 1, media: 'rj45', speed: '1G' };
}

export function PortGroupsField({ id, groups, onChange }: { id: string; groups: PortGroup[]; onChange: (groups: PortGroup[]) => void }) {
  const problem = groups.length ? validatePortGroups(groups) : null;
  const patch = (i: number, p: Partial<PortGroup>): void => onChange(groups.map((g, j) => (j === i ? { ...g, ...p } : g)));
  const int = (v: string): number => (v.trim() === '' ? 0 : Math.trunc(Number(v)));
  return (
    <fieldset className="inspector__group" aria-label="Network ports">
      <legend className="lbl">Network ports</legend>
      {groups.length === 0 ? <p className="inspector__note">No ports. Add a group for each run of ports, e.g. 48 × RJ45 then 4 × SFP+.</p> : null}
      <ol className="port-groups">
        {groups.map((g, i) => (
          <li key={i} className="port-groups__row">
            <input
              id={`${id}-g${i}-count`}
              className="field__input mono"
              aria-label={`Group ${i + 1} count`}
              inputMode="numeric"
              value={g.count || ''}
              onChange={(e) => patch(i, { count: int(e.target.value) })}
            />
            <span aria-hidden="true">×</span>
            <select className="field__input" aria-label={`Group ${i + 1} type`} value={g.media} onChange={(e) => patch(i, { media: e.target.value as PortGroup['media'] })}>
              {PORT_MEDIA.map((m) => (
                <option key={m} value={m}>
                  {PORT_MEDIA_LABEL[m]}
                </option>
              ))}
            </select>
            <select className="field__input" aria-label={`Group ${i + 1} speed`} value={g.speed} onChange={(e) => patch(i, { speed: e.target.value })}>
              {PORT_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input className="field__input mono" aria-label={`Group ${i + 1} name prefix`} placeholder="Prefix" value={g.prefix} onChange={(e) => patch(i, { prefix: e.target.value })} />
            <input className="field__input mono" aria-label={`Group ${i + 1} first number`} inputMode="numeric" value={String(g.start)} onChange={(e) => patch(i, { start: int(e.target.value) })} />
            <button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove group ${i + 1}`} onClick={() => onChange(groups.filter((_, j) => j !== i))}>
              <IconTrash />
            </button>
            <span className="port-groups__preview mono">{preview(g)}</span>
          </li>
        ))}
      </ol>
      {problem ? (
        <p role="alert" className="field__error">
          {problem}
        </p>
      ) : null}
      <button type="button" className="btn btn--sm" disabled={groups.length >= MAX_GROUPS} onClick={() => onChange([...groups, nextGroup(groups)])}>
        <IconPlus />
        Add port group
      </button>
    </fieldset>
  );
}
