import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';
import { Toolbar } from './Toolbar';
import type { Tool } from './tools';

function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const [tool, setTool] = useState<Tool>('select');
  return (
    <>
      <Toolbar tool={tool} onTool={setTool} readOnly={readOnly} />
      <output data-testid="tool">{tool}</output>
    </>
  );
}

beforeEach(() => localStorage.clear());

it('groups tools: Select and Pan alone, then Floor, Objects, Measure and Power with their first tool showing', () => {
  render(<Harness />);
  const bar = screen.getByRole('toolbar', { name: 'Plan tools' });
  for (const name of ['Select', 'Pan', 'Add floor area', 'Place rack', 'Measure', 'Place MCB panel']) expect(within(bar).getByRole('button', { name })).toBeInTheDocument();
  for (const group of ['Floor', 'Objects', 'Measure', 'Power source']) expect(within(bar).getByRole('button', { name: `More ${group} tools` })).toBeInTheDocument();
  expect(within(bar).queryByRole('button', { name: 'Place door' })).toBeNull();
});

it('picks a tool from a group flyout; the group then shows that tool', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'More Power source tools' }));
  const menu = screen.getByRole('menu', { name: 'Power source tools' });
  expect(within(menu).getAllByRole('menuitemradio').map((i) => i.querySelector('.tool-flyout__name')!.textContent)).toEqual([
    'MCB panel',
    'Wall plug',
    'Industrial socket (IEC 60309)',
    'Floor box',
    'UPS',
    '3rd-party PDU',
  ]);
  await user.click(within(menu).getByRole('menuitemradio', { name: 'UPS' }));
  expect(screen.getByTestId('tool')).toHaveTextContent('ups');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(screen.getByRole('button', { name: 'Place UPS' })).toHaveAttribute('aria-pressed', 'true');
});

it('explains every tool on hover with what it does and its shortcut', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.hover(screen.getByRole('button', { name: 'Measure' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent(/Measure.*temporary.*M/);
});

it('offers only viewing tools on a frozen revision', () => {
  render(<Harness readOnly />);
  const bar = screen.getByRole('toolbar', { name: 'Plan tools' });
  expect(within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Select', 'Pan', 'Measure']);
});
