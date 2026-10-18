import type { Messages } from '../i18n';

export type People = Record<string, { name: string; email: string }>;

/** Who the signed-in team is, as views need it. Removed people are known only by what history recorded about them. */
export interface Directory {
  byId: People;
  isRemoved: (userId: string | undefined) => boolean;
}

/**
 * `gone` are ids confirmed to have no account. `onUnknown` hears about ids that are neither present nor confirmed,
 * so the owner of the list can refresh before anyone is called removed.
 */
export function directoryOf(byId: People, gone: readonly string[] = [], onUnknown?: (userId: string) => void): Directory {
  return {
    byId,
    isRemoved: (userId) => {
      if (!userId || byId[userId]) return false;
      if (gone.includes(userId)) return true;
      onUnknown?.(userId);
      return false;
    },
  };
}

const NOBODY = directoryOf({});

/** Typed names are marked unverified. A signed-in person is shown as they are in Users now, with their email (first names alone are ambiguous). */
export function personLabel(m: Messages, p: { name: string; userId?: string }, people: Directory = NOBODY): string {
  if (!p.userId) return m.review.unverified(p.name);
  const known = people.byId[p.userId];
  if (known) return m.review.personWithEmail(known.name, known.email);
  return people.isRemoved(p.userId) ? m.review.removedName(p.name) : p.name;
}

/** A name history recorded as text (notes, history lines): as recorded, marked once that person's account is gone. */
export const recordedName = (m: Messages, name: string, userId: string | undefined, people: Directory = NOBODY): string => (people.isRemoved(userId) ? m.review.removedName(name) : name);
