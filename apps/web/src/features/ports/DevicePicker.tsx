import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import type { PortOwnerOption } from './portOwners';

interface DevicePickerProps {
  owners: PortOwnerOption[];
  /** Free ports per device, after leaving out the port being linked. */
  freeOf: (id: string) => number;
  value: string;
  onChange: (id: string) => void;
}

/** Every word typed must appear in the device's name or its rack's: "neo 03 nvr" finds Neopolis-03's NVRs. */
export function matchOwners(owners: PortOwnerOption[], query: string): PortOwnerOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return owners;
  return owners.filter((o) => {
    const text = `${o.name} ${o.rack}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/**
 * The far device for a new cable: type to narrow a room's worth of gear, ↑/↓ and Enter to pick.
 * The list sits in the panel's flow, not floating, so it can't be cut off by the panel's edge.
 */
export function DevicePicker({ owners, freeOf, value, onChange }: DevicePickerProps) {
  const m = useT();
  const listId = useId();
  const inputId = useId();
  const chosen = owners.find((o) => o.id === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => matchOwners(owners, query), [owners, query]);
  const list = useRef<HTMLDivElement>(null);
  // Opening near the bottom of the panel: bring the list up into view rather than leave it under the edge.
  useEffect(() => {
    if (open) list.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open, hits.length]);
  const pick = (o: PortOwnerOption | undefined): void => {
    if (!o) return;
    onChange(o.id);
    setQuery('');
    setOpen(false);
  };
  const text = open ? query : chosen ? `${chosen.name} · ${chosen.rack}` : query;

  return (
    <div className="field device-pick">
      <label htmlFor={inputId} className="field__label">
        {m.ports.linkDevice}
      </label>
      <div className="field__box">
        <input
          id={inputId}
          className="field__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder={m.ports.findDevice}
          value={text}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            if (value) onChange('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && open) {
              e.preventDefault();
              pick(hits[active]);
            } else if (e.key === 'Escape' && open) {
              // Closes the list only; a second Escape reaches the panel.
              e.stopPropagation();
              setOpen(false);
              setQuery('');
            }
          }}
        />
      </div>
      {open ? (
        <div ref={list}>
          {hits.length === 0 ? (
            <p className="device-pick__empty" role="status">
              {m.ports.noDeviceMatch(query.trim())}
            </p>
          ) : (
            <ul className="device-pick__list" role="listbox" id={listId} aria-label={m.ports.linkDevice}>
              {hits.map((o, i) => {
                const free = freeOf(o.id);
                return (
                  <li
                    key={o.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    aria-label={`${o.name}, ${o.rack}, ${free > 0 ? m.ports.freeCount(free) : m.ports.noFree}`}
                    className="device-pick__option"
                    onMouseEnter={() => setActive(i)}
                    // mousedown, not click: the input's blur would close the list before a click lands.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(o);
                    }}
                  >
                    <span className="device-pick__name mono">{o.name}</span>
                    <span className="device-pick__rack">{o.rack}</span>
                    <span className={`device-pick__free${free === 0 ? ' is-none' : ''}`}>{free > 0 ? m.ports.freeCount(free) : m.ports.noFree}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
