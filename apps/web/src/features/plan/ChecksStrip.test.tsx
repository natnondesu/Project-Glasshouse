import type { Issue } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ChecksStrip } from './ChecksStrip';

const issue = (over: Partial<Issue>): Issue => ({
  key: 'k',
  code: 'clearance_obstructed',
  severity: 'block',
  message: 'EX-01 sits inside the front clearance zone of RK-C1.',
  hint: 'Move EX-01.',
  params: { other: 'EX-01', side: 'front', rack: 'RK-C1' },
  targets: ['ex'],
  ...over,
});

it('summarises counts and selects the target object', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <ChecksStrip
      issues={[issue({}), issue({ key: 'w', severity: 'warn', code: 'clearance_door', message: 'D-01 is inside the front clearance of RK-C1.', targets: ['d'] })]}
      objects={[{ id: 'ex', name: 'EX-01' }, { id: 'd', name: 'D-01' }] as never}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByText('1 blocks approval')).toBeInTheDocument();
  expect(screen.getByText('1 warning')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Select EX-01' }));
  expect(onSelect).toHaveBeenCalledWith('ex');
});

it('says so when there are no issues', () => {
  render(<ChecksStrip issues={[]} objects={[]} onSelect={() => {}} />);
  expect(screen.getByText('No issues found')).toBeInTheDocument();
});

it('folds to its heading and counts, and remembers it', async () => {
  const user = userEvent.setup();
  localStorage.clear();
  const { unmount } = render(<ChecksStrip issues={[issue({})]} objects={[{ id: 'x', name: 'EX-01' }]} onSelect={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Hide checks' }));
  expect(screen.queryByText('EX-01 sits inside the front clearance zone of RK-C1.')).toBeNull();
  expect(screen.getByText('1 blocks approval')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show checks' })).toHaveAttribute('aria-expanded', 'false');
  unmount();
  render(<ChecksStrip issues={[issue({})]} objects={[{ id: 'x', name: 'EX-01' }]} onSelect={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Show checks' })).toBeInTheDocument();
});

it('counts what holds approval the way the Review badge does, and points to notes without counting them', () => {
  render(
    <MemoryRouter>
      <ChecksStrip
        issues={[issue({ key: 'a' }), issue({ key: 'b', severity: 'needs_ack', code: 'unknown_demand' as Issue['code'] }), issue({ key: 'c', severity: 'warn', code: 'clearance_door' })]}
        objects={[{ id: 'x', name: 'EX-01' }]}
        onSelect={vi.fn()}
        notes={{ count: 2, href: '/rooms/r/review' }}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText('1 blocks approval')).toBeInTheDocument();
  expect(screen.getByText('1 to acknowledge')).toBeInTheDocument();
  expect(screen.getByText('1 warning')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '2 notes' })).toHaveAttribute('href', '/rooms/r/review');
});
