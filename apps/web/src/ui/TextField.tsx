import { useEffect, useRef, useState } from 'react';
import './fields.css';

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => string | null;
  multiline?: boolean;
  rows?: number;
}

export function TextField({ id, label, value, onCommit, multiline = false, rows = 3 }: TextFieldProps) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(value);
    setError(null);
  }, [value]);

  const props = {
    id,
    value: text,
    className: 'field__input',
    'aria-invalid': error !== null,
    'aria-describedby': error ? `${id}-error` : undefined,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      if (!error) setText(value);
    },
    onChange: (e: { target: { value: string } }) => {
      setText(e.target.value);
      setError(onCommit(e.target.value));
    },
  };

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className={`field__box${multiline ? ' field__box--multiline' : ''}${error ? ' field__box--error' : ''}`}>
        {multiline ? <textarea rows={rows} {...props} /> : <input autoComplete="off" {...props} />}
      </div>
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
