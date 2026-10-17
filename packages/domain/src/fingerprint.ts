import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { canonicalJson } from './canonical';
import type { PlanContent } from './model/types';

const SHORT_LENGTH = 12;

/** What an approval vouches for: the revision's content, independent of key order. */
export const contentFingerprint = (content: PlanContent): string => bytesToHex(sha256(utf8ToBytes(canonicalJson(content))));

export const shortFingerprint = (hash: string): string => hash.slice(0, SHORT_LENGTH);
