import bidiFactory from 'bidi-js';

/**
 * Pure helpers for printing guest names (Arabic, Latin, mixed) on tickets.
 * pdfkit + fontkit shape Arabic (joining forms, ligatures) but do NOT run the Unicode bidirectional algorithm, so this
 * module splits a name into bidi runs, assigns each run a font by script and returns the runs in VISUAL order.
 */

const bidi = bidiFactory();

export type Script = 'arabic' | 'latin';

/** Letters/marks must be Latin or Arabic script (bundled Noto fonts); digits, punctuation and spaces are allowed. Symbols/emoji are not. */
const LETTER_OR_MARK = /^[\p{L}\p{M}]$/u;
const SCRIPT_OK = /^[\p{Script=Latin}\p{Script=Arabic}\p{Script=Common}\p{Script=Inherited}]$/u;
const NEUTRAL_OK = /^[\p{N}\p{P}\p{Zs}]$/u;
const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u; // controls, format/bidi controls, line/paragraph separators: the bidi algorithm decides direction

/** true when every character can be printed correctly on a ticket. Used at booking time AND by the renderer. */
export function isPrintableGuestName(name: string): boolean {
  if (name.length === 0 || CONTROL.test(name)) return false;
  return Array.from(name).every((c) => (LETTER_OR_MARK.test(c) ? SCRIPT_OK.test(c) : NEUTRAL_OK.test(c)));
}

const ARABIC_BLOCKS: [number, number][] = [[0x600, 0x6ff], [0x750, 0x77f], [0x8a0, 0x8ff], [0xfb50, 0xfdff], [0xfe70, 0xfeff]];
export const isArabicCodePoint = (cp: number) => ARABIC_BLOCKS.some(([a, b]) => cp >= a && cp <= b);
const isMark = (ch: string) => /^[\p{M}]$/u.test(ch);
const isStrongLetter = (ch: string) => /^[\p{L}]$/u.test(ch);

export interface TextRun {
  text: string;
  /** odd = right-to-left run */
  level: number;
  script: Script;
}

/**
 * Splits into runs of equal bidi level and script, then reorders them left-to-right for drawing (UAX #9 rule L2 at run
 * granularity). Mirrored characters (brackets) in RTL runs are replaced by their mirror glyphs. Each run's text stays in
 * LOGICAL order: the font shaper handles joining and glyph direction inside an RTL run.
 */
export function layoutRuns(input: string): TextRun[] {
  const text = input.normalize('NFC');
  if (!text) return [];
  const chars = Array.from(text);
  // bidi-js indexes by UTF-16 code unit; names here are BMP in practice, but map defensively.
  const levelsResult = bidi.getEmbeddingLevels(text);
  const mirror = bidi.getMirroredCharactersMap(text, levelsResult.levels);
  const unitLevels = levelsResult.levels;

  const out: { ch: string; level: number; script: Script }[] = [];
  let unit = 0;
  let prevScript: Script | null = null;
  for (const ch of chars) {
    const cp = ch.codePointAt(0)!;
    const level = unitLevels[unit];
    let script: Script;
    if (isArabicCodePoint(cp)) script = 'arabic';
    else if (isStrongLetter(ch) && !isArabicCodePoint(cp)) script = 'latin';
    else script = prevScript ?? 'latin'; // neutrals, digits, marks follow their neighbour so words are not fragmented
    if (isMark(ch) && prevScript) script = prevScript;
    const shown = level % 2 === 1 && mirror.has(unit) ? mirror.get(unit)! : ch;
    out.push({ ch: shown, level, script });
    prevScript = script;
    unit += ch.length;
  }
  // Neutrals at the very start inherit the first strong script (they were given 'latin' by default).
  const firstStrong = out.find((o) => /^[\p{L}]$/u.test(o.ch));
  if (firstStrong) for (const o of out) { if (o === firstStrong) break; o.script = firstStrong.script; }

  const runs: TextRun[] = [];
  for (const o of out) {
    const last = runs[runs.length - 1];
    if (last && last.level === o.level && last.script === o.script) last.text += o.ch;
    else runs.push({ text: o.ch, level: o.level, script: o.script });
  }

  // L2: from the highest level down to the lowest odd level, reverse every maximal sequence of runs at that level or higher.
  const maxLevel = Math.max(...runs.map((r) => r.level));
  const minOdd = Math.min(...runs.map((r) => r.level).filter((l) => l % 2 === 1), Infinity);
  const visual = runs.slice();
  for (let lvl = maxLevel; lvl >= minOdd && Number.isFinite(minOdd); lvl--) {
    for (let i = 0; i < visual.length; ) {
      if (visual[i].level >= lvl) {
        let j = i;
        while (j < visual.length && visual[j].level >= lvl) j++;
        const seg = visual.slice(i, j).reverse();
        visual.splice(i, j - i, ...seg);
        i = j;
      } else i++;
    }
  }
  // pdfkit lays text out WORD BY WORD (it splits at spaces), reversing the glyphs of each RTL word but never reordering the
  // words themselves. So the words of every RTL run are emitted here in visual (right-to-left) order, one run per token.
  return visual.flatMap((r) =>
    r.level % 2 === 1
      ? r.text
          .split(/( +)/)
          .filter((t) => t !== '')
          .reverse()
          .map((t) => ({ ...r, text: t }))
      : [r],
  );
}

/** Latin-1 only (can be set in the built-in PDF fonts without any substitution). */
export const isLatin1 = (s: string) => Array.from(s).every((c) => c.codePointAt(0)! <= 0xff);
