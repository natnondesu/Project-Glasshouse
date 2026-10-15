import { seedTemplates } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { CatalogPalette } from './CatalogPalette';

it('lists the catalog under category headings, in the Catalog screen order, each device under its own', () => {
  const catalog = seedTemplates();
  render(
    <MemoryRouter>
      <CatalogPalette catalog={catalog} activeRack={null} onAdd={() => {}} />
    </MemoryRouter>,
  );
  const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.firstChild?.textContent);
  const order = ['Server', 'Chassis', 'Network', 'Power', 'Misc'];
  expect(headings).toEqual(order.filter((h) => headings.includes(h)));
  for (const t of catalog) {
    const group = screen.getByRole('region', { name: new RegExp(`^${t.category === 'server' ? 'Server' : t.category[0]!.toUpperCase() + t.category.slice(1)}`) });
    expect(within(group).getByText(t.label)).toBeInTheDocument();
  }
});

it('filters the catalog as you type, says how many match, and clears on Escape', async () => {
  const user = userEvent.setup();
  const catalog = seedTemplates();
  render(
    <MemoryRouter>
      <CatalogPalette catalog={catalog} activeRack={null} onAdd={() => {}} />
    </MemoryRouter>,
  );
  const box = screen.getByRole('searchbox', { name: 'Filter catalog' });
  await user.type(box, 'network');
  const network = catalog.filter((t) => t.category === 'network');
  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.firstChild?.textContent)).toEqual(['Network']);
  expect(screen.getByRole('status')).toHaveTextContent(`${network.length} of ${catalog.length} templates`);
  await user.clear(box);
  await user.type(box, 'nothing like this');
  expect(screen.getByRole('status')).toHaveTextContent('No template matches “nothing like this”.');
  await user.keyboard('{Escape}');
  expect(box).toHaveValue('');
  expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(1);
});
