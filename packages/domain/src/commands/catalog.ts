import { seedTemplates, validateTemplate } from '../catalog';
import type { Id, Template } from '../model/types';
import { err, ok, type Result } from '../result';
import { definedOnly } from '../validation';

export type CatalogCommand =
  | { type: 'template/create'; template: Omit<Template, 'version'> }
  | { type: 'template/update'; id: Id; patch: Partial<Omit<Template, 'id' | 'version'>> }
  | { type: 'template/delete'; id: Id }
  | { type: 'catalog/seed' };

const gone = (id: Id) => err('not_found', 'That template no longer exists.', [id]);

export function applyCatalogCommand(catalog: Template[], cmd: CatalogCommand): Result<Template[]> {
  switch (cmd.type) {
    case 'template/create': {
      if (catalog.some((t) => t.id === cmd.template.id)) return err('invalid_value', 'A template with this ID already exists.', [cmd.template.id]);
      const valid = validateTemplate({ ...cmd.template, version: 1 });
      if (!valid.ok) return valid;
      return ok([...catalog, valid.value]);
    }
    case 'template/update': {
      const current = catalog.find((t) => t.id === cmd.id);
      if (!current) return gone(cmd.id);
      const valid = validateTemplate({ ...current, ...definedOnly(cmd.patch), id: current.id, version: current.version + 1, illustrative: false });
      if (!valid.ok) return valid;
      return ok(catalog.map((t) => (t.id === cmd.id ? valid.value : t)));
    }
    case 'template/delete':
      if (!catalog.some((t) => t.id === cmd.id)) return gone(cmd.id);
      return ok(catalog.filter((t) => t.id !== cmd.id));
    case 'catalog/seed':
      return ok([...catalog, ...seedTemplates().filter((s) => !catalog.some((t) => t.id === s.id))]);
  }
}
