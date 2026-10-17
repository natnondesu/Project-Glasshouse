import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetAuthStore, useAuthStore } from '../auth/authStore';
import type { Role } from '../auth/authApi';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { ConfirmDialog } from '../ui/confirm/ConfirmDialog';
import { RoomClaimBanner } from './RoomClaimBanner';
import { CLAIM_IDLE_MS, resetClaimsStore, useClaimsStore, type Claim } from './claimsStore';

const flush = vi.fn(async () => {});
vi.mock('../sync/serverMode', () => ({ getActiveSync: () => ({ flush }) }));

const minutesAgo = (n: number): string => new Date(Date.now() - n * 60_000).toISOString();
const claim = (userId: string, name: string, lastEditAt: string): Claim => ({ roomId: 'r', userId, name, since: lastEditAt, lastEditAt });
const signInAs = (role: Role) => useAuthStore.setState({ status: 'signed-in', user: { id: 'u-me', name: 'Me', email: 'me@x', role, mustChangePassword: false } });
const hold = (c: Claim) => useClaimsStore.getState().setClaims([c]);
const ui = () => render(<><RoomClaimBanner roomId="r" /><ConfirmDialog /></>);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetAuthStore();
  resetClaimsStore();
  resetWorkspaceStore();
  flush.mockClear();
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("shows who is editing and when they last edited, and holds the editor back until they've been idle 15 minutes", () => {
  signInAs('editor');
  hold(claim('u-ada', 'Ada', minutesAgo(3)));
  ui();
  expect(screen.getByRole('region', { name: 'Ada is editing this room.' })).toHaveTextContent('Last edit 3 minutes ago.');
  expect(screen.queryByRole('button', { name: 'Take over' })).toBeNull();
  expect(screen.getByText('You can take over after 15 minutes without edits.')).toBeInTheDocument();
});

it('offers Take over to an editor once the holder has been idle for 15 minutes', () => {
  signInAs('editor');
  hold(claim('u-ada', 'Ada', new Date(Date.now() - CLAIM_IDLE_MS - 1000).toISOString()));
  ui();
  expect(screen.getByRole('button', { name: 'Take over' })).toBeInTheDocument();
});

it('offers Take over to an admin at once', () => {
  signInAs('admin');
  hold(claim('u-ada', 'Ada', minutesAgo(0)));
  ui();
  expect(screen.getByRole('button', { name: 'Take over' })).toBeInTheDocument();
});

it('asks before taking over, then claims the room and shows it as mine', async () => {
  const user = userEvent.setup();
  signInAs('admin');
  hold(claim('u-ada', 'Ada', minutesAgo(1)));
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ claim: claim('u-me', 'Me', new Date().toISOString()) }), { status: 200 }));
  ui();
  await user.click(screen.getByRole('button', { name: 'Take over' }));
  expect(screen.getByRole('alertdialog', { name: 'Take over from Ada?' })).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
  await user.click(screen.getAllByRole('button', { name: 'Take over' }).at(-1)!);
  await screen.findByRole('region', { name: "You're editing this room. Others can look while you work." });
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/claims/r');
  expect(init.method).toBe('POST');
  expect(init.headers).toEqual({ 'x-glasshouse': '1' });
});

it('sends what is unsent, then hands the room back, with no content-type', async () => {
  const user = userEvent.setup();
  signInAs('editor');
  hold(claim('u-me', 'Me', minutesAgo(0)));
  ui();
  await user.click(screen.getByRole('button', { name: 'Done editing' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(flush).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/claims/r');
  expect(init.method).toBe('DELETE');
  expect(init.headers).toEqual({ 'x-glasshouse': '1' });
  expect(flush.mock.invocationCallOrder[0]!).toBeLessThan(fetchMock.mock.invocationCallOrder[0]!);
});

it('says so when the room could not be handed back', async () => {
  const user = userEvent.setup();
  signInAs('editor');
  hold(claim('u-me', 'Me', minutesAgo(0)));
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 500 }));
  ui();
  await user.click(screen.getByRole('button', { name: 'Done editing' }));
  await waitFor(() => expect(useWorkspaceStore.getState().notice).toBe("Couldn't hand the room back. Others can take over after 15 minutes without edits."));
});

it('renders nothing when nobody is signed in', () => {
  hold(claim('u-ada', 'Ada', minutesAgo(1)));
  const { container } = ui();
  expect(container).toBeEmptyDOMElement();
});
