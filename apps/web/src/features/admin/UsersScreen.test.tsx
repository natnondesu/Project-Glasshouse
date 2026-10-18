import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useLangStore } from '../../i18n';
import { resetAuthStore, useAuthStore } from '../../auth/authStore';
import { resetPeopleStore, usePeopleStore } from '../../people/peopleStore';
import { ConfirmDialog } from '../../ui/confirm/ConfirmDialog';
import { UsersScreen } from './UsersScreen';

const DAY = 86_400_000;
const ago = (days: number): string => new Date(Date.now() - days * DAY).toISOString();

const few = { id: 'a', email: 'few@company.test', displayName: 'Few', role: 'admin', source: 'oidc', active: true, mustChangePassword: false, createdAt: ago(200), lastLoginAt: ago(0.1), nameLocked: true };
const ploy = { id: 'b', email: 'ploy@company.test', displayName: 'Ploy', role: 'viewer', source: 'local', active: true, mustChangePassword: true, createdAt: ago(3), lastLoginAt: null, nameLocked: false };
const eddie = { id: 'c', email: 'eddie@company.test', displayName: 'Eddie', role: 'editor', source: 'local', active: false, mustChangePassword: false, createdAt: ago(300), lastLoginAt: ago(150), nameLocked: false };
const users = [few, ploy];
const all = [...users, eddie];

const label = (u: { displayName: string; email: string }) => `${u.displayName} (${u.email})`;

beforeEach(() => {
  localStorage.clear();
  resetAuthStore();
  resetPeopleStore();
  useAuthStore.setState({
    status: 'signed-in',
    config: { mode: 'on', localLogin: true, sso: true },
    user: { id: 'a', name: 'Few', email: 'few@company.test', role: 'admin', mustChangePassword: false },
  });
});
afterEach(() => vi.restoreAllMocks());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const verbs = (spy: MockInstance<typeof fetch>, method: string) => spy.mock.calls.filter(([, init]) => init?.method === method);
const bodyOf = (call: Parameters<typeof fetch>) => JSON.parse(call[1]!.body as string) as unknown;

/** A server that applies PATCHes to its list and answers DELETEs. */
const mockServer = (list: unknown[] = all) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const target = /^\/api\/admin\/users\/([^/]+)$/.exec(url);
    if (target && init?.method === 'PATCH') return json({ ...(list as { id: string }[]).find((u) => u.id === target[1]), ...(JSON.parse(init.body as string) as object) });
    if (target && init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (url === '/api/people') return json({ people: [] });
    return json(list);
  });

function Address() {
  return <div data-testid="address">{useLocation().search}</div>;
}
const renderScreen = (path = '/admin/users') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <UsersScreen />
      <Address />
      <ConfirmDialog />
    </MemoryRouter>,
  );
const address = () => screen.getByTestId('address').textContent ?? '';
const row = (u: { displayName: string; email: string }) => screen.getByRole('row', { name: label(u) });
const rowNames = () => screen.getAllByRole('row').slice(1).map((r) => r.getAttribute('aria-label'));
const menuButton = (u: { displayName: string; email: string }) => screen.getByRole('button', { name: `Actions for ${label(u)}` });
const choose = async (u: { displayName: string; email: string }, item: string) => {
  await userEvent.click(await screen.findByRole('button', { name: `Actions for ${label(u)}` }));
  await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: item }));
};
const confirmWith = async (button: string) => userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: button }));

describe('reading the list', () => {
  it('shows each person with their email, how they sign in, role, status and last sign-in', async () => {
    mockServer();
    renderScreen();
    const r = await screen.findByRole('row', { name: label(ploy) });
    expect(within(r).getByText('ploy@company.test')).toBeInTheDocument();
    expect(within(r).getByText('Local')).toBeInTheDocument();
    expect(within(r).getByText('Active')).toBeInTheDocument();
    expect(within(r).getByText('Must change password')).toBeInTheDocument();
    expect(within(r).getByText('Never signed in')).toBeInTheDocument();
    expect(within(r).getByRole('combobox', { name: `Role for ${label(ploy)}` })).toHaveValue('viewer');
    const me = row(few);
    expect(within(me).getByText('Company')).toBeInTheDocument();
    expect(within(me).getByText(/^Last signed in \d+ hours? ago$/)).toHaveAttribute('title');
    expect(within(me).getByText('Name set by an admin; company sign-in keeps it.')).toBeInTheDocument();
    expect(within(r).queryByText(/Name set by an admin/)).toBeNull();
  });

  it('has a captioned table whose column headers are scoped and sit in the scrolling region', async () => {
    mockServer();
    renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    const table = screen.getByRole('table', { name: 'People with access to Glasshouse' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(4);
    headers.forEach((h) => expect(h).toHaveAttribute('scope', 'col'));
    expect(screen.getByRole('region', { name: 'People with access to Glasshouse' })).toContainElement(headers[0]!);
    expect(headers[0]!.closest('thead')).not.toBeNull();
  });

  it('locks your own role: a stamp and "You" instead of a select', async () => {
    mockServer();
    renderScreen();
    const me = await screen.findByRole('row', { name: label(few) });
    expect(within(me).queryByRole('combobox')).toBeNull();
    expect(within(me).getByText('Admin')).toBeInTheDocument();
    expect(within(me).getByText('You')).toBeInTheDocument();
  });

  it('turns non-admins away', () => {
    useAuthStore.setState({ status: 'signed-in', user: { id: 'b', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: false } });
    renderScreen();
    expect(screen.getByText('Only admins can manage users.')).toBeInTheDocument();
  });
});

describe('finding a person', () => {
  const kanya = { ...ploy, id: 'k', email: 'kanya.s@company.test', displayName: 'กัญญา ศรีสุข', source: 'oidc', mustChangePassword: false, createdAt: ago(400), lastLoginAt: ago(120) };
  const people = [...all, kanya];

  it('searches names and emails, Thai included, and says how many show', async () => {
    mockServer(people);
    renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    expect(screen.getByText('3 of 4 people')).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: 'Find a person' });
    await userEvent.type(search, 'กัญญา');
    expect(rowNames()).toEqual([label(kanya)]);
    expect(screen.getByText('1 of 4 people')).toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'PLOY@');
    expect(rowNames()).toEqual([label(ploy)]);
    expect(address()).toContain('q=PLOY%40');
  });

  it('says when no one matches, and Clear filters brings everyone back', async () => {
    mockServer(people);
    renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a person' }), 'xyz');
    expect(screen.getByText('No one matches “xyz”.')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('searchbox', { name: 'Find a person' })).toHaveValue('');
    expect(rowNames()).toHaveLength(3);
    expect(address()).toBe('');
  });

  it('focuses the search with /, and Escape clears it', async () => {
    mockServer(people);
    renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    fireEvent.keyDown(document.body, { key: '/' });
    const search = screen.getByRole('searchbox', { name: 'Find a person' });
    expect(search).toHaveFocus();
    await userEvent.type(search, 'ploy{Escape}');
    expect(search).toHaveValue('');
  });

  it('filters by status, sign-in, role and the access-review questions, and writes them to the address', async () => {
    mockServer(people);
    renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    const status = screen.getByRole('group', { name: 'Filter by status' });
    expect(within(status).getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(status).getByRole('button', { name: 'Switched off 1' }));
    expect(rowNames()).toEqual([label(eddie)]);
    expect(address()).toBe('?status=off');
    await userEvent.click(within(status).getByRole('button', { name: 'Everyone' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Filter by sign-in' })).getByRole('button', { name: 'Company' }));
    expect(rowNames()).toEqual([label(few), label(kanya)]);
    await userEvent.click(within(screen.getByRole('group', { name: 'Filter by role' })).getByRole('button', { name: 'Viewer' }));
    expect(rowNames()).toEqual([label(kanya)]);
    expect(address()).toBe('?status=all&signin=company&role=viewer');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(address()).toBe('');
    const review = screen.getByRole('group', { name: 'Access review' });
    await userEvent.click(within(review).getByRole('button', { name: 'Inactive 90+ days 1' }));
    expect(rowNames()).toEqual([label(kanya)]);
    await userEvent.click(within(review).getByRole('button', { name: 'New in 30 days 1' }));
    expect(rowNames()).toEqual([label(ploy)]);
    await userEvent.click(within(review).getByRole('button', { name: 'New in 30 days 1' }));
    expect(rowNames()).toHaveLength(3);
  });

  it('opens on the view in the address', async () => {
    mockServer(people);
    renderScreen('/admin/users?status=all&role=editor&q=ed');
    expect(await screen.findByRole('row', { name: label(eddie) })).toBeInTheDocument();
    expect(rowNames()).toEqual([label(eddie)]);
    expect(screen.getByRole('searchbox', { name: 'Find a person' })).toHaveValue('ed');
  });

  it('remembers the last view in this browser, without the search, and still works when storage is blocked', async () => {
    mockServer(people);
    const first = renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    await userEvent.click(within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: 'Everyone' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a person' }), 'e');
    first.unmount();
    renderScreen();
    expect(await screen.findByRole('row', { name: label(eddie) })).toBeInTheDocument();
    expect(address()).toBe('?status=all');
    expect(screen.getByRole('searchbox', { name: 'Find a person' })).toHaveValue('');
  });

  it('still filters when the browser blocks storage', async () => {
    mockServer(people);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    await userEvent.click(within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: 'Switched off 1' }));
    expect(rowNames()).toEqual([label(eddie)]);
  });

  it('sorts by the clicked column header and says so', async () => {
    mockServer(people);
    renderScreen('/admin/users?status=all');
    await screen.findByRole('row', { name: label(ploy) });
    const header = (name: RegExp) => screen.getByRole('columnheader', { name });
    expect(header(/^Name/)).toHaveAttribute('aria-sort', 'ascending');
    expect(rowNames()).toEqual([label(eddie), label(few), label(ploy), label(kanya)]);
    await userEvent.click(within(header(/^Name/)).getByRole('button'));
    expect(header(/^Name/)).toHaveAttribute('aria-sort', 'descending');
    expect(rowNames()[0]).toBe(label(kanya));
    await userEvent.click(within(header(/Last sign-in/)).getByRole('button'));
    expect(header(/Last sign-in/)).toHaveAttribute('aria-sort', 'ascending');
    expect(header(/^Name/)).not.toHaveAttribute('aria-sort');
    // Oldest first: never signed in, then 150 and 120 days ago, then today.
    expect(rowNames()).toEqual([label(ploy), label(eddie), label(kanya), label(few)]);
    expect(address()).toContain('sort=last');
  });
});

describe('the actions menu', () => {
  it('opens from the keyboard, moves with arrows, and Escape closes it back on its button', async () => {
    mockServer();
    renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    const button = menuButton(ploy);
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    const menu = screen.getByRole('menu', { name: `Actions for ${label(ploy)}` });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Rename', 'Reset password', 'Switch off']);
    expect(items[0]).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(items[2]).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem')[0]).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    // Tab closes the menu and carries on from its button: here, to the next row's role.
    menuButton(few).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('combobox', { name: `Role for ${label(ploy)}` })).toHaveFocus();
  });

  it('closes when you click elsewhere', async () => {
    mockServer();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: `Actions for ${label(ploy)}` }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('heading', { name: 'Users' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers your own row only Rename (and nothing that removes you)', async () => {
    mockServer();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: `Actions for ${label(few)}` }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Rename']);
  });

  it('puts Delete account last, apart, only on switched-off rows', async () => {
    mockServer();
    renderScreen('/admin/users?status=all');
    await userEvent.click(await screen.findByRole('button', { name: `Actions for ${label(eddie)}` }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Rename', 'Reset password', 'Switch on', 'Delete account']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
  });

  it('closes when focus jumps to the search with /', async () => {
    mockServer();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: `Actions for ${label(ploy)}` }));
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await userEvent.keyboard('/');
    expect(screen.getByRole('searchbox', { name: 'Find a person' })).toHaveFocus();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('asks before resetting a local password, then shows the new one once', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => (String(input).endsWith('/reset-password') && init?.method === 'POST' ? json({ temporaryPassword: 'Reset-999' }) : json(users)));
    const resets = () => spy.mock.calls.filter(([u]) => String(u).endsWith('/reset-password'));
    renderScreen();
    await choose(ploy, 'Reset password');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Reset Ploy’s password (ploy@company.test)?');
    expect(dialog).toHaveTextContent("They're signed out now and must sign in with the temporary password you'll see next.");
    expect(within(dialog).getByRole('button', { name: 'Reset password' })).toHaveClass('btn--ink');
    await confirmWith('Cancel');
    expect(resets()).toHaveLength(0);
    expect(menuButton(ploy)).toHaveFocus();
    await choose(ploy, 'Reset password');
    await confirmWith('Reset password');
    expect(await screen.findByText('Reset-999')).toBeInTheDocument();
    expect(resets()).toHaveLength(1);
    expect(screen.getByText('Temporary password for ploy@company.test:')).toBeInTheDocument();
  });
});

describe('roles', () => {
  const zed = { ...few, id: 'z', displayName: 'Zed', email: 'zed@company.test' };

  it('changes a role straight away and says what happened', async () => {
    const spy = mockServer();
    renderScreen();
    const r = await screen.findByRole('row', { name: label(ploy) });
    await userEvent.selectOptions(within(r).getByRole('combobox', { name: `Role for ${label(ploy)}` }), 'reviewer');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(bodyOf(verbs(spy, 'PATCH')[0]!)).toEqual({ role: 'reviewer' });
    expect(await screen.findByRole('status')).toHaveTextContent('Ploy is now Reviewer.');
  });

  it('asks before making someone an Admin, and changes nothing if you cancel', async () => {
    const spy = mockServer();
    renderScreen();
    const select = within(await screen.findByRole('row', { name: label(ploy) })).getByRole('combobox', { name: `Role for ${label(ploy)}` });
    await userEvent.selectOptions(select, 'admin');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Make Ploy (ploy@company.test) an Admin?');
    expect(dialog).toHaveTextContent("Admins can manage everyone's access.");
    await confirmWith('Cancel');
    expect(verbs(spy, 'PATCH')).toHaveLength(0);
    expect(select).toHaveValue('viewer');
    await userEvent.selectOptions(select, 'admin');
    await confirmWith('Make Admin');
    expect(bodyOf(verbs(spy, 'PATCH')[0]!)).toEqual({ role: 'admin' });
    expect(await screen.findByRole('status')).toHaveTextContent('Ploy is now Admin.');
  });

  it('asks before lowering an admin, and shows the server’s refusal near the list', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
      init?.method === 'PATCH' ? json({ error: { message: 'This is the last admin. Make someone else an admin first.' } }, 409) : json([...users, zed]),
    );
    renderScreen();
    await userEvent.selectOptions(within(await screen.findByRole('row', { name: label(zed) })).getByRole('combobox'), 'editor');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Change Zed (zed@company.test) from Admin to Editor?');
    await confirmWith('Change role');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('last admin');
    // Rendered between the toolbar and the list, not at the top of the page.
    expect(alert.compareDocumentPosition(screen.getByRole('searchbox')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('says when a role change moves someone out of a role filter, and keeps keyboard focus in the list', async () => {
    const nok = { ...ploy, id: 'n', displayName: 'Nok', email: 'nok@company.test' };
    mockServer([few, ploy, nok]);
    renderScreen('/admin/users?role=viewer');
    const select = within(await screen.findByRole('row', { name: label(nok) })).getByRole('combobox');
    await userEvent.selectOptions(select, 'editor');
    expect(await screen.findByRole('status')).toHaveTextContent('Nok is now Editor, so they are hidden from this list.');
    await vi.waitFor(() => expect(screen.getByRole('combobox', { name: `Role for ${label(ploy)}` })).toHaveFocus());
  });

  it('shows a localized fallback when the server gives no message or cannot be reached', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => (init?.method === 'PATCH' ? new Response('', { status: 500 }) : json(users)));
    renderScreen();
    const r = await screen.findByRole('row', { name: label(ploy) });
    await userEvent.selectOptions(within(r).getByRole('combobox'), 'editor');
    expect(await screen.findByRole('alert')).toHaveTextContent('The server answered 500.');
    spy.mockImplementation(async (_input, init) => {
      if (init?.method === 'PATCH') throw new TypeError('Failed to fetch');
      return json(users);
    });
    await choose(ploy, 'Switch off');
    await confirmWith('Switch off');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the Glasshouse server');
  });
});

describe('renaming', () => {
  it('opens from the menu, sends the new name, refreshes names elsewhere, and returns focus to the menu button', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/admin/users/b' && init?.method === 'PATCH') return json({ ...ploy, displayName: 'Ploy Sriwan', nameLocked: true });
      if (url === '/api/people') return json({ people: [{ id: 'b', name: 'Ploy Sriwan', email: 'ploy@company.test' }] });
      return json(users);
    });
    renderScreen();
    await choose(ploy, 'Rename');
    const input = screen.getByRole('textbox', { name: `New name for ${label(ploy)}` });
    expect(input).toHaveValue('Ploy');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('maxlength', '80');
    await userEvent.clear(input);
    await userEvent.type(input, 'Ploy Sriwan');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const renamed = { displayName: 'Ploy Sriwan', email: ploy.email };
    await screen.findByRole('row', { name: label(renamed) });
    expect(verbs(spy, 'PATCH')).toHaveLength(1);
    expect(bodyOf(verbs(spy, 'PATCH')[0]!)).toEqual({ displayName: 'Ploy Sriwan' });
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
    await vi.waitFor(() => expect(menuButton(renamed)).toHaveFocus());
    await vi.waitFor(() => expect(usePeopleStore.getState().byId).toEqual({ b: { name: 'Ploy Sriwan', email: 'ploy@company.test' } }));
  });

  it('keeps the form open with the typed name when the server refuses, and closes it once a retry works', async () => {
    let refuse = true;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/admin/users/b' && init?.method === 'PATCH') {
        return refuse ? json({ error: { message: 'That name is taken.' } }, 409) : json({ ...ploy, displayName: 'Ploy Sriwan', nameLocked: true });
      }
      if (String(input) === '/api/people') return json({ people: [] });
      return json(users);
    });
    renderScreen();
    await choose(ploy, 'Rename');
    const input = screen.getByRole('textbox', { name: `New name for ${label(ploy)}` });
    await userEvent.clear(input);
    await userEvent.type(input, 'Ploy Sriwan');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That name is taken.');
    expect(screen.getByRole('textbox', { name: `New name for ${label(ploy)}` })).toHaveValue('Ploy Sriwan');
    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('row', { name: label({ displayName: 'Ploy Sriwan', email: ploy.email }) });
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
    expect(verbs(spy, 'PATCH')).toHaveLength(2);
  });

  it('cancels with Escape, and sends nothing for an empty or unchanged name', async () => {
    const spy = mockServer(users);
    renderScreen();
    await choose(ploy, 'Rename');
    await userEvent.type(screen.getByRole('textbox', { name: `New name for ${label(ploy)}` }), ' X{Escape}');
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
    await vi.waitFor(() => expect(menuButton(ploy)).toHaveFocus());
    await choose(ploy, 'Rename');
    const input = screen.getByRole('textbox', { name: `New name for ${label(ploy)}` });
    await userEvent.clear(input);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(input, 'Ploy{Enter}');
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
    expect(verbs(spy, 'PATCH')).toHaveLength(0);
  });
});

describe('switching people off and on', () => {
  it('asks with the name and email before switching someone off, and does nothing if you cancel', async () => {
    const spy = mockServer();
    renderScreen();
    await choose(ploy, 'Switch off');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Switch off Ploy (ploy@company.test)?');
    expect(dialog).toHaveTextContent("They're signed out now and can't sign in until you switch them back on.");
    await confirmWith('Cancel');
    expect(verbs(spy, 'PATCH')).toHaveLength(0);
    expect(within(row(ploy)).getByText('Active')).toBeInTheDocument();
    expect(menuButton(ploy)).toHaveFocus();
  });

  it('switches off after confirming, hides them from the Active view, says so, and counts them on the chip', async () => {
    const spy = mockServer();
    renderScreen();
    await choose(ploy, 'Switch off');
    await confirmWith('Switch off');
    expect(bodyOf(verbs(spy, 'PATCH')[0]!)).toEqual({ active: false });
    await vi.waitFor(() => expect(screen.queryByRole('row', { name: label(ploy) })).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Ploy is switched off, so they are hidden from this list.');
    expect(within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: 'Switched off 2' })).toBeInTheDocument();
    // Ploy had no row below; the row above takes focus.
    await vi.waitFor(() => expect(menuButton(few)).toHaveFocus());
  });

  it('keeps the row in the Everyone view, with focus on its menu button', async () => {
    mockServer();
    renderScreen('/admin/users?status=all');
    await choose(ploy, 'Switch off');
    await confirmWith('Switch off');
    expect(await screen.findByRole('status')).toHaveTextContent('Ploy is switched off.');
    expect(within(row(ploy)).getByText('Switched off')).toBeInTheDocument();
    await vi.waitFor(() => expect(menuButton(ploy)).toHaveFocus());
  });

  it('switches back on with no confirmation', async () => {
    const spy = mockServer();
    renderScreen('/admin/users?status=all');
    await choose(eddie, 'Switch on');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(bodyOf(verbs(spy, 'PATCH')[0]!)).toEqual({ active: true });
    await vi.waitFor(() => expect(within(row(eddie)).getByText('Active')).toBeInTheDocument());
  });

  it('moves focus to the next row’s menu after switching someone off', async () => {
    const nok = { ...ploy, id: 'n', displayName: 'Nok', email: 'nok@company.test' };
    mockServer([few, nok, ploy]);
    renderScreen();
    await choose(nok, 'Switch off');
    await confirmWith('Switch off');
    await vi.waitFor(() => expect(screen.queryByRole('row', { name: label(nok) })).toBeNull());
    await vi.waitFor(() => expect(menuButton(ploy)).toHaveFocus());
  });
});

describe('deleting an account', () => {
  const zed = { ...eddie, id: 'z', displayName: 'Zed', email: 'zed@company.test' };

  it('confirms with the name and email, then deletes, drops the row and refreshes the names elsewhere', async () => {
    const spy = mockServer();
    renderScreen('/admin/users?status=off');
    await choose(eddie, 'Delete account');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete Eddie’s account (eddie@company.test)?');
    expect(dialog).toHaveTextContent("They can't sign in again with this account. Their name stays on past work, marked removed. This can't be undone.");
    expect(within(dialog).getByRole('button', { name: 'Delete account' })).toHaveClass('btn--danger-solid');
    expect(verbs(spy, 'DELETE')).toHaveLength(0);
    await confirmWith('Delete account');
    await vi.waitFor(() => expect(screen.queryByRole('row', { name: label(eddie) })).toBeNull());
    expect(verbs(spy, 'DELETE')[0]![0]).toBe('/api/admin/users/c');
    expect(screen.getByRole('status')).toHaveTextContent('Eddie’s account was deleted.');
    await vi.waitFor(() => expect(spy.mock.calls.some(([u]) => String(u) === '/api/people')).toBe(true));
  });

  it('does not delete when you cancel, and keeps the row when the server refuses', async () => {
    const spy = mockServer();
    renderScreen('/admin/users?status=off');
    await choose(eddie, 'Delete account');
    await confirmWith('Cancel');
    expect(verbs(spy, 'DELETE')).toHaveLength(0);
    spy.mockImplementation(async (_input, init) => (init?.method === 'DELETE' ? json({ error: { message: 'Switch Eddie off before deleting the account.' } }, 409) : json(all)));
    await choose(eddie, 'Delete account');
    await confirmWith('Delete account');
    expect(await screen.findByRole('alert')).toHaveTextContent('Switch Eddie off before deleting the account.');
    expect(row(eddie)).toBeInTheDocument();
  });

  it('moves focus to the next switched-off row’s menu, then to the status chips', async () => {
    mockServer([...users, eddie, zed]);
    renderScreen('/admin/users?status=off');
    await choose(eddie, 'Delete account');
    await confirmWith('Delete account');
    await vi.waitFor(() => expect(menuButton(zed)).toHaveFocus());
    await choose(zed, 'Delete account');
    await confirmWith('Delete account');
    await vi.waitFor(() => expect(screen.queryByRole('row', { name: label(zed) })).toBeNull());
    expect(screen.getByText('No one matches these filters.')).toBeInTheDocument();
    await vi.waitFor(() => expect(within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: 'Switched off 0' })).toHaveFocus());
  });

  it('words the confirmation for a company account as a blocked sign-in', async () => {
    const dao = { ...eddie, id: 'd', email: 'dao@company.test', displayName: 'Dao', source: 'oidc' };
    mockServer([...users, dao]);
    renderScreen('/admin/users?status=off');
    await choose(dao, 'Delete account');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent("Their company sign-in is blocked from Glasshouse until an admin adds them again. Their name stays on past work, marked removed. This can't be undone.");
    expect(dialog).not.toHaveTextContent("They can't sign in again");
  });
});

describe('adding a local user', () => {
  it('opens an inline panel from the header, shows the new password once, and closes back on its button', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      String(input) === '/api/admin/users' && init?.method === 'POST' ? json({ user: { ...ploy, id: 'n', email: 'new@company.test', displayName: 'New' }, temporaryPassword: 'TempPass-123456' }, 201) : json(users),
    );
    renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    const open = screen.getByRole('button', { name: 'Add local user' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('form', { name: 'Add someone with a password' })).toBeNull();
    await userEvent.click(open);
    const form = screen.getByRole('form', { name: 'Add someone with a password' });
    expect(within(form).getByLabelText('Email')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('form')).toBeNull();
    expect(open).toHaveFocus();
    await userEvent.click(open);
    await userEvent.type(screen.getByLabelText('Email'), 'new@company.test');
    await userEvent.type(screen.getByLabelText('Name'), 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }));
    expect(await screen.findByText('TempPass-123456')).toBeInTheDocument();
    expect(screen.getByText(/Shown once/)).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('row', { name: 'New (new@company.test)' })).toBeInTheDocument();
  });

  it('has no Add button when sign-in with a password is switched off', async () => {
    useAuthStore.setState({ config: { mode: 'on', localLogin: false, sso: true } });
    mockServer();
    renderScreen();
    await screen.findByRole('row', { name: label(ploy) });
    expect(screen.queryByRole('button', { name: 'Add local user' })).toBeNull();
  });
});

it('reads in Thai: status labels, chips, the menu and the confirmations', async () => {
  await useLangStore.getState().setLang('th');
  try {
    mockServer();
    renderScreen();
    const r = await screen.findByRole('row', { name: label(ploy) });
    expect(within(r).getByText('ใช้งานอยู่')).toBeInTheDocument();
    expect(within(r).getByText('ยังไม่เคยเข้าสู่ระบบ')).toBeInTheDocument();
    expect(screen.getByText('2 จาก 3 คน')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `การดำเนินการสำหรับ ${label(ploy)}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'ปิดใช้งาน' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('ปิดใช้งาน Ploy (ploy@company.test)?');
    await confirmWith('ยกเลิก');
    await userEvent.click(within(screen.getByRole('group', { name: 'กรองตามสถานะ' })).getByRole('button', { name: 'ปิดใช้งานแล้ว 1' }));
    expect(within(row(eddie)).getByText('ปิดใช้งานแล้ว')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `การดำเนินการสำหรับ ${label(eddie)}` }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['เปลี่ยนชื่อ', 'รีเซ็ตรหัสผ่าน', 'เปิดใช้งานอีกครั้ง', 'ลบบัญชี']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'รีเซ็ตรหัสผ่าน' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('รีเซ็ตรหัสผ่านของ Eddie (eddie@company.test)?');
    await confirmWith('ยกเลิก');
    await userEvent.click(screen.getByRole('button', { name: `การดำเนินการสำหรับ ${label(eddie)}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'ลบบัญชี' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('ลบบัญชีของ Eddie (eddie@company.test)?');
  } finally {
    await useLangStore.getState().setLang('en');
  }
});
