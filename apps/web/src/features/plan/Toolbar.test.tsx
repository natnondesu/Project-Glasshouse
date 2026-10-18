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

it('groups tools: Select and Pan alone, then Floor, Racks, Doors, Furniture, Measure and Power, each showing its default tool', () => {
  render(<Harness />);
  const bar = screen.getByRole('toolbar', { name: 'Plan tools' });
  expect(within(bar).getAllByRole('button').filter((b) => !b.classList.contains('tool-group__more')).map((b) => b.getAttribute('aria-label'))).toEqual([
    'Select',
    'Pan',
    'Add floor area',
    'Place rack',
    'Place door',
    'Place furniture',
    'Measure',
    'Place MCB panel',
  ]);
  for (const group of ['Floor', 'Racks', 'Doors', 'Measure', 'Power source']) expect(within(bar).getByRole('button', { name: `More ${group} tools` })).toBeInTheDocument();
  expect(within(bar).queryByRole('button', { name: 'More Furniture tools' })).toBeNull();
  expect(within(bar).queryByRole('button', { name: /Objects/ })).toBeNull();
});

it('lists each group’s tools in its flyout, default first', async () => {
  const user = userEvent.setup();
  const names = async (group: string): Promise<(string | null)[]> => {
    await user.click(screen.getByRole('button', { name: `More ${group} tools` }));
    const items = within(screen.getByRole('menu', { name: `${group} tools` })).getAllByRole('menuitemradio').map((i) => i.querySelector('.tool-flyout__name')!.textContent);
    await user.keyboard('{Escape}');
    return items;
  };
  render(<Harness />);
  expect(await names('Floor')).toEqual(['Add floor area', 'Cut out']);
  expect(await names('Racks')).toEqual(['Rack', 'Wall rack', 'Existing rack']);
  expect(await names('Doors')).toEqual(['Door', 'Sliding door']);
  expect(await names('Measure')).toEqual(['Measure', 'Dimension']);
  expect(await names('Power source')).toEqual(['MCB panel', 'Wall plug', 'Industrial socket (IEC 60309)', 'Floor box', 'UPS', '3rd-party PDU']);
});

it('selects the default tool when a group button is clicked, opening nothing', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Place rack' }));
  expect(screen.getByTestId('tool')).toHaveTextContent('rack');
  expect(screen.queryByRole('menu')).toBeNull();
});

it('picks a variant from the flyout; the group keeps its default icon, is pressed, and names the variant', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const rackIcon = screen.getByRole('button', { name: 'Place rack' }).innerHTML;
  await user.click(screen.getByRole('button', { name: 'More Racks tools' }));
  const menu = screen.getByRole('menu', { name: 'Racks tools' });
  await user.click(within(menu).getByRole('menuitemradio', { name: 'Wall rack' }));
  expect(screen.getByTestId('tool')).toHaveTextContent('wall_rack');
  expect(screen.queryByRole('menu')).toBeNull();
  const group = screen.getByRole('button', { name: 'Wall rack — Racks tools' });
  expect(group).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'Place rack' })).toBeNull();
  expect(group.innerHTML).toBe(rackIcon);
  await user.click(screen.getByRole('button', { name: 'More Racks tools' }));
  expect(screen.getByRole('menuitemradio', { name: 'Wall rack' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('menuitemradio', { name: 'Rack' })).toHaveAttribute('aria-checked', 'false');
});

it('never swaps a group’s icon for the last tool used', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const iconBefore = screen.getByRole('button', { name: 'Place rack' }).innerHTML;
  await user.click(screen.getByRole('button', { name: 'More Racks tools' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Existing rack' }));
  await user.click(screen.getByRole('button', { name: 'Select' }));
  expect(screen.getByRole('button', { name: 'Place rack' }).innerHTML).toBe(iconBefore);
});

it('shows the active variant’s hint on its group button', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'More Doors tools' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Sliding door' }));
  await user.hover(screen.getByRole('button', { name: 'Sliding door — Doors tools' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent(/sliding door.*needs no swing space/i);
});

it('makes Furniture a plain button with no flyout arrow', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const furniture = screen.getByRole('button', { name: 'Place furniture' });
  expect(furniture).not.toHaveAttribute('aria-haspopup');
  await user.click(furniture);
  expect(screen.getByTestId('tool')).toHaveTextContent('furniture');
  expect(furniture).toHaveAttribute('aria-pressed', 'true');
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

it('offers only viewing tools on a frozen revision', () => {
  render(<Harness readOnly />);
  const bar = screen.getByRole('toolbar', { name: 'Plan tools' });
  expect(within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Select', 'Pan', 'Measure']);
});

it('moves through a group’s flyout with the arrow keys, and Escape hands focus back to its arrow', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const more = screen.getByRole('button', { name: 'More Racks tools' });
  await user.click(more);
  const menu = screen.getByRole('menu', { name: 'Racks tools' });
  expect(within(menu).getByRole('menuitemradio', { name: 'Rack' })).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(within(menu).getByRole('menuitemradio', { name: 'Wall rack' })).toHaveFocus();
  await user.keyboard('{ArrowUp}{ArrowUp}');
  expect(within(menu).getByRole('menuitemradio', { name: 'Existing rack' })).toHaveFocus();
  await user.keyboard('{Home}');
  expect(within(menu).getByRole('menuitemradio', { name: 'Rack' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(more).toHaveFocus();
});

it('draws a group’s flyout on a solid surface, not glass', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'More Power source tools' }));
  const menu = screen.getByRole('menu', { name: 'Power source tools' });
  expect(menu).toHaveClass('popover-surface');
  expect(menu).not.toHaveClass('glass');
});
