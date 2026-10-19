import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';
import { queryWords } from './homeSearch';

const marked = (text: string, query: string): string =>
  highlight(text, queryWords(query))
    .map((p) => (p.mark ? `[${p.text}]` : p.text))
    .join('');

describe('marking what a search matched in a name', () => {
  it('marks every word where it is found, in the name’s own letters', () => {
    expect(highlight('Server room A', ['room'])).toEqual([
      { text: 'Server ', mark: false },
      { text: 'room', mark: true },
      { text: ' A', mark: false },
    ]);
    expect(marked('Shaft L2', 'L2 sha')).toBe('[Sha]ft [L2]');
  });

  it('ignores case and Latin accents, as the search does', () => {
    expect(marked('Café Rénové', 'CAFE renove')).toBe('[Café] [Rénové]');
    // Text already decomposed keeps its accents inside the mark.
    expect(marked('Café', 'cafe')).toBe('[Café]');
  });

  it('ignores Thai tone marks, and never splits a tone mark from its letter', () => {
    expect(marked('ห้องเซิร์ฟเวอร์ ชั้น 3', 'หอง')).toBe('[ห้อง]เซิร์ฟเวอร์ ชั้น 3');
    expect(marked('ห้อง', 'ห')).toBe('[ห้]อง');
    expect(marked('ห้องเซิร์ฟเวอร์', 'เซิรฟ')).toBe('ห้อง[เซิร์ฟ]เวอร์');
  });

  it('joins overlapping matches into one mark', () => {
    expect(marked('Shaft L2', 'sh haft')).toBe('[Shaft] L2');
  });

  it('marks nothing without words or a match', () => {
    expect(highlight('Bangna campus', [])).toEqual([{ text: 'Bangna campus', mark: false }]);
    expect(marked('Bangna campus', 'xyz')).toBe('Bangna campus');
    expect(highlight('', ['a'])).toEqual([]);
  });
});
