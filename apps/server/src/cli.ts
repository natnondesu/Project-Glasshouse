import { randomUUID } from 'node:crypto';
import { hashPassword, temporaryPassword } from './identity/passwords';
import { PgIdentityStore } from './identity/pgIdentityStore';
import type { IdentityStore } from './identity/types';

const USAGE = 'Usage: node dist/cli.js create-admin <email> "<Display Name>" | reset-password <email>';

/** Exit codes: 0 done, 1 refused, 2 usage. The one-time password is printed once and never stored in clear. */
export async function runCli(args: string[], store: IdentityStore, print: (line: string) => void, now: () => Date = () => new Date()): Promise<number> {
  const [cmd, email, ...nameParts] = args;
  if (cmd === 'create-admin' && email && nameParts.length > 0) {
    if (await store.findUserByEmail(email)) {
      print(`A user with ${email} already exists.`);
      return 1;
    }
    const temp = temporaryPassword();
    await store.createUser({
      id: randomUUID(), email, displayName: nameParts.join(' ').trim(), role: 'admin', source: 'local', oidcSubject: null,
      passwordHash: await hashPassword(temp), mustChangePassword: true, active: true, createdAt: now().toISOString(), lastLoginAt: null,
    });
    print(`Created admin ${email}.`);
    print(`Temporary password: ${temp}`);
    print('They change it at first sign-in.');
    return 0;
  }
  if (cmd === 'reset-password' && email) {
    const user = await store.findUserByEmail(email);
    if (!user || user.source !== 'local') {
      print(`No local account for ${email}.`);
      return 1;
    }
    const temp = temporaryPassword();
    await store.updateUser(user.id, { passwordHash: await hashPassword(temp), mustChangePassword: true });
    await store.deleteUserSessions(user.id);
    print(`Temporary password: ${temp}`);
    return 0;
  }
  print(USAGE);
  return 2;
}

const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required.');
    process.exit(2);
  }
  const store = await PgIdentityStore.connect(url);
  const code = await runCli(process.argv.slice(2), store, (l) => console.log(l));
  await store.close();
  process.exit(code);
}
