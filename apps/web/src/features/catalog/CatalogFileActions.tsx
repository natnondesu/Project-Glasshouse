import { exportCatalog, parseCatalogFile, previewCatalogImport, type Template } from '@glasshouse/domain';
import { useRef, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { downloadJson, readJsonFile } from '../../ui/files';
import { useT } from '../../i18n';

const list = (names: string[]): string => (names.length ? ` (${names.join(', ')})` : '');

/** Share a catalog as a file, and build the default catalog that ships with the app. */
export function CatalogFileActions({ guard, canChange }: { guard: (go: () => void) => void; canChange: boolean }) {
  const catalog = useWorkspaceStore((s) => s.workspace.catalog);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const m = useT();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const read = await readJsonFile(file);
    if (!read.ok) return setError(read.message);
    const parsed = parseCatalogFile(read.value);
    if (!parsed.ok) return setError(parsed.error.message);
    setError(null);
    setPending(parsed.value);
  };
  const preview = pending ? previewCatalogImport(catalog, pending) : null;

  return (
    <div className="catalog__files">
      <div className="catalog__files-actions">
        <button type="button" className="btn btn--sm" onClick={() => downloadJson(`glasshouse-catalog-${new Date().toISOString().slice(0, 10)}.json`, exportCatalog(catalog, new Date().toISOString()))}>
          {m.catalog.export}
        </button>
        <button type="button" className="btn btn--sm btn--quiet" disabled={!canChange} onClick={() => guard(() => input.current?.click())}>
          {m.catalog.import}
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label={m.catalog.chooseFile}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {pending && preview ? (
        <div className="catalog__confirm" role="group" aria-label={m.catalog.confirmImport}>
          <p>{m.catalog.importSummary(preview.added.length, list(preview.added), preview.updated.length, list(preview.updated), preview.unchanged)}</p>
          <p className="catalog__note">{m.catalog.importNote}</p>
          <div className="tpl-editor__actions">
            <button
              type="button"
              className="btn btn--sm btn--ink"
              disabled={!canChange}
              onClick={() => {
                const problem = dispatch({ type: 'catalog/import', templates: pending });
                setError(problem?.message ?? null);
                if (!problem) setPending(null);
              }}
            >
              {m.catalog.importAction}
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setPending(null)}>
              {m.common.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
