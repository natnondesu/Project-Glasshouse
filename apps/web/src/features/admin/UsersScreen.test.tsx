import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from '../../auth/authStore';
import { UsersScreen } from './UsersScreen';

const users = [
  { id: 'a', email: 'few@company.test', displayName: 'Few', role: 'admin', source: 'oidc', active: true, mustChangePassword: false, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: '2026-10-18T08:00:00.000Z' },
  { id: 'b', email: 'ploy@company.test', displayName: 'Ploy', role: 'viewer', source: 'local', active: true, mustChangePassword: true, createdAt: '2026-10-18T00:00:00.000Z', lastLoginAt: null },
];

beforeEach(() => {
  resetAuthStore();
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
  render(<MemoryRouter><UsersScreen /></MemoryRouter>);
  const row = (await screen.findByRole('row', { name: /Ploy/ }));
  expect(within(row).getByText('Local')).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: 'Reset password for Ploy' })).toBeInTheDocument();
  expect(within(row).getByRole('button', { name: 'Switch off Ploy' })).toHaveTextContent('Active');
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
  render(<MemoryRouter><UsersScreen /></MemoryRouter>);
  const row = await screen.findByRole('row', { name: /Few/ });
  await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Role for Few' }), 'editor');
  expect(await screen.findByRole('alert')).toHaveTextContent('last admin');
});

it('turns non-admins away', () => {
  useAuthStore.setState({ status: 'signed-in', user: { id: 'b', name: 'Ploy', email: 'p@x', role: 'editor', mustChangePassword: false } });
  render(<MemoryRouter><UsersScreen /></MemoryRouter>);
  expect(screen.getByText('Only admins can manage users.')).toBeInTheDocument();
});

it('shows a localized fallback when the server gives no message or cannot be reached', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => (init?.method === 'PATCH' ? new Response('', { status: 500 }) : json(users)));
  render(<MemoryRouter><UsersScreen /></MemoryRouter>);
  const row = await screen.findByRole('row', { name: /Ploy/ });
  await userEvent.selectOptions(within(row).getByRole('combobox', { name: 'Role for Ploy' }), 'editor');
  expect(await screen.findByRole('alert')).toHaveTextContent('The server answered 500.');
  spy.mockImplementation(async (_input, init) => {
    if (init?.method === 'PATCH') throw new TypeError('Failed to fetch');
    return json(users);
  });
  await userEvent.click(within(row).getByRole('button', { name: 'Switch off Ploy' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the Glasshouse server');
});
