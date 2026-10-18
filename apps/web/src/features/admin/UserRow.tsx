import type { Role } from '../../auth/authApi';
import { useT } from '../../i18n';
import type { Lang } from '../../i18n/lang';
import { IconLock } from '../../ui/icons';
import { formatTime, relativeTime } from '../../ui/time';
import type { AdminUser } from './adminApi';
import { ROLES } from './userFilters';
import { UserRowMenu, type RowMenuItem } from './UserRowMenu';

const NAME_MAX = 80;

interface RenameProps {
  /** The typed name while this row is being renamed; null otherwise. */
  draft: string | null;
  onDraft: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

interface UserRowProps {
  user: AdminUser;
  isMe: boolean;
  now: number;
  lang: Lang;
  rename: RenameProps;
  onRole: (role: Role) => void;
  actions: RowMenuItem[];
}

function NameCell({ user: u, rename }: { user: AdminUser; rename: RenameProps }) {
  const m = useT();
  if (rename.draft !== null) {
    return (
      <form className="users__rename" onSubmit={(e) => (e.preventDefault(), rename.onSave())}>
        <span className="field__box users__rename-box">
          <input
            className="field__input"
            aria-label={m.users.nameFor(u.displayName, u.email)}
            maxLength={NAME_MAX}
            value={rename.draft}
            autoFocus
            onChange={(e) => rename.onDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && rename.onCancel()}
          />
        </span>
        <button type="submit" className="btn btn--sm btn--ink" disabled={rename.draft.trim() === ''}>{m.users.save}</button>
        <button type="button" className="btn btn--sm btn--quiet" onClick={rename.onCancel}>{m.users.cancel}</button>
      </form>
    );
  }
  return (
    <>
      <span className="users__line">
        <span className="users__name">{u.displayName}</span>
        {u.source === 'oidc' && u.nameLocked ? (
          <span className="users__locked" title={m.users.nameSetByAdmin}>
            <IconLock aria-hidden="true" />
            <span className="visually-hidden">{m.users.nameSetByAdmin}</span>
          </span>
        ) : null}
      </span>
      <span className="users__line users__line--sub">
        <span className="users__email">{u.email}</span>
        <span className="users__source">{u.source === 'oidc' ? m.users.sso : m.users.local}</span>
      </span>
    </>
  );
}

function StatusCell({ user: u, now, lang }: { user: AdminUser; now: number; lang: Lang }) {
  const m = useT();
  const when = u.lastLoginAt === null ? null : relativeTime(u.lastLoginAt, now, lang);
  const seen = u.lastLoginAt === null ? m.users.neverSignedIn : when === null ? m.users.signedInJustNow : m.users.lastSignedIn(when);
  return (
    <>
      <span className="users__line">
        <span className={`users__status users__status--${u.active ? 'on' : 'off'}`}>
          <span className="users__status-dot" aria-hidden="true" />
          {u.active ? m.users.active : m.users.off}
        </span>
        {u.active && u.mustChangePassword ? <span className="users__flag">{m.users.mustChange}</span> : null}
      </span>
      <span className="users__line users__line--sub users__seen" title={u.lastLoginAt ? formatTime(u.lastLoginAt) : undefined}>
        {seen}
      </span>
    </>
  );
}

/** One person: who (name, email, how they sign in), role, status with last sign-in, and their actions menu. */
export function UserRow({ user: u, isMe, now, lang, rename, onRole, actions }: UserRowProps) {
  const m = useT();
  return (
    <tr aria-label={m.users.personLabel(u.displayName, u.email)} className={u.active ? undefined : 'users__row--off'}>
      <td className="users__who">
        <NameCell user={u} rename={rename} />
      </td>
      <td>
        {isMe ? (
          <span className="users__line">
            <span className="users__role-stamp">{m.auth.role[u.role]}</span>
            <span className="users__you">{m.users.you}</span>
          </span>
        ) : (
          <select className="users__select" aria-label={m.users.roleFor(u.displayName, u.email)} value={u.role} data-focus={`role-${u.id}`} onChange={(e) => onRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{m.auth.role[r]}</option>)}
          </select>
        )}
      </td>
      <td>
        <StatusCell user={u} now={now} lang={lang} />
      </td>
      <td className="users__menu-cell">
        <UserRowMenu label={m.users.actionsFor(u.displayName, u.email)} focusKey={`menu-${u.id}`} items={actions} />
      </td>
    </tr>
  );
}
