import type { Issue } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
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
