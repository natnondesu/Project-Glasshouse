import { createWorkspace, withSample, type HistoryEvent, type Issue } from '@glasshouse/domain';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { routes } from '../app/routes';
import { historyText, issueText } from '../features/plan/issueText';
import { resetWorkspaceStore, useWorkspaceStore } from '../store/workspaceStore';
import { en } from './en';
import { useLangStore } from './lang';
import { th } from './th';

const AT = '2026-10-15T00:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
  const seeded = withSample(createWorkspace(), AT);
  if (!seeded.ok) throw new Error(seeded.error.message);
  useWorkspaceStore.getState().replace(seeded.value);
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
});
afterEach(() => act(() => useLangStore.getState().setLang('en')));

describe('language switch', () => {
  it('switches the interface to Thai, remembers it and sets the page language', async () => {
    const user = userEvent.setup();
    const room = useWorkspaceStore.getState().workspace.projects[0]!.sites[0]!.rooms[1]!;
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/rooms/${room.id}/plan`] })} />);
    expect(screen.getByRole('link', { name: 'Elevation' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ไทย' }));
    expect(screen.getByRole('link', { name: 'ด้านหน้าแร็ค' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'การตรวจสอบ' })).toBeInTheDocument();
    expect(localStorage.getItem('glasshouse:lang')).toBe('th');
    expect(document.documentElement.lang).toBe('th');
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('link', { name: 'Elevation' })).toBeInTheDocument();
  });
});

describe('domain wording', () => {
  const issue: Issue = {
    key: 'k',
    code: 'clearance_obstructed',
    severity: 'block',
    message: 'EX-01 sits inside the front clearance zone of RK-C1.',
    hint: "Move EX-01, or reduce RK-C1's front clearance if agreed.",
    params: { other: 'EX-01', side: 'front', rack: 'RK-C1' },
    targets: [],
  };

  it('shows checks in English as the domain words them, and in Thai from their code', () => {
    expect(issueText(en, issue).message).toBe(issue.message);
    expect(issueText(th, issue)).toEqual({ message: 'EX-01 อยู่ในระยะเว้นว่างด้านหน้าของ RK-C1', hint: 'ย้าย EX-01 หรือลดระยะเว้นว่างด้านหน้าของ RK-C1 หากตกลงกันแล้ว' });
  });

  it('words new history events in Thai and keeps older ones as recorded', () => {
    const coded: HistoryEvent = { revision: 1, action: 'Approved by Nok (unverified)', at: AT, code: 'approved', params: { by: 'Nok' } };
    const legacy: HistoryEvent = { revision: 1, action: 'Approved by Nok (unverified)', at: AT };
    expect(historyText(th, coded)).toBe('อนุมัติโดย Nok (ยังไม่ยืนยันตัวตน)');
    expect(historyText(th, legacy)).toBe('Approved by Nok (unverified)');
  });

  it('has Thai wording for every check code the domain can raise', () => {
    const codes = ['footprint_empty', 'footprint_disconnected', 'object_outside_footprint', 'object_overlap', 'clearance_outside_footprint', 'clearance_obstructed', 'clearance_door', 'device_too_deep', 'demand_unknown', 'reserved_demand_unknown', 'over_design_limit', 'feed_no_way', 'feed_overload', 'link_media_mismatch'];
    expect(codes.filter((c) => !th.issues[c])).toEqual([]);
  });
});
