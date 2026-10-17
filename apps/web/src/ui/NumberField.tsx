import { useEffect, useRef, useState } from 'react';
import './fields.css';
import { useT } from '../i18n';

type ParsedNumber = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; value: number };

const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/;
const THOUSANDS_PATTERN = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

export function parseNumber(text: string): ParsedNumber {
  const trimmed = text.trim();
  // "1,500" / "100,000" are thousands (how the team writes watts); a lone "1,5" is a decimal comma.
  const t = THOUSANDS_PATTERN.test(trimmed) ? trimmed.replaceAll(',', '') : trimmed.replace(',', '.');
  if (t === '') return { kind: 'empty' };
  if (!NUMBER_PATTERN.test(t)) return { kind: 'invalid' };
  const value = Number(t);
  return Number.isFinite(value) ? { kind: 'ok', value } : { kind: 'invalid' };
}

const format = (value: number | null, decimals: number): string => (value === null ? '' : value.toFixed(decimals));

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | null;
  onCommit: (value: number | null) => string | null;
  unit?: string;
  decimals?: number;
  allowEmpty?: boolean;
  placeholder?: string;
  /** 'blur' commits on blur or Enter: for U positions and counts, where "1" on the way to "12" is a real, unwanted value. */
  commitOn?: 'change' | 'blur';
}

export function NumberField({ id, label, value, onCommit, unit, decimals = 2, allowEmpty = false, placeholder, commitOn = 'change' }: NumberFieldProps) {
  const m = useT();
  const [text, setText] = useState(() => format(value, decimals));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(format(value, decimals));
    setError(null);
  }, [value, decimals]);

  const commitText = (t: string): string | null => {
    const parsed = parseNumber(t);
    const problem = parsed.kind === 'empty' ? (allowEmpty ? onCommit(null) : m.fields.enterValue) : parsed.kind === 'invalid' ? m.fields.enterNumber : onCommit(parsed.value);
    setError(problem);
    return problem;
  };
  const handleChange = (next: string): void => {
    setText(next);
    if (commitOn === 'change') {
      commitText(next);
      return;
    }
    setError(parseNumber(next).kind === 'invalid' ? m.fields.enterNumber : null);
  };

  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className={`field__box${error ? ' field__box--error' : ''}`}>
        <input
          id={id}
          className="field__input mono"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            const problem = commitOn === 'blur' && text !== format(value, decimals) ? commitText(text) : error;
            if (!problem) setText(format(value, decimals));
          }}
          onKeyDown={(e) => {
            if (commitOn === 'blur' && e.key === 'Enter') {
              e.preventDefault();
              commitText(text);
            }
          }}
          onChange={(e) => handleChange(e.target.value)}
        />
        {unit ? <span className="field__unit">{unit}</span> : null}
      </div>
      {error ? (
        <p id={errorId} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
