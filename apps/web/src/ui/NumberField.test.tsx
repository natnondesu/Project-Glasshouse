import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberField, parseNumber } from './NumberField';

describe('parseNumber', () => {
  it('accepts partial and comma-decimal input', () => {
    expect(parseNumber('')).toEqual({ kind: 'empty' });
    expect(parseNumber('1.')).toEqual({ kind: 'ok', value: 1 });
    expect(parseNumber('1,5')).toEqual({ kind: 'ok', value: 1.5 });
    expect(parseNumber('-')).toEqual({ kind: 'invalid' });
    expect(parseNumber('2m')).toEqual({ kind: 'invalid' });
  });
});

describe('NumberField', () => {
  it('AC12: keeps focus and text while the value is invalid, and explains why', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(v: number | null) => string | null>(() => null);
    render(<NumberField id="w" label="Width" unit="m" value={5} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width');
    await user.clear(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('');
    expect(screen.getByText('Enter a value.')).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
    await user.type(input, '6.');
    expect(onCommit).toHaveBeenLastCalledWith(6);
    expect(input).toHaveValue('6.');
  });

  it('shows the domain error returned by onCommit', async () => {
    const user = userEvent.setup();
    render(<NumberField id="w" label="Width" value={5} onCommit={() => 'Room width must be between 1 and 50 m.'} />);
    await user.type(screen.getByLabelText('Width'), '0');
    expect(screen.getByText('Room width must be between 1 and 50 m.')).toBeInTheDocument();
    expect(screen.getByLabelText('Width')).toHaveAttribute('aria-invalid', 'true');
  });

  it('commits null when empty values are allowed', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(() => null);
    render(<NumberField id="h" label="Height" value={2.1} allowEmpty onCommit={onCommit} />);
    await user.clear(screen.getByLabelText('Height'));
    expect(onCommit).toHaveBeenLastCalledWith(null);
  });
});

describe('thousands separators', () => {
  it('reads "100,000" and "1,500" as thousands, not decimals', () => {
    expect(parseNumber('100,000')).toEqual({ kind: 'ok', value: 100000 });
    expect(parseNumber('1,500')).toEqual({ kind: 'ok', value: 1500 });
    expect(parseNumber('12,500.5')).toEqual({ kind: 'ok', value: 12500.5 });
    expect(parseNumber('1,5')).toEqual({ kind: 'ok', value: 1.5 });
  });
});

describe('commit on blur', () => {
  it('does not commit intermediate values while typing, only on blur or Enter', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(v: number | null) => string | null>(() => null);
    render(<NumberField id="u" label="Bottom U" decimals={0} value={20} commitOn="blur" onCommit={onCommit} />);
    const input = screen.getByLabelText('Bottom U');
    await user.clear(input);
    await user.type(input, '12');
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith(12);
    await user.clear(input);
    await user.type(input, '7');
    await user.tab();
    expect(onCommit).toHaveBeenLastCalledWith(7);
  });
});
