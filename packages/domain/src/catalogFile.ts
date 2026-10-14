import { z } from 'zod';
import { validateTemplate } from './catalog';
import type { Template } from './model/types';
import { CURRENT_SCHEMA_VERSION } from './model/defaults';
import { err, ok, type Result } from './result';
import { templateSchema } from './schema';

export const CATALOG_FILE_FORMAT = 'glasshouse.catalog';

export interface CatalogFile {
  format: typeof CATALOG_FILE_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  templates: Template[];
}

export const exportCatalog = (catalog: Template[], exportedAt: string): CatalogFile => ({
  format: CATALOG_FILE_FORMAT,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  exportedAt,
  templates: catalog.map((t) => ({ ...t, demand: { ...t.demand } })),
});

const fileSchema = z.object({ format: z.literal(CATALOG_FILE_FORMAT), templates: z.array(templateSchema) });

/** Reads an exported catalog (or the shipped default). Every template must pass the same rules as the editor. */
export function parseCatalogFile(raw: unknown): Result<Template[]> {
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const isCatalog = typeof raw === 'object' && raw !== null && (raw as { format?: unknown }).format === CATALOG_FILE_FORMAT;
    return err('invalid_value', isCatalog ? 'The catalog file is damaged: a template is missing fields.' : "This isn't a Glasshouse catalog file.");
  }
  const seen = new Set<string>();
  const out: Template[] = [];
  for (const t of parsed.data.templates as Template[]) {
    if (seen.has(t.id)) return err('invalid_value', `The catalog file lists ${t.id} twice.`);
    seen.add(t.id);
    const valid = validateTemplate(t);
    if (!valid.ok) return err('invalid_value', `${t.label || t.id}: ${valid.error.message}`);
    out.push(valid.value);
  }
  return ok(out);
}

/** Template content that matters for "has it changed", ignoring version bookkeeping. */
export const sameTemplate = (a: Template, b: Template): boolean => {
  const { version: _a, ...ra } = a;
  const { version: _b, ...rb } = b;
  return JSON.stringify(ra) === JSON.stringify(rb);
};

export function previewCatalogImport(local: Template[], incoming: Template[]): { added: string[]; updated: string[]; unchanged: number } {
  const added: string[] = [];
  const updated: string[] = [];
  let unchanged = 0;
  for (const t of incoming) {
    const here = local.find((x) => x.id === t.id);
    if (!here) added.push(t.label);
    else if (sameTemplate(here, t)) unchanged += 1;
    else updated.push(t.label);
  }
  return { added, updated, unchanged };
}
