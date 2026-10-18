import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Role } from '../../auth/authApi';
import { useAuthStore } from '../../auth/authStore';
import { useCan } from '../../auth/useCan';
import { useLangStore, useT } from '../../i18n';
import { usePeopleStore } from '../../people/peopleStore';
import { confirmAction } from '../../ui/confirm/confirmStore';
import { IconKey, IconPencil, IconPlus, IconPower, IconTrash } from '../../ui/icons';
import { useDocumentTitle } from '../../ui/useDocumentTitle';
import { createUser, deleteUser, listUsers, resetPassword, updateUser, type AdminUser } from './adminApi';
import { ADD_PANEL_ID, AddUserPanel } from './AddUserPanel';
import { applyQuery, DEFAULT_QUERY, facetCount, isDefaultFilters, matchesQuery, toggleSort } from './userFilters';
import { UserRow } from './UserRow';
import type { RowMenuItem } from './UserRowMenu';
import { UsersTable, UsersTableNote } from './UsersTable';
import { UsersToolbar } from './UsersToolbar';
import { useUsersQuery } from './useUsersQuery';
import '../../ui/fields.css';
import './users.css';

const refreshPeople = (): void => {
  // Labels elsewhere read the directory; a failed refresh must not hide that the change worked.
  usePeopleStore.getState().load().catch((e: unknown) => console.warn('Could not refresh the people list after a change.', e));
};

export function UsersScreen() {
  const m = useT();
  const lang = useLangStore((s) => s.lang);
  const can = useCan();
  const config = useAuthStore((s) => s.config);
  const localLogin = config?.mode === 'on' && config.localLogin;
  useDocumentTitle(m.users.title);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useUsersQuery();
  const section = useRef<HTMLElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  /** Where keyboard focus goes once the list changes under it: the same control if its row stayed, else the next row's, else the filters. */
  const focusAfter = useRef<string[] | null>(null);
  const renamed = useRef<string | null>(null);

  useEffect(() => {
    if (!can.admin) return;
    listUsers().then(
      (list) => {
        setNow(Date.now());
        setUsers(list);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [can.admin]);

  const focusFirst = (keys: string[]): void => {
    for (const key of keys) {
      const el = section.current?.querySelector<HTMLElement>(`[data-focus="${key}"]`);
      if (el) return el.focus();
    }
  };
  useEffect(() => {
    const wanted = focusAfter.current;
    focusAfter.current = null;
    if (wanted) focusFirst(wanted);
  }, [users]);
  useEffect(() => {
    // Rename closed (saved or cancelled): back to that row's actions button, where it was opened from.
    if (renaming !== null || renamed.current === null) return;
    focusFirst([`menu-${renamed.current}`]);
    renamed.current = null;
  }, [renaming]);

  // Typing stays instant with hundreds of rows: the list catches up with the search a frame later. Chips apply at once.
  const typed = useDeferredValue(query.q);
  const shown = useMemo(() => applyQuery(users ?? [], { ...query, q: typed }, now, lang), [users, query, typed, now, lang]);

  if (!can.admin) {
    return (
      <section className="users glass">
        <p>{m.users.adminsOnly}</p>
        <Link to="/" className="btn btn--sm">{m.shell.backToProjects}</Link>
      </section>
    );
  }

  const run = async (work: () => Promise<void>): Promise<boolean> => {
    setError(null);
    setNotice(null);
    try {
      await work();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const replace = (u: AdminUser): void => setUsers((list) => (list ?? []).map((x) => (x.id === u.id ? u : x)));
  const hidden = (u: AdminUser): boolean => !matchesQuery(u, query, now);
  /** The control to land on after `u` changes: its own if the row stays, else the next row's, the previous row's, then the filters. */
  const focusKeysAfter = (u: AdminUser, control: 'menu' | 'role'): string[] => {
    const at = shown.findIndex((x) => x.id === u.id);
    const around = [shown[at + 1], shown[at - 1]].filter((x): x is AdminUser => x !== undefined);
    return [`${control}-${u.id}`, ...around.map((x) => `${control}-${x.id}`), 'status', 'table'];
  };
  const clearFilters = (): void => setQuery({ ...DEFAULT_QUERY, sort: query.sort, desc: query.desc });

  const closeRename = (id: string): void => {
    renamed.current = id;
    setRenaming((current) => (current?.id === id ? null : current));
  };
  const saveName = (u: AdminUser): void => {
    const draft = renaming?.draft.trim() ?? '';
    // Any name sent locks it against company sign-in, so an unchanged name is not sent.
    if (draft === '' || draft === u.displayName) return closeRename(u.id);
    void run(async () => {
      replace(await updateUser(u.id, { displayName: draft }));
      refreshPeople();
    }).then((saved) => {
      // The form stays open on a failure, with the typed name, so nothing has to be typed again.
      if (saved) closeRename(u.id);
    });
  };
  const changeRole = async (u: AdminUser, role: Role): Promise<void> => {
    if (role === u.role) return;
    const label = m.auth.role[role];
    // A closed select also changes on arrow keys, so Admin can never arrive by accident.
    if (role === 'admin' && !(await confirmAction({ title: m.users.makeAdminTitle(u.displayName, u.email), body: m.users.makeAdminBody, confirmLabel: m.users.makeAdmin, tone: 'primary' }))) return;
    if (u.role === 'admin' && !(await confirmAction({ title: m.users.lowerAdminTitle(u.displayName, u.email, label), body: m.users.lowerAdminBody, confirmLabel: m.users.changeRole, tone: 'primary' }))) return;
    void run(async () => {
      const updated = await updateUser(u.id, { role });
      focusAfter.current = focusKeysAfter(u, 'role');
      replace(updated);
      setNotice(m.users.roleNotice(u.displayName, label, hidden(updated)));
    });
  };
  const switchOff = async (u: AdminUser): Promise<void> => {
    if (!(await confirmAction({ title: m.users.switchOffTitle(u.displayName, u.email), body: m.users.switchOffBody, confirmLabel: m.users.switchOff, tone: 'primary' }))) return;
    void run(async () => {
      const updated = await updateUser(u.id, { active: false });
      focusAfter.current = focusKeysAfter(u, 'menu');
      replace(updated);
      setNotice(m.users.switchedOffNotice(u.displayName, hidden(updated)));
    });
  };
  const switchOn = (u: AdminUser): void =>
    void run(async () => {
      const updated = await updateUser(u.id, { active: true });
      focusAfter.current = focusKeysAfter(u, 'menu');
      replace(updated);
      setNotice(m.users.switchedOnNotice(u.displayName, hidden(updated)));
    });
  const remove = async (u: AdminUser): Promise<void> => {
    if (!(await confirmAction({ title: m.users.deleteTitle(u.displayName, u.email), body: m.users.deleteBody(u.source === 'oidc'), confirmLabel: m.users.deleteAccount, tone: 'danger' }))) return;
    void run(async () => {
      await deleteUser(u.id);
      focusAfter.current = focusKeysAfter(u, 'menu').slice(1);
      setUsers((list) => (list ?? []).filter((x) => x.id !== u.id));
      setNotice(m.users.deletedNotice(u.displayName));
      refreshPeople();
    });
  };
  const reset = (u: AdminUser): void =>
    void run(async () => {
      const { temporaryPassword } = await resetPassword(u.id);
      setSecret({ who: u.email, password: temporaryPassword });
      replace({ ...u, mustChangePassword: true });
    });
  const add = (input: { email: string; displayName: string; role: Role }): Promise<boolean> =>
    run(async () => {
      const r = await createUser(input);
      setUsers((list) => [...(list ?? []), r.user]);
      setSecret({ who: r.user.email, password: r.temporaryPassword });
    });
  const closeAdd = (): void => {
    setAddOpen(false);
    addButton.current?.focus();
  };

  const actionsFor = (u: AdminUser): RowMenuItem[] => {
    const isMe = u.id === can.me?.id;
    const items: RowMenuItem[] = [{ id: 'rename', label: m.users.rename, Icon: IconPencil, onSelect: () => setRenaming({ id: u.id, draft: u.displayName }) }];
    if (u.source === 'local') items.push({ id: 'reset', label: m.users.reset, Icon: IconKey, onSelect: () => reset(u) });
    if (!isMe && u.active) items.push({ id: 'off', label: m.users.switchOff, Icon: IconPower, onSelect: () => void switchOff(u) });
    if (!isMe && !u.active) {
      items.push({ id: 'on', label: m.users.switchOn, Icon: IconPower, onSelect: () => switchOn(u) });
      items.push({ id: 'delete', label: m.users.deleteAccount, Icon: IconTrash, onSelect: () => void remove(u), danger: true });
    }
    return items;
  };

  const all = users ?? [];
  const emptyText = query.q.trim() ? m.users.noMatch(query.q.trim()) : m.users.noMatchFilters;
  return (
    <section ref={section} className="users glass" aria-labelledby="users-h">
      <header className="users__head">
        <div className="users__title">
          <h1 id="users-h">{m.users.title}</h1>
          <p className="users__lede">{m.users.note}</p>
        </div>
        {localLogin ? (
          <button ref={addButton} type="button" className="btn btn--sm users__add-btn" aria-expanded={addOpen} aria-controls={addOpen ? ADD_PANEL_ID : undefined} onClick={() => (addOpen ? closeAdd() : setAddOpen(true))}>
            <IconPlus aria-hidden="true" />
            {m.users.addLocal}
          </button>
        ) : null}
      </header>
      <UsersToolbar
        query={query}
        onChange={setQuery}
        shown={shown.length}
        total={all.length}
        facet={(change) => facetCount(all, query, change, now)}
        onClear={isDefaultFilters(query) ? null : clearFilters}
      />
      {addOpen && localLogin ? <AddUserPanel onAdd={add} onClose={closeAdd} /> : null}
      {error ? <p role="alert" className="users__error field__error">{error}</p> : null}
      {secret ? (
        <div className="users__secret" role="status">
          <p>{m.users.tempFor(secret.who)}</p>
          <code className="mono">{secret.password}</code>
          <p className="users__hint">{m.users.shownOnce}</p>
          <button type="button" className="btn btn--sm" onClick={() => setSecret(null)}>{m.common.close}</button>
        </div>
      ) : null}
      {notice ? <p role="status" className="users__notice">{notice}</p> : null}
      <UsersTable query={query} onSort={(key) => setQuery(toggleSort(query, key))}>
        {users === null ? (
          error ? null : <UsersTableNote text={m.users.loading} />
        ) : shown.length === 0 ? (
          <UsersTableNote text={emptyText} action={<button type="button" className="btn btn--sm" onClick={clearFilters}>{m.users.clearFilters}</button>} />
        ) : (
          shown.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isMe={u.id === can.me?.id}
              now={now}
              lang={lang}
              rename={{
                draft: renaming?.id === u.id ? renaming.draft : null,
                onDraft: (draft) => setRenaming({ id: u.id, draft }),
                onSave: () => saveName(u),
                onCancel: () => closeRename(u.id),
              }}
              onRole={(role) => void changeRole(u, role)}
              actions={actionsFor(u)}
            />
          ))
        )}
      </UsersTable>
    </section>
  );
}
