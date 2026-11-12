import assert from 'node:assert';
import { parseMarkdownRuns } from '../src/utils/spreadsheetEngine';
import { applyListMarkers, listKindFromLabel } from '../src/utils/listFormat';

// Word bold/italic markers from the docx parser become runs at the right position
const { plainText, runs } = parseMarkdownRuns('Hello **bold** and *slanted*.');
assert.strictEqual(plainText, 'Hello bold and slanted.');
assert.deepStrictEqual(runs.filter((r) => r.bold).map((r) => r.text), ['bold']);
assert.deepStrictEqual(runs.filter((r) => r.italic).map((r) => r.text), ['slanted']);

// List columns get markers automatically
const kind = listKindFromLabel('List Bullet');
assert.ok(kind);
const listed = parseMarkdownRuns(applyListMarkers('one\ntwo', kind!)).plainText;
assert.ok(listed.split('\n').every((l) => l.startsWith('• ')), listed);
console.log('docx format tests passed');
