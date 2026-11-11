/**
 * Layout sync tests: syncing copies position/style only and never deletes boxes or text.
 */
import assert from 'node:assert';
import { TextBoxTemplate } from '../src/types';
import { syncLayoutOntoPage, syncFieldsOntoPage, labelFamily } from '../src/utils/layoutSync';

const box = (label: string, id: string, x: number, y: number, extra: Partial<TextBoxTemplate> = {}): TextBoxTemplate => ({
  id, fieldLabel: label, x, y, width: 80, fontFamily: 'Plus Jakarta Sans', fontSize: 24,
  fontWeight: '400', fontStyle: 'normal', textAlign: 'left', color: '#FFF8E7', ...extra,
});

console.log('--- LAYOUT SYNC TESTS ---');

console.log('\n[SYNC 1] Heading 1 / Heading 2 are different families; "Title - 2" matches "Title - 1"');
assert.strictEqual(labelFamily('Title - 2'), 'title');
assert.strictEqual(labelFamily('Title – 1'), 'title');
assert.notStrictEqual(labelFamily('Heading 1'), labelFamily('Heading 2'));
console.log('✅ PASS');

console.log('\n[SYNC 2] Sync layout keeps every target box and its label (nothing vanishes)');
{
  const source = [
    box('Rectangle', 'shape', 5, 5, { elementType: 'shape', shapeType: 'rectangle' }), // behind the text
    box('Title', 's1', 10, 10, { color: '#000000', fontSize: 60, textAlign: 'center' }),
    box('Heading 1', 's2', 10, 30, { color: '#000000', fontSize: 40 }),
    box('Paragraph', 's3', 10, 60, { color: '#000000', fontSize: 22 }),
  ];
  // Page 2 has Heading 1 and Paragraph (same labels) and a List Bullet the source does not have
  const target = [
    box('Paragraph', 't1', 20, 50),
    box('Heading 1', 't2', 20, 20),
    box('List Bullet', 't3', 20, 80),
  ];
  const out = syncLayoutOntoPage(source, target);
  const text = out.filter((b) => !b.elementType || b.elementType === 'text');
  assert.deepStrictEqual(text.map((b) => b.fieldLabel).sort(), ['Heading 1', 'List Bullet', 'Paragraph']);
  assert.deepStrictEqual(text.map((b) => b.id).sort(), ['t1', 't2', 't3'], 'ids unchanged');
  const get = (l: string) => out.find((b) => b.fieldLabel === l)!;
  assert.strictEqual(get('Heading 1').y, 30);
  assert.strictEqual(get('Heading 1').color, '#000000');
  assert.strictEqual(get('Paragraph').y, 60);
  // The target-only field takes the free slot at the top (the source's Title slot)
  assert.strictEqual(get('List Bullet').y, 10);
  assert.strictEqual(get('List Bullet').fontSize, 60);
  assert.ok(out.some((b) => b.elementType === 'shape'), 'source shape is copied');
  assert.strictEqual(out[0].elementType, 'shape', 'shape stays behind the text');
  console.log('✅ PASS: all 3 boxes kept, styled like the source, target-only field takes the free slot');
}

console.log('\n[SYNC 3] Target with more boxes than the source has slots: all kept, none stacked on each other');
{
  const source = [box('Title', 's1', 10, 10), box('Paragraph', 's2', 10, 50)];
  const target = [box('A', 'a', 0, 0), box('B', 'b', 0, 10), box('C', 'c', 0, 20), box('D', 'd', 0, 30)];
  const out = syncLayoutOntoPage(source, target);
  assert.strictEqual(out.length, 4);
  const ys = out.map((b) => b.y);
  assert.strictEqual(new Set(ys).size, 4, 'every box has its own vertical position');
  console.log('✅ PASS');
}

console.log('\n[SYNC 4] Sync fields: exact label, then family; adds a missing box only when the page has text');
{
  const sel = [box('Title - 1', 's1', 15, 12, { color: '#111111', fontSize: 55 })];
  const target = [box('Title - 2', 't1', 0, 0), box('Paragraph', 't2', 0, 40)];
  const out = syncFieldsOntoPage(sel, target, { 'Title - 2': 'Hello', Paragraph: 'x' });
  const t = out.find((b) => b.fieldLabel === 'Title - 2')!;
  assert.strictEqual(t.y, 12);
  assert.strictEqual(t.fontSize, 55);
  assert.strictEqual(out.length, 2, 'no extra box added');
  assert.strictEqual(out.find((b) => b.fieldLabel === 'Paragraph')!.y, 40, 'other boxes untouched');

  const none = syncFieldsOntoPage([box('CTA', 's9', 5, 5)], target, { Paragraph: 'x' });
  assert.strictEqual(none.length, 2, 'no placeholder for a field the page has no text for');
  const added = syncFieldsOntoPage([box('CTA', 's9', 5, 5)], target, { CTA: 'Buy now' });
  assert.strictEqual(added.length, 3, 'box added when the page has text for it');
  console.log('✅ PASS');
}

console.log('\n--- LAYOUT SYNC TESTS COMPLETED ---');
