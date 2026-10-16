import { expandPorts, PORT_MEDIA, PORT_MEDIA_LABEL, PORT_SPEEDS, validatePortGroups, type PortGroup } from '@glasshouse/domain';
import { IconPlus, IconTrash } from '../../ui/icons';
import { useT, type Messages } from '../../i18n';

const MAX_GROUPS = 8;

/** "48 ports: Gi1/0/1 – Gi1/0/48", per group, so the naming is visible before saving. */
function preview(m: Messages, g: PortGroup): string {
  const ports = expandPorts([g]);
  if (ports.length === 0) return m.ports.previewNone;
  return ports.length === 1 ? m.ports.previewOne(ports[0]!.name) : m.ports.previewMany(ports.length, ports[0]!.name, ports[ports.length - 1]!.name);
}

/** A new group continues the last one's naming and numbering: Gi1/0/1–48 then Gi1/0/49. */
function nextGroup(groups: PortGroup[]): PortGroup {
  const last = groups[groups.length - 1];
  return last ? { count: 1, prefix: last.prefix, start: last.start + last.count, media: last.media, speed: last.speed } : { count: 1, prefix: '', start: 1, media: 'rj45', speed: '1G' };
}

export function PortGroupsField({ id, groups, onChange }: { id: string; groups: PortGroup[]; onChange: (groups: PortGroup[]) => void }) {
  const m = useT();
  const problem = groups.length ? validatePortGroups(groups) : null;
  const patch = (i: number, p: Partial<PortGroup>): void => onChange(groups.map((g, j) => (j === i ? { ...g, ...p } : g)));
  const int = (v: string): number => (v.trim() === '' ? 0 : Math.trunc(Number(v)));
  return (
    <fieldset className="inspector__group port-groups-field" aria-label={m.ports.groups}>
      <legend className="lbl">{m.ports.groups}</legend>
      {groups.length === 0 ? <p className="inspector__note">{m.ports.groupsEmpty}</p> : null}
      <ol className="port-groups">
        {groups.map((g, i) => (
          <li key={i} className="port-groups__row">
            <input
              id={`${id}-g${i}-count`}
              className="field__input mono"
              aria-label={m.ports.groupCount(i + 1)}
              inputMode="numeric"
              value={g.count || ''}
              onChange={(e) => patch(i, { count: int(e.target.value) })}
            />
            <span aria-hidden="true">×</span>
            <select className="field__input" aria-label={m.ports.groupType(i + 1)} value={g.media} onChange={(e) => patch(i, { media: e.target.value as PortGroup['media'] })}>
              {PORT_MEDIA.map((m) => (
                <option key={m} value={m}>
                  {PORT_MEDIA_LABEL[m]}
                </option>
              ))}
            </select>
            <select className="field__input" aria-label={m.ports.groupSpeed(i + 1)} value={g.speed} onChange={(e) => patch(i, { speed: e.target.value })}>
              {PORT_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input className="field__input mono" aria-label={m.ports.groupPrefix(i + 1)} placeholder={m.ports.prefix} value={g.prefix} onChange={(e) => patch(i, { prefix: e.target.value })} />
            <input className="field__input mono" aria-label={m.ports.groupStart(i + 1)} inputMode="numeric" value={String(g.start)} onChange={(e) => patch(i, { start: int(e.target.value) })} />
            <select
              className="field__input"
              aria-label={m.ports.groupRows(i + 1)}
              value={g.rows === 2 ? `2-${g.order ?? 'odd_top'}` : '1'}
              onChange={(e) => {
                const [rows, order] = e.target.value.split('-') as ['1' | '2', PortGroup['order']];
                const { rows: _r, order: _o, ...rest } = g;
                onChange(groups.map((x, j) => (j === i ? (rows === '2' ? { ...rest, rows: 2, order } : rest) : x)));
              }}
            >
              <option value="1">{m.ports.oneRow}</option>
              <option value="2-odd_top">{m.ports.twoRowsOdd}</option>
              <option value="2-linear">{m.ports.twoRowsLinear}</option>
            </select>
            <button type="button" className="icon-btn icon-btn--sm" aria-label={m.ports.removeGroup(i + 1)} onClick={() => onChange(groups.filter((_, j) => j !== i))}>
              <IconTrash />
            </button>
            <span className="port-groups__preview mono">{preview(m, g)}</span>
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
        {m.ports.addGroup}
      </button>
    </fieldset>
  );
}
