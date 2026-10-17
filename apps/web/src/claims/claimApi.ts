import { messagesFor, useLangStore } from '../i18n';
import type { Claim } from './claimsStore';

const t = () => messagesFor(useLangStore.getState().lang).claims;

async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new Error(body?.error?.message ?? t().requestFailed(res.status));
}

async function send(method: 'POST' | 'DELETE', roomId: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`/api/claims/${encodeURIComponent(roomId)}`, { method, headers: { 'x-glasshouse': '1' } });
  } catch {
    throw new Error(t().unreachable);
  }
  if (!res.ok) throw await failure(res);
  return res;
}

export async function claimRoom(roomId: string): Promise<Claim> {
  return ((await (await send('POST', roomId)).json()) as { claim: Claim }).claim;
}

export async function releaseRoom(roomId: string): Promise<void> {
  await send('DELETE', roomId);
}
