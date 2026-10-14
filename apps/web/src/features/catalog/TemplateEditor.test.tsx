import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { blankTemplate, TemplateEditor } from './TemplateEditor';

it('offers the Misc category for passive gear', () => {
  render(<TemplateEditor mode="create" initial={{ ...blankTemplate(), category: 'misc' }} onDone={() => {}} />);
  expect(screen.getByRole('option', { name: 'Misc' })).toBeInTheDocument();
});
