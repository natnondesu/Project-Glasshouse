import { seedTemplates } from '@glasshouse/domain';
import { render, screen, within } from '@testing-library/react';
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
