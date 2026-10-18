import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useLangStore } from '../../i18n';
import { resetAuthStore, useAuthStore } from '../../auth/authStore';
import { resetPeopleStore, usePeopleStore } from '../../people/peopleStore';
import { ConfirmDialog } from '../../ui/confirm/ConfirmDialog';
import { UsersScreen } from './UsersScreen';

const users = [
  { id: 'a', email: 'few@company.test', displayName: 'Few', role: 'admin', source: 'oidc', active: true, mustChangePassword: false, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: '2026-10-18T08:00:00.000Z', nameLocked: true },
  { id: 'b', email: 'ploy@company.test', displayName: 'Ploy', role: 'viewer', source: 'local', active: true, mustChangePassword: true, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: null, nameLocked: false },
];

beforeEach(() => {
  localStorage.clear();
  resetAuthStore();
  resetPeopleStore();
  useAuthStore.setState({ status: 'signed-in', user: { id: 'a', name: 'Few', email: 'few@company.test', role: 'admin', mustChangePassword: false } });
});
afterEach(() => vi.restoreAllMocks());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

it('lists people, changes a role, and shows a new user’s one-time password', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === '/api/admin/users' && (!init || init.method === undefined)) return json(users);
    if (url === '/api/admin/users/b' && init?.method === 'PATCH') return json({ ...users[1], role: 'editor' });
    if (url === '/api/admin/users' && init?.method === 'POST') return json({ user: { ...users[1], id: 'c', email: 'new@company.test', displayName: 'New' }, temporaryPassword: 'TempPass-123456' }, 201);
    return json({ error: { message: 'unexpected' } }, 500);
  });
  render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
  const row = (await screen.findByRole('row', { name: /Ploy/ }));
  expect(within(row).getByText('Local')).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: 'Reset password for Ploy' })).toBeInTheDocument();
  expect(within(row).getByText('Active')).toBeInTheDocument();
  expect(within(screen.getByRole('row', { name: /Few/ })).queryByRole('button', { name: /Reset password/ })).not.toBeInTheDocument();
  await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Role for Ploy' }), 'editor');
  expect(fetchSpy).toHaveBeenCalledWith('/api/admin/users/b', expect.objectContaining({ method: 'PATCH' }));
  await userEvent.type(screen.getByLabelText('Email'), 'new@company.test');
  await userEvent.type(screen.getByLabelText('Name'), 'New');
  await userEvent.click(screen.getByRole('button', { name: 'Add user' }));
  expect(await screen.findByText('TempPass-123456')).toBeInTheDocument();
  expect(screen.getByText(/Shown once/)).toBeInTheDocument();
});

it('shows the server’s refusal, such as removing the last admin', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
    init?.method === 'PATCH' ? json({ error: { message: 'This is the last admin. Make someone else an admin first.' } }, 409) : json(users),
  );
  render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
  const row = await screen.findByRole('row', { name: /Few/ });
  await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Role for Few' }), 'editor');
  expect(await screen.findByRole('alert')).toHaveTextContent('last admin');
});

it('turns non-admins away', () => {
  useAuthStore.setState({ status: 'signed-in', user: { id: 'b', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: false } });
  render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
  expect(screen.getByText('Only admins can manage users.')).toBeInTheDocument();
});

it('shows a localized fallback when the server gives no message or cannot be reached', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => (init?.method === 'PATCH' ? new Response('', { status: 500 }) : json(users)));
  render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
  const row = await screen.findByRole('row', { name: /Ploy/ });
  await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Role for Ploy' }), 'editor');
  expect(await screen.findByRole('alert')).toHaveTextContent('The server answered 500.');
  spy.mockImplementation(async (_input, init) => {
    if (init?.method === 'PATCH') throw new TypeError('Failed to fetch');
    return json(users);
  });
  await userEvent.click(within(row).getByRole('button', { name: 'Switch off Ploy' }));
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Switch off' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the Glasshouse server');
});

describe('renaming', () => {
  const patches = (spy: MockInstance<typeof fetch>) => spy.mock.calls.filter(([, init]) => init?.method === 'PATCH');

  it('sends the new name, then refreshes the names shown elsewhere', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/admin/users/b' && init?.method === 'PATCH') return json({ ...users[1], displayName: 'Ploy Sriwan', nameLocked: true });
      if (url === '/api/people') return json({ people: [{ id: 'b', name: 'Ploy Sriwan', email: 'ploy@company.test' }] });
      return json(users);
    });
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    const row = await screen.findByRole('row', { name: /Ploy/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Rename Ploy' }));
    const input = screen.getByRole('textbox', { name: 'New name for Ploy' });
    expect(input).toHaveValue('Ploy');
    expect(input).toHaveAttribute('maxlength', '80');
    await userEvent.clear(input);
    await userEvent.type(input, 'Ploy Sriwan');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('row', { name: /Ploy Sriwan/ });
    expect(patches(spy)).toHaveLength(1);
    expect(JSON.parse(patches(spy)[0]![1]!.body as string)).toEqual({ displayName: 'Ploy Sriwan' });
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
    await vi.waitFor(() => expect(usePeopleStore.getState().byId).toEqual({ b: { name: 'Ploy Sriwan', email: 'ploy@company.test' } }));
  });

  it('keeps the rename form open with the typed name when the server refuses, and closes it once a retry works', async () => {
    let refuse = true;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/admin/users/b' && init?.method === 'PATCH') {
        return refuse ? json({ error: { message: 'That name is taken.' } }, 409) : json({ ...users[1], displayName: 'Ploy Sriwan', nameLocked: true });
      }
      if (String(input) === '/api/people') return json({ people: [] });
      return json(users);
    });
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    const row = await screen.findByRole('row', { name: /Ploy/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Rename Ploy' }));
    const input = screen.getByRole('textbox', { name: 'New name for Ploy' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Ploy Sriwan');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That name is taken.');
    expect(screen.getByRole('textbox', { name: 'New name for Ploy' })).toHaveValue('Ploy Sriwan');
    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('row', { name: /Ploy Sriwan/ });
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
    expect(patches(spy)).toHaveLength(2);
  });

  it('saves with Enter and cancels with Escape without a request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(users));
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    const row = await screen.findByRole('row', { name: /Ploy/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Rename Ploy' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New name for Ploy' }), ' X{Escape}');
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
    expect(patches(spy)).toHaveLength(0);
    expect(within(row).getByRole('button', { name: 'Rename Ploy' })).toBeInTheDocument();
  });

  it('keeps Save disabled for an empty name, and sends nothing when the name is unchanged', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(users));
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    const row = await screen.findByRole('row', { name: /Ploy/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Rename Ploy' }));
    const input = screen.getByRole('textbox', { name: 'New name for Ploy' });
    await userEvent.clear(input);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(input, 'Ploy{Enter}');
    expect(patches(spy)).toHaveLength(0);
    expect(screen.queryByRole('textbox', { name: /New name for/ })).toBeNull();
  });

  it('notes that an admin-set company name is kept', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(users));
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    expect(within(await screen.findByRole('row', { name: /Few/ })).getByText('Name set by an admin; company sign-in keeps it.')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Ploy/ })).queryByText(/Name set by an admin/)).toBeNull();
  });
});

describe('switching people off and on', () => {
  const eddie = { id: 'c', email: 'eddie@company.test', displayName: 'Eddie', role: 'editor', source: 'local', active: false, mustChangePassword: false, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: null, nameLocked: false };
  const all = [...users, eddie];
  const verbs = (spy: MockInstance<typeof fetch>, method: string) => spy.mock.calls.filter(([, init]) => init?.method === method);
  const mockServer = (list: unknown[] = all) =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const target = /^\/api\/admin\/users\/([^/]+)$/.exec(url);
      if (target && init?.method === 'PATCH') return json({ ...(list as { id: string }[]).find((u) => u.id === target[1]), ...JSON.parse(init.body as string) });
      if (target && init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (url === '/api/people') return json({ people: [] });
      return json(list);
    });

  it('shows status as a plain label, not a button, with the action beside it', async () => {
    mockServer();
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    const row = await screen.findByRole('row', { name: /Ploy/ });
    expect(within(row).getByText('Active')).not.toBeInstanceOf(HTMLButtonElement);
    expect(within(row).queryByRole('button', { name: /^Active/ })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Switch off Ploy' })).toHaveTextContent('Switch off');
  });

  it('asks before switching someone off, and does nothing if you cancel', async () => {
    const spy = mockServer();
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    const row = await screen.findByRole('row', { name: /Ploy/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Switch off Ploy' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Switch off Ploy?');
    expect(dialog).toHaveTextContent("They're signed out now and can't sign in until you switch them back on.");
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(verbs(spy, 'PATCH')).toHaveLength(0);
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('switches off after confirming, hides them, and counts them in the toggle', async () => {
    const spy = mockServer();
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    const row = await screen.findByRole('row', { name: /Ploy/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Switch off Ploy' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Switch off' }));
    expect(JSON.parse(verbs(spy, 'PATCH')[0]![1]!.body as string)).toEqual({ active: false });
    await vi.waitFor(() => expect(screen.queryByRole('row', { name: /Ploy/ })).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Ploy is switched off, so they are hidden from this list.');
    expect(screen.getByRole('checkbox', { name: 'Show switched off (2)' })).not.toBeChecked();
  });

  it('switches back on with no confirmation', async () => {
    const spy = mockServer();
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Show switched off (1)' }));
    const row = screen.getByRole('row', { name: /Eddie/ });
    expect(within(row).getByText('Switched off')).not.toBeInstanceOf(HTMLButtonElement);
    await userEvent.click(within(row).getByRole('button', { name: 'Switch on Eddie' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(JSON.parse(verbs(spy, 'PATCH')[0]![1]!.body as string)).toEqual({ active: true });
    await vi.waitFor(() => expect(within(screen.getByRole('row', { name: /Eddie/ })).getByText('Active')).toBeInTheDocument());
  });

  it('hides switched-off people by default, shows them on request, and remembers the choice per browser', async () => {
    mockServer();
    const first = render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await screen.findByRole('row', { name: /Ploy/ });
    expect(screen.queryByRole('row', { name: /Eddie/ })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show switched off (1)' }));
    expect(screen.getByRole('row', { name: /Eddie/ })).toBeInTheDocument();
    expect(localStorage.getItem('glasshouse:users-show-switched-off')).toBe('true');
    first.unmount();
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    expect(await screen.findByRole('row', { name: /Eddie/ })).toBeInTheDocument();
  });

  it('has no toggle when nobody is switched off', async () => {
    mockServer(users);
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await screen.findByRole('row', { name: /Ploy/ });
    expect(screen.queryByRole('checkbox', { name: /Show switched off/ })).toBeNull();
  });

  it('still works when the browser blocks storage', async () => {
    mockServer();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Show switched off (1)' }));
    expect(screen.getByRole('row', { name: /Eddie/ })).toBeInTheDocument();
  });

  it('offers no switch-off or delete on your own row', async () => {
    mockServer();
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    const me = await screen.findByRole('row', { name: /Few/ });
    expect(within(me).queryByRole('button', { name: /Switch off/ })).toBeNull();
  });

  it('offers Delete account only on switched-off rows', async () => {
    mockServer();
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Show switched off (1)' }));
    expect(within(screen.getByRole('row', { name: /Eddie/ })).getByRole('button', { name: 'Delete Eddie’s account' })).toHaveTextContent('Delete account');
    expect(within(screen.getByRole('row', { name: /Ploy/ })).queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(within(screen.getByRole('row', { name: /Few/ })).queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('confirms with the name and email, then deletes, drops the row and refreshes the names elsewhere', async () => {
    const spy = mockServer();
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Show switched off (1)' }));
    await userEvent.click(within(screen.getByRole('row', { name: /Eddie/ })).getByRole('button', { name: 'Delete Eddie’s account' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete Eddie’s account (eddie@company.test)?');
    expect(dialog).toHaveTextContent("They can't sign in again with this account. Their name stays on past work, marked removed. This can't be undone.");
    expect(verbs(spy, 'DELETE')).toHaveLength(0);
    expect(within(dialog).getByRole('button', { name: 'Delete account' })).toHaveClass('btn--danger-solid');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    await vi.waitFor(() => expect(screen.queryByRole('row', { name: /Eddie/ })).toBeNull());
    expect(verbs(spy, 'DELETE')[0]![0]).toBe('/api/admin/users/c');
    expect(screen.getByRole('status')).toHaveTextContent('Eddie’s account was deleted.');
    await vi.waitFor(() => expect(spy.mock.calls.some(([u]) => String(u) === '/api/people')).toBe(true));
  });

  it('does not delete when you cancel', async () => {
    const spy = mockServer();
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Show switched off (1)' }));
    await userEvent.click(within(screen.getByRole('row', { name: /Eddie/ })).getByRole('button', { name: 'Delete Eddie’s account' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(verbs(spy, 'DELETE')).toHaveLength(0);
    expect(screen.getByRole('row', { name: /Eddie/ })).toBeInTheDocument();
  });

  it('shows the server’s refusal and keeps the row', async () => {
    const spy = mockServer();
    spy.mockImplementation(async (input, init) => (init?.method === 'DELETE' ? json({ error: { message: 'Switch Eddie off before deleting the account.' } }, 409) : json(all)));
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Show switched off (1)' }));
    await userEvent.click(within(screen.getByRole('row', { name: /Eddie/ })).getByRole('button', { name: 'Delete Eddie’s account' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Switch Eddie off before deleting the account.');
    expect(screen.getByRole('row', { name: /Eddie/ })).toBeInTheDocument();
  });

  it('reads in Thai: status label, actions, toggle and both confirmations', async () => {
    await useLangStore.getState().setLang('th');
    try {
      mockServer();
      render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
      const ploy = await screen.findByRole('row', { name: /Ploy/ });
      expect(within(ploy).getByText('ใช้งานอยู่')).toBeInTheDocument();
      await userEvent.click(within(ploy).getByRole('button', { name: 'ปิดใช้งาน Ploy' }));
      expect(screen.getByRole('alertdialog')).toHaveTextContent('ปิดใช้งาน Ploy?');
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'ยกเลิก' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'แสดงผู้ที่ปิดใช้งาน (1)' }));
      await userEvent.click(within(screen.getByRole('row', { name: /Eddie/ })).getByRole('button', { name: 'ลบบัญชีของ Eddie' }));
      expect(screen.getByRole('alertdialog')).toHaveTextContent('ลบบัญชีของ Eddie (eddie@company.test)?');
    } finally {
      await useLangStore.getState().setLang('en');
    }
  });

  it('words the delete confirmation for a company account as a blocked sign-in', async () => {
    const sso = { ...eddie, id: 'd', email: 'dao@company.test', displayName: 'Dao', source: 'oidc' };
    mockServer([...users, sso]);
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Show switched off (1)' }));
    await userEvent.click(within(screen.getByRole('row', { name: /Dao/ })).getByRole('button', { name: 'Delete Dao’s account' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent("Their company sign-in is blocked from Glasshouse until an admin adds them again. Their name stays on past work, marked removed. This can't be undone.");
    expect(dialog).not.toHaveTextContent("They can't sign in again");
  });

  it('shows the server’s refusal when a switch-off is refused, and keeps the row', async () => {
    const zedAdmin = { ...users[0], id: 'z', displayName: 'Zed', email: 'zed@company.test' };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => (init?.method === 'PATCH' ? json({ error: { message: 'This is the last admin. Make someone else an admin first.' } }, 409) : json([...users, zedAdmin])));
    render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
    await userEvent.click(within(await screen.findByRole('row', { name: /Zed/ })).getByRole('button', { name: 'Switch off Zed' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Switch off' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('last admin');
    expect(within(screen.getByRole('row', { name: /Zed/ })).getByText('Active')).toBeInTheDocument();
  });

  describe('keyboard focus after a row goes away', () => {
    const nok = { ...users[1], id: 'n', displayName: 'Nok', email: 'nok@company.test' };
    const zed = { ...eddie, id: 'z', displayName: 'Zed', email: 'zed@company.test' };

    it('moves to the next row’s Switch off after switching someone off', async () => {
      mockServer([...users, nok]);
      render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
      await userEvent.click(within(await screen.findByRole('row', { name: /Ploy/ })).getByRole('button', { name: 'Switch off Ploy' }));
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Switch off' }));
      await vi.waitFor(() => expect(screen.queryByRole('row', { name: /Ploy/ })).toBeNull());
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Switch off Nok' })).toHaveFocus());
    });

    it('moves to the Show switched off checkbox when no row below has that action', async () => {
      mockServer();
      render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
      await userEvent.click(within(await screen.findByRole('row', { name: /Ploy/ })).getByRole('button', { name: 'Switch off Ploy' }));
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Switch off' }));
      await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: 'Show switched off (2)' })).toHaveFocus());
    });

    it('moves to the next switched-off row’s Delete account after deleting, else to the checkbox', async () => {
      mockServer([...users, eddie, zed]);
      render(<MemoryRouter><UsersScreen /><ConfirmDialog /></MemoryRouter>);
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Show switched off (2)' }));
      await userEvent.click(within(screen.getByRole('row', { name: /Eddie/ })).getByRole('button', { name: 'Delete Eddie’s account' }));
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete account' }));
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Delete Zed’s account' })).toHaveFocus());
      await userEvent.click(screen.getByRole('button', { name: 'Delete Zed’s account' }));
      await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete account' }));
      await vi.waitFor(() => expect(screen.queryByRole('row', { name: /Zed/ })).toBeNull());
      await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: 'Show switched off (0)' })).toHaveFocus());
    });
  });
});
