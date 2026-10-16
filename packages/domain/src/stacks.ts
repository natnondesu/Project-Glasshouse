import { findRackDevice } from './devices';
import type { Id, PlanContent, RackDevice, Stack } from './model/types';
import { err, ok, type Result } from './result';

const NAME_MAX = 32;
export const MAX_STACK_MEMBERS = 9;

export type StackCommand =
  | { type: 'stack/create'; stack: Stack }
  | { type: 'stack/rename'; id: Id; name: string }
  | { type: 'stack/remove'; id: Id }
  /** Adds the device to the stack, or renumbers it; `member: null` takes it out. */
  | { type: 'stack/member'; id: Id; deviceId: Id; member: number | null };

export const stacksOf = (content: PlanContent): Stack[] => content.stacks ?? [];

/** The stack a device is a member of, with its member number. */
export function stackOf(content: PlanContent, deviceId: Id): { stack: Stack; member: number } | null {
  for (const stack of stacksOf(content)) {
    const m = stack.members.find((x) => x.deviceId === deviceId);
    if (m) return { stack, member: m.member };
  }
  return null;
}

/** Network gear placed in a rack can stack; nodes and other gear can't. */
const canStack = (d: RackDevice | undefined): boolean => d?.kind === 'device' && d.category === 'network';

const withStacks = (content: PlanContent, stacks: Stack[]): PlanContent => {
  const { stacks: _old, ...rest } = content;
  return stacks.length ? { ...rest, stacks } : rest;
};

function checkName(content: PlanContent, name: string, except: Id | null): Result<string> {
  const n = name.trim();
  if (n.length === 0 || n.length > NAME_MAX) return err('invalid_value', `Stack names are 1 to ${NAME_MAX} characters.`, []);
  if (stacksOf(content).some((s) => s.id !== except && s.name.toLowerCase() === n.toLowerCase())) return err('invalid_value', `A stack named ${n} already exists.`, []);
  return ok(n);
}

function checkMember(content: PlanContent, stack: Stack, deviceId: Id, member: number): Result<null> {
  const device = findRackDevice(content, deviceId)?.device;
  if (!canStack(device)) return err('invalid_value', 'Only network devices in a rack can join a stack.', [deviceId]);
  if (!Number.isInteger(member) || member < 1 || member > MAX_STACK_MEMBERS) return err('invalid_value', `Member numbers are 1 to ${MAX_STACK_MEMBERS}.`, [deviceId]);
  const other = stackOf(content, deviceId);
  if (other && other.stack.id !== stack.id) return err('invalid_value', `${device!.name} is already in stack ${other.stack.name}.`, [deviceId]);
  const taken = stack.members.find((m) => m.member === member && m.deviceId !== deviceId);
  if (taken) return err('invalid_value', `Member ${member} of ${stack.name} is already ${findRackDevice(content, taken.deviceId)?.device.name ?? 'taken'}.`, [deviceId]);
  return ok(null);
}

export function applyStackCommand(content: PlanContent, cmd: StackCommand): Result<PlanContent> {
  const stacks = stacksOf(content);
  switch (cmd.type) {
    case 'stack/create': {
      if (stacks.some((s) => s.id === cmd.stack.id)) return err('invalid_value', 'That ID is already in use.', [cmd.stack.id]);
      const name = checkName(content, cmd.stack.name, null);
      if (!name.ok) return name;
      if (cmd.stack.members.length === 0) return err('invalid_value', 'A stack starts with at least one switch.', []);
      let stack: Stack = { id: cmd.stack.id, name: name.value, members: [] };
      for (const m of cmd.stack.members) {
        const ok_ = checkMember({ ...content, stacks: [...stacks, stack] }, stack, m.deviceId, m.member);
        if (!ok_.ok) return ok_;
        stack = { ...stack, members: [...stack.members, m] };
      }
      return ok(withStacks(content, [...stacks, stack]));
    }
    case 'stack/rename': {
      const stack = stacks.find((s) => s.id === cmd.id);
      if (!stack) return err('not_found', 'That stack no longer exists.', [cmd.id]);
      const name = checkName(content, cmd.name, cmd.id);
      if (!name.ok) return name;
      return ok(withStacks(content, stacks.map((s) => (s.id === cmd.id ? { ...s, name: name.value } : s))));
    }
    case 'stack/remove':
      if (!stacks.some((s) => s.id === cmd.id)) return err('not_found', 'That stack no longer exists.', [cmd.id]);
      return ok(withStacks(content, stacks.filter((s) => s.id !== cmd.id)));
    case 'stack/member': {
      const stack = stacks.find((s) => s.id === cmd.id);
      if (!stack) return err('not_found', 'That stack no longer exists.', [cmd.id]);
      const others = stack.members.filter((m) => m.deviceId !== cmd.deviceId);
      if (cmd.member === null) return ok(withStacks(content, stacks.map((s) => (s.id === cmd.id ? { ...s, members: others } : s))));
      const valid = checkMember(content, stack, cmd.deviceId, cmd.member);
      if (!valid.ok) return valid;
      const members = [...others, { deviceId: cmd.deviceId, member: cmd.member }].sort((a, b) => a.member - b.member);
      return ok(withStacks(content, stacks.map((s) => (s.id === cmd.id ? { ...s, members } : s))));
    }
  }
}

/** A device removed, or no longer network gear, leaves its stack; a stack left with no members goes too. */
export function pruneStacks(content: PlanContent): PlanContent {
  const stacks = stacksOf(content);
  if (stacks.length === 0) return content;
  const next = stacks.map((s) => ({ ...s, members: s.members.filter((m) => canStack(findRackDevice(content, m.deviceId)?.device)) })).filter((s) => s.members.length > 0);
  const same = next.length === stacks.length && next.every((s, i) => s.members.length === stacks[i]!.members.length);
  return same ? content : withStacks(content, next);
}

/** The lowest member number still free in a stack, for the next switch to join. */
export const nextMemberNumber = (stack: Stack): number => {
  for (let n = 1; n <= MAX_STACK_MEMBERS; n += 1) if (!stack.members.some((m) => m.member === n)) return n;
  return MAX_STACK_MEMBERS + 1;
};
