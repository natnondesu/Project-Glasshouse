import { createHash } from 'node:crypto';
import type { RemovedSignIn, User } from './types';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Only hashes are kept, so a database leak does not hand out who was removed. The prefixes keep the two kinds apart. */
export const hashSubject = (subject: string): string => sha256(`subject:${subject}`);
export const hashEmail = (email: string): string => sha256(`email:${email.trim().toLowerCase()}`);

export const removalFor = (user: User, removedBy: string, removedAt: string): RemovedSignIn => ({
  subjectHash: user.oidcSubject ? hashSubject(user.oidcSubject) : null,
  emailHash: hashEmail(user.email),
  removedAt,
  removedBy,
});
