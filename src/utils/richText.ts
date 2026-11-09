/**
 * Litdom Batch Studio - Rich text model (pure functions, no DOM, no React)
 *
 * A box's text is an ordered list of TextRun pieces. Every function here works on character
 * offsets into the plain text (runs joined together, lines separated by "\n") and returns NEW
 * runs, so the in-place editor, the textarea field editors and the tests all share one source of
 * truth.
 */

import { TextRun } from '../types';
import {
  ListKind,
  allLinesAreList,
  makeMarker,
  parseListLine,
} from './listFormat';

const STYLE_KEYS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'gradient',
  'fontFamily',
  'fontSize',
  'letterSpacing',
  'effects',
] as const;

export type RunStyle = Omit<TextRun, 'text'>;

function sameVal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export function sameStyle(a: TextRun, b: TextRun): boolean {
  for (const k of STYLE_KEYS) {
    if (!sameVal(a[k], b[k])) return false;
  }
  return true;
}

export function cloneRun(r: TextRun, text: string = r.text): TextRun {
  const out: TextRun = { text };
  for (const k of STYLE_KEYS) {
    const v = r[k];
    if (v !== undefined) {
      (out as any)[k] = typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    }
  }
  return out;
}

/** Copy of just the style fields (no text). */
export function styleOf(r: TextRun): RunStyle {
  const { text: _t, ...rest } = cloneRun(r, '');
  return rest;
}

/** Drop empty runs and merge neighbours that share exactly the same style. */
export function normalizeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) {
      last.text += r.text;
    } else {
      out.push(cloneRun(r));
    }
  }
  return out;
}

export function runsToText(runs: TextRun[]): string {
  let s = '';
  for (const r of runs) s += r.text;
  return s;
}

export function totalLength(runs: TextRun[]): number {
  let n = 0;
  for (const r of runs) n += r.text.length;
  return n;
}

export function sliceRuns(runs: TextRun[], start: number, end: number): TextRun[] {
  const out: TextRun[] = [];
  let pos = 0;
  for (const r of runs) {
    const len = r.text.length;
    const a = Math.max(start, pos);
    const b = Math.min(end, pos + len);
    if (b > a) out.push(cloneRun(r, r.text.slice(a - pos, b - pos)));
    pos += len;
  }
  return out;
}

/** Style of the character before (or after) an offset, as a run with empty text. */
export function styleAt(
  runs: TextRun[],
  offset: number,
  prefer: 'before' | 'after' = 'before'
): TextRun | undefined {
  const total = totalLength(runs);
  if (total === 0) return runs.length ? cloneRun(runs[0], '') : undefined;
  let idx = prefer === 'before' && offset > 0 ? offset - 1 : offset;
  if (idx >= total) idx = total - 1;
  if (idx < 0) idx = 0;
  let pos = 0;
  for (const r of runs) {
    const len = r.text.length;
    if (idx < pos + len) return cloneRun(r, '');
    pos += len;
  }
  return undefined;
}

/**
 * Apply a function to the pieces inside [start, end). Runs are split at the boundaries so that
 * only the selected characters change.
 */
export function mapRange(
  runs: TextRun[],
  start: number,
  end: number,
  fn: (piece: TextRun, absStart: number) => TextRun
): TextRun[] {
  const out: TextRun[] = [];
  let pos = 0;
  for (const r of runs) {
    const len = r.text.length;
    if (len === 0) continue;
    const rs = pos;
    const re = pos + len;
    const a = Math.max(start, rs);
    const b = Math.min(end, re);
    if (a >= b) {
      out.push(cloneRun(r));
    } else {
      if (a > rs) out.push(cloneRun(r, r.text.slice(0, a - rs)));
      out.push(fn(cloneRun(r, r.text.slice(a - rs, b - rs)), a));
      if (b < re) out.push(cloneRun(r, r.text.slice(b - rs)));
    }
    pos = re;
  }
  return normalizeRuns(out);
}

/**
 * Patch the style of a range. A key present in the patch with the value `undefined` clears that
 * style on the range (so it falls back to the box style again).
 */
export function applyStylePatch(
  runs: TextRun[],
  start: number,
  end: number,
  patch: Partial<TextRun>
): TextRun[] {
  if (end <= start) return normalizeRuns(runs);
  return mapRange(runs, start, end, (piece) => {
    for (const key of Object.keys(patch)) {
      if (key === 'text') continue;
      const v = (patch as any)[key];
      if (v === undefined) {
        delete (piece as any)[key];
      } else {
        (piece as any)[key] = typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
      }
    }
    return piece;
  });
}

/** Replace [start, end) with new text. The new text copies the style next to it. */
export function replaceRange(
  runs: TextRun[],
  start: number,
  end: number,
  insert: string,
  style?: TextRun
): TextRun[] {
  const total = totalLength(runs);
  const a = Math.max(0, Math.min(start, total));
  const b = Math.max(a, Math.min(end, total));
  const before = sliceRuns(runs, 0, a);
  const after = sliceRuns(runs, b, total);
  let mid: TextRun[] = [];
  if (insert) {
    const src = style || styleAt(runs, a, a > 0 ? 'before' : 'after');
    mid = [src ? cloneRun(src, insert) : { text: insert }];
  }
  return normalizeRuns([...before, ...mid, ...after]);
}

/**
 * The text of a box was edited as plain text (for example in the "Current Design Text"
 * textarea). Keep the existing word styling for everything that did not change.
 */
export function reconcileRunsWithText(oldRuns: TextRun[], newText: string): TextRun[] {
  const oldText = runsToText(oldRuns);
  if (oldText === newText) return normalizeRuns(oldRuns);
  if (!newText) return [];
  if (!oldText) {
    const base = oldRuns[0];
    return [base ? cloneRun(base, newText) : { text: newText }];
  }
  let p = 0;
  const maxP = Math.min(oldText.length, newText.length);
  while (p < maxP && oldText[p] === newText[p]) p++;
  let s = 0;
  const maxS = Math.min(oldText.length - p, newText.length - p);
  while (s < maxS && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
  return replaceRange(oldRuns, p, oldText.length - s, newText.slice(p, newText.length - s));
}

// ---------------------------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------------------------

const isWs = (c: string | undefined) => c === undefined || /\s/.test(c);

/** The word (run of non-space characters) touching an offset, or null. */
export function expandToWord(text: string, offset: number): [number, number] | null {
  let i = Math.max(0, Math.min(offset, text.length));
  if (i > 0 && !isWs(text[i - 1])) {
    // word ends at or before the caret
  } else if (i < text.length && !isWs(text[i])) {
    // word starts at the caret
  } else {
    return null;
  }
  let a = i;
  while (a > 0 && !isWs(text[a - 1])) a--;
  let b = i;
  while (b < text.length && !isWs(text[b])) b++;
  return [a, b];
}

/** Full-line range covering a selection. A selection that ends right after a "\n" excludes the next line. */
export function lineRange(text: string, start: number, end: number): [number, number] {
  const s = Math.max(0, Math.min(start, text.length));
  let e = Math.max(s, Math.min(end, text.length));
  if (e > s && text[e - 1] === '\n') e -= 1;
  let ls = s;
  while (ls > 0 && text[ls - 1] !== '\n') ls--;
  let le = e;
  while (le < text.length && text[le] !== '\n') le++;
  return [ls, le];
}

/** What range should a formatting button act on? Selection, else the word at the caret. */
export function effectiveRange(text: string, start: number, end: number): [number, number] | null {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  if (b > a) return [a, b];
  return expandToWord(text, a);
}

export function wordsInRange(
  runs: TextRun[],
  start: number,
  end: number
): { word: string; style: TextRun }[] {
  const text = runsToText(runs);
  const out: { word: string; style: TextRun }[] = [];
  const re = /\S+/g;
  const slice = text.slice(start, end);
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const abs = start + m.index;
    out.push({ word: m[0], style: styleAt(runs, abs, 'after') || { text: '' } });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Case conversion
// ---------------------------------------------------------------------------------------------

export function convertCaseInRange(
  runs: TextRun[],
  start: number,
  end: number,
  mode: 'lower' | 'upper' | 'mixed'
): TextRun[] {
  if (end <= start) return normalizeRuns(runs);
  const text = runsToText(runs);
  return mapRange(runs, start, end, (piece, absStart) => {
    let out = '';
    for (let i = 0; i < piece.text.length; i++) {
      const ch = piece.text[i];
      const abs = absStart + i;
      let next: string;
      if (mode === 'lower') next = ch.toLowerCase();
      else if (mode === 'upper') next = ch.toUpperCase();
      else {
        const startsWord = abs === 0 || isWs(text[abs - 1]) || abs === start;
        next = startsWord ? ch.toUpperCase() : ch.toLowerCase();
      }
      // never change the length of the text (offsets must stay valid)
      out += next.length === 1 ? next : ch;
    }
    piece.text = out;
    return piece;
  });
}

// ---------------------------------------------------------------------------------------------
// Edits that keep track of where the caret / selection ends up
// ---------------------------------------------------------------------------------------------

interface Tracked {
  pos: number;
  bias: 'start' | 'end';
}

function mapPos(pos: number, a: number, b: number, m: number, bias: 'start' | 'end'): number {
  if (pos < a) return pos;
  if (pos > b) return pos + m - (b - a);
  if (a === b) return bias === 'end' ? pos + m : pos;
  if (pos === a) return a;
  if (pos === b) return a + m;
  return bias === 'start' ? a : a + m;
}

class Tracker {
  runs: TextRun[];
  tracked: Tracked[];
  constructor(runs: TextRun[], tracked: Tracked[]) {
    this.runs = normalizeRuns(runs);
    this.tracked = tracked.map((t) => ({ ...t }));
  }
  replace(a: number, b: number, insert: string, style?: TextRun) {
    this.runs = replaceRange(this.runs, a, b, insert, style);
    for (const t of this.tracked) t.pos = mapPos(t.pos, a, b, insert.length, t.bias);
  }
}

function renumberTracker(tr: Tracker) {
  const text = runsToText(tr.runs);
  const lines = text.split('\n');
  let counter = 0;
  let pos = 0;
  let shift = 0;
  for (const line of lines) {
    const info = parseListLine(line);
    if (info && info.kind === 'number') {
      counter += 1;
      if (info.number !== counter) {
        const m = /^([ \t]*)(\d{1,3})/.exec(line);
        if (m) {
          const a = pos + shift + m[1].length;
          const b = a + m[2].length;
          const rep = String(counter);
          tr.replace(a, b, rep, styleAt(tr.runs, a, 'after'));
          shift += rep.length - m[2].length;
        }
      }
    } else {
      counter = 0;
    }
    pos += line.length + 1;
  }
}

/** Make every run of numbered lines count 1, 2, 3 ... */
export function renumberRuns(runs: TextRun[]): TextRun[] {
  const tr = new Tracker(runs, []);
  renumberTracker(tr);
  return tr.runs;
}

export interface SelectionEdit {
  runs: TextRun[];
  selStart: number;
  selEnd: number;
}

/**
 * Bullet / numbered list on the selected lines (or the caret's line).
 * Tapping the same list type again on lines that already have it turns the list off.
 */
export function toggleListInRange(
  runs: TextRun[],
  selStart: number,
  selEnd: number,
  kind: ListKind
): SelectionEdit {
  const base = normalizeRuns(runs);
  const text = runsToText(base);
  const s0 = Math.min(selStart, selEnd);
  const e0 = Math.max(selStart, selEnd);
  const [ls, le] = lineRange(text, s0, e0);
  const targetLines = text.slice(ls, le).split('\n');
  const removing = allLinesAreList(targetLines, kind);
  const allBlank = targetLines.every((l) => !l.trim());

  const tr = new Tracker(base, [
    { pos: s0, bias: 'start' },
    { pos: e0, bias: 'end' },
  ]);

  let cursor = ls;
  for (const line of targetLines) {
    const info = parseListLine(line);
    let newLen = line.length;
    if (removing) {
      if (info) {
        tr.replace(cursor, cursor + info.prefixLength, '');
        newLen = line.length - info.prefixLength;
      }
    } else if (line.trim() || allBlank) {
      const marker = makeMarker(kind, 1);
      const style = styleAt(tr.runs, cursor, line.length > 0 ? 'after' : 'before');
      if (info) {
        tr.replace(cursor, cursor + info.prefixLength, marker, style);
        newLen = line.length - info.prefixLength + marker.length;
      } else {
        tr.replace(cursor, cursor, marker, style);
        newLen = line.length + marker.length;
      }
    }
    cursor += newLen + 1;
  }

  renumberTracker(tr);

  let a = tr.tracked[0].pos;
  let b = tr.tracked[1].pos;
  if (s0 === e0) {
    // A caret ends up just after the marker, like typing in a fresh list
    a = b;
  }
  return { runs: tr.runs, selStart: a, selEnd: b };
}

export interface CaretEdit {
  runs: TextRun[];
  caret: number;
}

/**
 * The Enter key. Inside a list it continues the list (next bullet / next number); on an empty
 * list item it ends the list. Everywhere else it is a plain new line.
 */
export function enterKeyEdit(runs: TextRun[], selStart: number, selEnd: number): CaretEdit {
  const a = Math.min(selStart, selEnd);
  const b = Math.max(selStart, selEnd);
  const tr = new Tracker(runs, [{ pos: a, bias: 'end' }]);
  if (b > a) tr.replace(a, b, '');

  const caret0 = tr.tracked[0].pos;
  const text = runsToText(tr.runs);
  const [ls, le] = lineRange(text, caret0, caret0);
  const line = text.slice(ls, le);
  const info = parseListLine(line);

  if (info && caret0 >= ls + info.prefixLength) {
    if (line.slice(info.prefixLength).trim() === '') {
      // Enter on an empty item: leave the list
      tr.replace(ls, ls + info.prefixLength, '');
      renumberTracker(tr);
      return { runs: tr.runs, caret: tr.tracked[0].pos };
    }
    const next = info.kind === 'bullet' ? makeMarker('bullet') : makeMarker('number', (info.number || 0) + 1);
    tr.replace(caret0, caret0, '\n' + next, styleAt(tr.runs, caret0, 'before'));
    renumberTracker(tr);
    return { runs: tr.runs, caret: tr.tracked[0].pos };
  }

  tr.replace(caret0, caret0, '\n', styleAt(tr.runs, caret0, 'before'));
  return { runs: tr.runs, caret: tr.tracked[0].pos };
}

/**
 * Backspace right after a list marker removes the marker (and only the marker).
 * Returns null when the caret is not in that position, so normal deleting continues.
 */
export function backspaceAtListMarker(runs: TextRun[], caret: number): CaretEdit | null {
  const text = runsToText(runs);
  const [ls, le] = lineRange(text, caret, caret);
  const info = parseListLine(text.slice(ls, le));
  if (!info || caret !== ls + info.prefixLength) return null;
  const tr = new Tracker(runs, [{ pos: caret, bias: 'end' }]);
  tr.replace(ls, ls + info.prefixLength, '');
  renumberTracker(tr);
  return { runs: tr.runs, caret: tr.tracked[0].pos };
}

/** Is the caret / selection inside lines that are a list of this kind? (for button highlight) */
export function selectionListKind(
  runs: TextRun[],
  selStart: number,
  selEnd: number
): ListKind | null {
  const text = runsToText(runs);
  const [ls, le] = lineRange(text, Math.min(selStart, selEnd), Math.max(selStart, selEnd));
  const lines = text.slice(ls, le).split('\n');
  if (allLinesAreList(lines, 'bullet')) return 'bullet';
  if (allLinesAreList(lines, 'number')) return 'number';
  return null;
}
