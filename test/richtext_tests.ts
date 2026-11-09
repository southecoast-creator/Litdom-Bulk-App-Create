/**
 * Litdom Batch Studio - Rich text + list logic tests (pure functions, no browser needed)
 * Run with: npx tsx test/richtext_tests.ts
 */

import assert from 'node:assert';
import { TextRun } from '../src/types';
import {
  applyListMarkers,
  listKindFromLabel,
  parseListLine,
  renumberLines,
  stripLooseMarker,
} from '../src/utils/listFormat';
import {
  applyStylePatch,
  backspaceAtListMarker,
  convertCaseInRange,
  effectiveRange,
  enterKeyEdit,
  expandToWord,
  lineRange,
  normalizeRuns,
  reconcileRunsWithText,
  replaceRange,
  runsToText,
  selectionListKind,
  toggleListInRange,
  wordsInRange,
} from '../src/utils/richText';

console.log('--- RICH TEXT & LIST TESTS ---');

const T = (runs: TextRun[]) => runsToText(runs);

// 1. Style patch only touches the chosen characters
{
  const runs = applyStylePatch([{ text: 'Hello big world' }], 6, 9, { bold: true, color: '#FF0000' });
  assert.deepStrictEqual(
    runs.map((r) => [r.text, !!r.bold, r.color]),
    [
      ['Hello ', false, undefined],
      ['big', true, '#FF0000'],
      [' world', false, undefined],
    ]
  );
  // clearing a style with undefined
  const cleared = applyStylePatch(runs, 0, 15, { bold: undefined, color: undefined });
  assert.strictEqual(cleared.length, 1);
  assert.strictEqual(cleared[0].text, 'Hello big world');
  console.log('✅ PASS: style patch splits runs, applies and clears');
}

// 2. Typing inherits the style of the character before it
{
  const runs: TextRun[] = [{ text: 'Hi ' }, { text: 'there', bold: true }];
  const typed = replaceRange(runs, 8, 8, '!');
  assert.strictEqual(T(typed), 'Hi there!');
  assert.strictEqual(typed[typed.length - 1].bold, true);
  assert.strictEqual(typed[typed.length - 1].text, 'there!');
  console.log('✅ PASS: inserted text inherits style from the previous character');
}

// 3. Plain-text edits keep word styling
{
  const runs: TextRun[] = [{ text: 'Big ' }, { text: 'SALE', bold: true, color: '#FF0000' }, { text: ' today' }];
  const edited = reconcileRunsWithText(runs, 'Huge SALE today');
  assert.strictEqual(T(edited), 'Huge SALE today');
  const sale = edited.find((r) => r.text.includes('SALE'))!;
  assert.strictEqual(sale.bold, true);
  assert.strictEqual(sale.color, '#FF0000');
  const emptied = reconcileRunsWithText(runs, '');
  assert.deepStrictEqual(emptied, []);
  const fresh = reconcileRunsWithText([], 'New');
  assert.strictEqual(T(fresh), 'New');
  console.log('✅ PASS: plain-text edits preserve styled words');
}

// 4. Bullet list: add, remove, caret placement
{
  const base: TextRun[] = [{ text: 'one\ntwo\nthree' }];
  const on = toggleListInRange(base, 0, 13, 'bullet');
  assert.strictEqual(T(on.runs), '• one\n• two\n• three');
  assert.strictEqual(selectionListKind(on.runs, on.selStart, on.selEnd), 'bullet');
  const off = toggleListInRange(on.runs, on.selStart, on.selEnd, 'bullet');
  assert.strictEqual(T(off.runs), 'one\ntwo\nthree');
  // collapsed caret on one line only
  const one = toggleListInRange(base, 5, 5, 'bullet'); // caret inside "two"
  assert.strictEqual(T(one.runs), 'one\n• two\nthree');
  assert.strictEqual(one.selStart, one.selEnd);
  assert.strictEqual(T(one.runs).slice(0, one.selStart), 'one\n• t'.slice(0, one.selStart));
  console.log('✅ PASS: bullet toggle on / off / single line');
}

// 5. Numbered list: add, switch kinds, renumber neighbours
{
  const base: TextRun[] = [{ text: 'a\nb\nc' }];
  const num = toggleListInRange(base, 0, 5, 'number');
  assert.strictEqual(T(num.runs), '1. a\n2. b\n3. c');
  const sw = toggleListInRange(num.runs, 0, T(num.runs).length, 'bullet');
  assert.strictEqual(T(sw.runs), '• a\n• b\n• c');
  // numbering only the middle line of an existing numbered list keeps the block consistent
  const list: TextRun[] = [{ text: '1. a\n2. b\n3. c' }];
  const remove = toggleListInRange(list, 5, 5, 'number'); // caret on "2. b"
  assert.strictEqual(T(remove.runs), '1. a\nb\n1. c');
  console.log('✅ PASS: number toggle, bullet<->number switch, renumbering');
}

// 6. Enter key
{
  // continues a bullet list
  let r = enterKeyEdit([{ text: '• one' }], 5, 5);
  assert.strictEqual(T(r.runs), '• one\n• ');
  assert.strictEqual(r.caret, T(r.runs).length);
  // continues a numbered list and renumbers the items below
  r = enterKeyEdit([{ text: '1. a\n2. b' }], 4, 4);
  assert.strictEqual(T(r.runs), '1. a\n2. \n3. b');
  assert.strictEqual(r.caret, 8);
  // splits an item mid-text
  r = enterKeyEdit([{ text: '• hello world' }], 4, 4); // caret after "• he"
  assert.strictEqual(T(r.runs), '• he\n• llo world');
  assert.strictEqual(r.caret, 7); // "• he" (4) + "\n" (1) + "• " (2): right after the new marker
  assert.strictEqual(T(r.runs).slice(r.caret), 'llo world');
  // empty item leaves the list
  r = enterKeyEdit([{ text: '• one\n• ' }], 8, 8);
  assert.strictEqual(T(r.runs), '• one\n');
  assert.strictEqual(r.caret, 6);
  // plain text new line
  r = enterKeyEdit([{ text: 'hello' }], 2, 2);
  assert.strictEqual(T(r.runs), 'he\nllo');
  assert.strictEqual(r.caret, 3);
  // replaces a selection
  r = enterKeyEdit([{ text: 'hello world' }], 5, 6);
  assert.strictEqual(T(r.runs), 'hello\nworld');
  // ten numbered items: digits grow without breaking
  const nine = Array.from({ length: 9 }, (_, i) => `${i + 1}. x`).join('\n');
  r = enterKeyEdit([{ text: nine }], nine.length, nine.length);
  assert.ok(T(r.runs).endsWith('\n10. '));
  console.log('✅ PASS: Enter continues, splits, ends lists and handles selections');
}

// 7. Backspace right after the marker removes only the marker
{
  const r = backspaceAtListMarker([{ text: '1. a\n2. b' }], 8); // caret just after "2. "
  assert.ok(r);
  assert.strictEqual(T(r!.runs), '1. a\nb');
  assert.strictEqual(r!.caret, 5);
  assert.strictEqual(backspaceAtListMarker([{ text: '• hello' }], 4), null);
  console.log('✅ PASS: backspace at marker removes only the marker');
}

// 8. Styles survive list edits
{
  const runs: TextRun[] = [{ text: 'bold line', bold: true }, { text: '\nplain' }];
  const out = toggleListInRange(runs, 0, 15, 'bullet');
  assert.strictEqual(T(out.runs), '• bold line\n• plain');
  const boldPart = out.runs.find((r) => r.text.includes('bold line'))!;
  assert.strictEqual(boldPart.bold, true);
  console.log('✅ PASS: list markers keep the styling of the line');
}

// 9. Case conversion keeps length and styles
{
  const runs: TextRun[] = [{ text: 'hello ' }, { text: 'big world', bold: true }];
  const up = convertCaseInRange(runs, 0, 15, 'upper');
  assert.strictEqual(T(up), 'HELLO BIG WORLD');
  assert.strictEqual(up[1].bold, true);
  const mixed = convertCaseInRange([{ text: 'hELLO wORLD' }], 0, 11, 'mixed');
  assert.strictEqual(T(mixed), 'Hello World');
  console.log('✅ PASS: case conversion');
}

// 10. Ranges
{
  assert.deepStrictEqual(expandToWord('hello big world', 7), [6, 9]);
  assert.deepStrictEqual(expandToWord('hello big world', 5), [0, 5]);
  assert.strictEqual(expandToWord('hello  world', 6), null);
  assert.deepStrictEqual(effectiveRange('hello world', 2, 8), [2, 8]);
  assert.deepStrictEqual(lineRange('ab\ncd\nef', 4, 4), [3, 5]);
  assert.deepStrictEqual(lineRange('ab\ncd\nef', 0, 3), [0, 2]); // ends right after newline -> excludes line 2
  const w = wordsInRange([{ text: 'go ' }, { text: 'now', italic: true }], 0, 6);
  assert.deepStrictEqual(w.map((x) => x.word), ['go', 'now']);
  assert.strictEqual(w[1].style.italic, true);
  console.log('✅ PASS: word / line / effective ranges');
}

// 11. List helpers used by the Word -> sheet -> template flow
{
  assert.deepStrictEqual(parseListLine('• Apples'), { kind: 'bullet', prefixLength: 2 });
  assert.deepStrictEqual(parseListLine('12. Twelve'), { kind: 'number', number: 12, prefixLength: 4 });
  assert.strictEqual(parseListLine('2024 was great'), null);
  assert.strictEqual(parseListLine('plain'), null);
  assert.strictEqual(applyListMarkers('Apples\nPears\nPlums', 'bullet'), '• Apples\n• Pears\n• Plums');
  assert.strictEqual(applyListMarkers('Apples\nPears\nPlums', 'number'), '1. Apples\n2. Pears\n3. Plums');
  // idempotent + converts hand-typed markers
  const once = applyListMarkers('- one\n* two\n3) three', 'number');
  assert.strictEqual(once, '1. one\n2. two\n3. three');
  assert.strictEqual(applyListMarkers(once, 'number'), once);
  assert.strictEqual(applyListMarkers('a\n\nb', 'number'), '1. a\n\n2. b');
  assert.strictEqual(applyListMarkers('', 'bullet'), '');
  assert.deepStrictEqual(renumberLines(['3. a', '9. b', 'x', '5. c']), ['1. a', '2. b', 'x', '1. c']);
  assert.strictEqual(stripLooseMarker('• item'), 'item');
  assert.strictEqual(listKindFromLabel('List Bullet'), 'bullet');
  assert.strictEqual(listKindFromLabel('List Bullet - 2'), 'bullet');
  assert.strictEqual(listKindFromLabel('List Number - 3'), 'number');
  assert.strictEqual(listKindFromLabel('list_number'), 'number');
  assert.strictEqual(listKindFromLabel('Title'), null);
  assert.strictEqual(listKindFromLabel('List Paragraph'), null);
  assert.strictEqual(listKindFromLabel(undefined), null);
  console.log('✅ PASS: list marker helpers and column detection');
}

// 12. normalize merges equal neighbours and drops empties
{
  const n = normalizeRuns([{ text: 'a' }, { text: '' }, { text: 'b' }, { text: 'c', bold: true }]);
  assert.deepStrictEqual(n.map((r) => r.text), ['ab', 'c']);
  console.log('✅ PASS: normalize');
}

console.log('--- ALL RICH TEXT TESTS PASSED ---');
