import { fold } from './homeSearch';

export interface Piece {
  text: string;
  mark: boolean;
}

/**
 * A name cut into the pieces a search matched and the rest, so the matches can be marked. Matching is on folded text
 * (case, Latin accents and Thai tone marks ignored), the pieces are the name's own letters; a mark never ends between
 * a letter and the tone mark or accent on it.
 */
export function highlight(text: string, words: readonly string[]): Piece[] {
  if (!text) return [];
  const chars = Array.from(text);
  // Each folded letter remembers which of the name's characters it came from.
  let folded = '';
  const from: number[] = [];
  chars.forEach((ch, i) => {
    for (const f of fold(ch)) {
      folded += f;
      from.push(i);
    }
  });
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const word of words) {
    if (!word) continue;
    for (let at = folded.indexOf(word); at >= 0; at = folded.indexOf(word, at + 1)) {
      let end = from[at + word.length - 1]! + 1;
      // Marks that fold away (tone marks, accents) belong to the letter before them.
      while (end < chars.length && fold(chars[end]!) === '') end++;
      for (let i = from[at]!; i < end; i++) marked[i] = true;
    }
  }
  const pieces: Piece[] = [];
  chars.forEach((ch, i) => {
    const last = pieces[pieces.length - 1];
    if (last && last.mark === marked[i]) pieces[pieces.length - 1] = { text: last.text + ch, mark: last.mark };
    else pieces.push({ text: ch, mark: marked[i]! });
  });
  return pieces;
}
