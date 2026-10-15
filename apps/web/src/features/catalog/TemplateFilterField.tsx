import { useT } from '../../i18n';
import { IconSearch } from '../../ui/icons';
import './template-filter.css';

/** Narrows a catalog list as you type; Escape clears it. Says how many templates match. */
export function TemplateFilterField({ id, value, onChange, shown, total }: { id: string; value: string; onChange: (v: string) => void; shown: number; total: number }) {
  const m = useT();
  return (
    <div className="tpl-filter">
      <label htmlFor={id} className="visually-hidden">
        {m.catalogFilter.label}
      </label>
      <div className="tpl-filter__box field__box">
        <IconSearch className="tpl-filter__icon" />
        <input
          id={id}
          type="search"
          className="field__input"
          placeholder={m.catalogFilter.placeholder}
          value={value}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && value) {
              e.stopPropagation();
              onChange('');
            }
          }}
        />
      </div>
      {value.trim() ? (
        <p className="tpl-filter__count" role="status">
          {shown === 0 ? m.catalogFilter.none(value.trim()) : m.catalogFilter.count(shown, total)}
        </p>
      ) : null}
    </div>
  );
}
