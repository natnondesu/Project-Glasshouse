import type { GeoPoint } from '@glasshouse/domain';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { IconMapPin } from '../../ui/icons';
import { formatLatLon } from './format';

interface PlaceBannerProps {
  name: string;
  /** True once the map is close enough (a province) for a click to drop the pin. */
  closeEnough: boolean;
  pin: GeoPoint | null;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  onPaste: () => void;
}

/** "Place <site>" mode: what to do next, where the pin is, and the way out. Solid, so the drawing never smudges it. */
export function PlaceBanner({ name, closeEnough, pin, error, onSave, onCancel, onPaste }: PlaceBannerProps) {
  const m = useT();
  // A live region announces changes, not what it held when it appeared: the instruction is set just after mount.
  const [said, setSaid] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSaid(m.globe.placing(name)), 60);
    return () => clearTimeout(t);
  }, [m, name]);
  return (
    <section className="globe-place popover-surface" aria-label={m.globe.placeSite(name)}>
      <p className="visually-hidden" role="status">
        {said}
      </p>
      <div className="globe-place__text">
        <p className="globe-place__title">
          <IconMapPin />
          {m.globe.placing(name)}
        </p>
        <p className="globe-place__hint" aria-live="polite">
          {pin ? <span className="mono globe-place__coords">{formatLatLon(pin)}</span> : null}
          {closeEnough ? m.globe.placingDrop : m.globe.placingZoom}
        </p>
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
      </div>
      <div className="globe-place__actions">
        <button type="button" className="btn btn--sm btn--quiet" onClick={onPaste}>
          {m.globe.pasteInstead}
        </button>
        <button type="button" className="btn btn--sm" onClick={onCancel}>
          {m.globe.cancel}
        </button>
        <button type="button" className="btn btn--sm btn--ink" disabled={!pin} onClick={onSave}>
          {m.globe.savePlace}
        </button>
      </div>
    </section>
  );
}
