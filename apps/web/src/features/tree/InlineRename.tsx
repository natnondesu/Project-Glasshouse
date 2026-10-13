import { useEffect, useRef, useState } from 'react';

interface InlineRenameProps {
  label: string;
  initial: string;
  onCommit: (name: string) => string | null;
  onDone: () => void;
}

export function InlineRename({ label, initial, onCommit, onDone }: InlineRenameProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (): void => {
    finished.current = true;
    onDone();
  };
  const commit = (): void => {
    if (finished.current) return;
    const problem = onCommit(value);
    if (problem) {
      setError(problem);
      return;
    }
    finish();
  };

  return (
    <div className="inline-rename">
      <input
        ref={ref}
        aria-label={label}
        value={value}
        aria-invalid={error !== null}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish();
          }
        }}
        onBlur={commit}
      />
      {error ? (
        <p className="inline-rename__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
