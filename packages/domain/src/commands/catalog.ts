import { seedTemplates, validateTemplate } from '../catalog';
import { sameTemplate } from '../catalogFile';
import type { Id, Template } from '../model/types';
import { err, ok, type Result } from '../result';
import { definedOnly } from '../validation';

export type CatalogCommand =
  | { type: 'template/create'; template: Omit<Template, 'version'> }
  | { type: 'template/update'; id: Id; patch: Partial<Omit<Template, 'id' | 'version'>> }
  | { type: 'template/delete'; id: Id }
  | { type: 'catalog/seed' }
  | { type: 'catalog/import'; templates: Template[] };

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
    case 'catalog/import': {
      // By ID: new templates are added as they are; a changed one becomes the next version here,
      // so Devices already placed keep the version they were placed with.
      let next = [...catalog];
      for (const incoming of cmd.templates) {
        const valid = validateTemplate(incoming);
        if (!valid.ok) return valid;
        const here = next.find((t) => t.id === incoming.id);
        if (!here) next = [...next, valid.value];
        else if (!sameTemplate(here, valid.value)) next = next.map((t) => (t.id === here.id ? { ...valid.value, version: here.version + 1 } : t));
      }
      return ok(next);
    }
  }
}
