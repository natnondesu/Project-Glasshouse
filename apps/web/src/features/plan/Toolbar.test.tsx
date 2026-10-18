import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';
import { Toolbar } from './Toolbar';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TOOL_SPECS, type Tool } from './tools';

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

it('groups tools: Select and Pan alone, then Floor, Racks, Walls & doors, Furniture, Cooling, Measure and Power, each showing its default tool', () => {
  render(<Harness />);
  const bar = screen.getByRole('toolbar', { name: 'Plan tools' });
  expect(within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
    'Select',
    'Pan',
    'Floor tools',
    'Racks tools',
    'Walls & doors tools',
    'Furniture tools',
    'Cooling tools',
    'Measure tools',
    'Power source tools',
  ]);
  for (const group of ['Floor', 'Racks', 'Walls & doors', 'Furniture', 'Cooling', 'Measure', 'Power source']) expect(within(bar).getByRole('button', { name: `${group} tools` })).toHaveAttribute('aria-haspopup', 'menu');
  expect(within(bar).queryByRole('button', { name: /Objects/ })).toBeNull();
});

it('lists each group’s tools in its flyout, default first', async () => {
  const user = userEvent.setup();
  const names = async (group: string): Promise<(string | null)[]> => {
    await user.click(screen.getByRole('button', { name: `${group} tools` }));
    const items = within(screen.getByRole('menu', { name: `${group} tools` })).getAllByRole('menuitemradio').map((i) => i.querySelector('.tool-flyout__name')!.textContent);
    await user.keyboard('{Escape}');
    return items;
  };
  render(<Harness />);
  expect(await names('Floor')).toEqual(['Add floor area', 'Cut out']);
  expect(await names('Racks')).toEqual(['Rack', 'Wall rack', 'Existing rack']);
  expect(await names('Walls & doors')).toEqual(['Door', 'Sliding door', 'Partition']);
  expect(await names('Furniture')).toEqual(['Furniture', 'Display wall']);
  expect(await names('Cooling')).toEqual(['Wall split AC', 'Precision AC']);
  expect(await names('Measure')).toEqual(['Measure', 'Dimension']);
  expect(await names('Power source')).toEqual(['MCB panel', 'Wall plug', 'Industrial socket (IEC 60309)', 'Floor box', 'UPS', '3rd-party PDU']);
});

it('opens the list when a group button is clicked, picking nothing until a tool is chosen', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Racks tools' }));
  expect(screen.getByRole('menu', { name: 'Racks tools' })).toBeVisible();
  expect(screen.getByTestId('tool')).toHaveTextContent('select');
  await user.click(screen.getByRole('menuitemradio', { name: 'Rack' }));
  expect(screen.getByTestId('tool')).toHaveTextContent('rack');
});

it('hands focus back to the group button after a tool is chosen, so the plan still hears Escape', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Walls & doors tools' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Sliding door' }));
  expect(screen.queryByRole('menu')).toBeNull();
  expect(screen.getByRole('button', { name: 'Sliding door — Walls & doors tools' })).toHaveFocus();
});

it('picks a variant from the flyout; the group keeps its default icon, is pressed, and names the variant', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const rackIcon = screen.getByRole('button', { name: 'Racks tools' }).innerHTML;
  await user.click(screen.getByRole('button', { name: 'Racks tools' }));
  const menu = screen.getByRole('menu', { name: 'Racks tools' });
  await user.click(within(menu).getByRole('menuitemradio', { name: 'Wall rack' }));
  expect(screen.getByTestId('tool')).toHaveTextContent('wall_rack');
  expect(screen.queryByRole('menu')).toBeNull();
  const group = screen.getByRole('button', { name: 'Wall rack — Racks tools' });
  expect(group).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'Racks tools' })).toBeNull();
  expect(group.innerHTML).toBe(rackIcon);
  await user.click(group);
  expect(screen.getByRole('menuitemradio', { name: 'Wall rack' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('menuitemradio', { name: 'Rack' })).toHaveAttribute('aria-checked', 'false');
});

it('never swaps a group’s icon for the last tool used', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const iconBefore = screen.getByRole('button', { name: 'Racks tools' }).innerHTML;
  await user.click(screen.getByRole('button', { name: 'Racks tools' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Existing rack' }));
  await user.click(screen.getByRole('button', { name: 'Select' }));
  expect(screen.getByRole('button', { name: 'Racks tools' }).innerHTML).toBe(iconBefore);
});

it('shows the active variant’s hint on its group button', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Walls & doors tools' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Sliding door' }));
  await user.hover(screen.getByRole('button', { name: 'Sliding door — Walls & doors tools' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent(/sliding door.*needs no swing space/i);
});

it('puts the new objects in the rail in the order the plan decided, with Cooling after Furniture', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Furniture tools' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Display wall' }));
  expect(screen.getByTestId('tool')).toHaveTextContent('display_wall');
  expect(screen.getByRole('button', { name: 'Display wall — Furniture tools' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Cooling tools' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Precision AC' }));
  expect(screen.getByTestId('tool')).toHaveTextContent('precision_ac');
  await user.click(screen.getByRole('button', { name: 'Precision AC — Cooling tools' }));
  await user.click(screen.getByRole('menuitemradio', { name: 'Wall split AC' }));
  expect(screen.getByTestId('tool')).toHaveTextContent('wall_split_ac');
});

it('gives each new tool its own icon, not a stand-in shared with the furniture', () => {
  const icon = (tool: keyof typeof TOOL_SPECS) => renderToStaticMarkup(createElement(TOOL_SPECS[tool].Icon));
  const icons = ['partition', 'wall_split_ac', 'precision_ac', 'display_wall', 'furniture'].map((t) => icon(t as keyof typeof TOOL_SPECS));
  expect(new Set(icons).size).toBe(icons.length);
});

it('explains every tool on hover with what it does and its shortcut', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.hover(screen.getByRole('button', { name: 'Measure tools' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent(/Measure.*temporary.*M/);
});

it('offers only viewing tools on a frozen revision', () => {
  render(<Harness readOnly />);
  const bar = screen.getByRole('toolbar', { name: 'Plan tools' });
  expect(within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Select', 'Pan', 'Measure']);
});

it('moves through a group’s flyout with the arrow keys, and Escape hands focus back to the group button', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const more = screen.getByRole('button', { name: 'Racks tools' });
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
  await user.click(screen.getByRole('button', { name: 'Power source tools' }));
  const menu = screen.getByRole('menu', { name: 'Power source tools' });
  expect(menu).toHaveClass('popover-surface');
  expect(menu).not.toHaveClass('glass');
});
