/**
 * Tests: reading-order columns, auto-stacking, layout groups, tagged fields.
 */
import assert from 'node:assert';
import { TextBoxTemplate, DesignPage } from '../src/types';
import { orderColumnKeys } from '../src/utils/columnOrder';
import { groupPagesByLayout, pagesWithFields, layoutTypeOf } from '../src/utils/layoutGroups';

const k = (style: string, n: number) => ({ style, n });
const box = (label: string, id: string, extra: Partial<TextBoxTemplate> = {}): TextBoxTemplate => ({
  id, fieldLabel: label, x: 10, y: 10, width: 80, fontFamily: 'Plus Jakarta Sans', fontSize: 24,
  fontWeight: '400', fontStyle: 'normal', textAlign: 'left', color: '#FFF8E7', lineHeight: 1.5, ...extra,
});
const page = (id: string, labels: string[], values: Record<string, string> = {}): DesignPage => ({
  id, imageId: 'i', name: id, width: 1080, height: 1920,
  values: Object.fromEntries(labels.map((l) => [l, values[l] ?? `text of ${l}`])),
  textBoxes: labels.map((l, i) => box(l, `${id}_${i}`)),
});

async function main() {
  console.log('--- STACK / GROUP TESTS ---');

  console.log('\n[ORDER 1] Columns follow the reading order, not "all headings first"');
  {
    // page 1: Heading 1, Paragraph, Heading 1 (2nd), Paragraph (2nd)
    const p1 = [k('Heading 1', 0), k('Paragraph', 0), k('Heading 1', 1), k('Paragraph', 1)];
    const p2 = [k('Heading 1', 0), k('Paragraph', 0)];
    const order = orderColumnKeys([p1, p2]).map((x) => `${x.style}#${x.n}`);
    assert.deepStrictEqual(order, ['Heading 1#0', 'Paragraph#0', 'Heading 1#1', 'Paragraph#1']);
    console.log('✅ PASS:', order.join(' > '));
  }

  console.log('\n[ORDER 2] A column that only some pages have slots into the right place');
  {
    const p1 = [k('Heading 1', 0), k('Paragraph', 0)];
    const p2 = [k('Heading 1', 0), k('Subtitle', 0), k('Paragraph', 0)];
    const order = orderColumnKeys([p1, p2]).map((x) => x.style);
    assert.deepStrictEqual(order, ['Heading 1', 'Subtitle', 'Paragraph']);
    console.log('✅ PASS:', order.join(' > '));
  }

  console.log('\n[ORDER 3] Pages that disagree never lose or duplicate a column');
  {
    const a = [k('A', 0), k('B', 0)];
    const b = [k('B', 0), k('A', 0)];
    const order = orderColumnKeys([a, b]);
    assert.strictEqual(order.length, 2);
    assert.deepStrictEqual(order.map((x) => x.style), ['A', 'B']);
    console.log('✅ PASS: first-seen order wins');
  }

  console.log('\n[STACK 1] Text stacks top to bottom with one margin, no overlap, no big gaps');
  {
    const { autoStackBoxes } = await import('../src/utils/autoStack');
    const labels = ['Heading 1', 'Paragraph - 1', 'Paragraph - 2', 'Heading 2'];
    const pg = page('s', labels, {
      'Heading 1': 'A short title',
      'Paragraph - 1': 'First paragraph with a fair amount of words in it so that it wraps over a few lines on the page.',
      'Paragraph - 2': 'Second paragraph, also long enough to wrap onto several lines of text on this page for sure.',
      'Heading 2': 'Another heading',
    });
    // scrambled starting positions, as in the broken app
    pg.textBoxes = [
      box('Heading 1', 'h1', { x: 33, y: 71, width: 50, fontSize: 44, fontWeight: '700' }),
      box('Paragraph - 1', 'p1', { x: 5, y: 12, width: 60, fontSize: 24 }),
      box('Paragraph - 2', 'p2', { x: 20, y: 90, width: 70, fontSize: 24 }),
      box('Heading 2', 'h2', { x: 44, y: 3, width: 40, fontSize: 32, fontWeight: '600' }),
    ];
    const res = autoStackBoxes(pg.textBoxes, pg, undefined, { lineHeight: 1.5 });
    const ys = res.boxes.map((b) => b.y);
    assert.deepStrictEqual([...ys].sort((a, b) => a - b), ys, 'y increases in reading order');
    assert.ok(ys.every((y, i) => i === 0 || y > ys[i - 1]), 'no two boxes share a position');
    assert.strictEqual(new Set(res.boxes.map((b) => b.x)).size, 1, 'one shared left margin');
    assert.strictEqual(new Set(res.boxes.map((b) => b.width)).size, 1, 'one shared width');
    assert.strictEqual(ys[0], 8, 'first box at the top margin');
    assert.ok(res.boxes.every((b) => b.lineHeight === 1.5));
    // fonts/styles untouched
    assert.strictEqual(res.boxes[0].fontSize, 44);
    assert.strictEqual(res.boxes[3].fontWeight, '600');
    // gaps are small: each box starts within a reasonable distance of the previous start
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] < 30, 'no huge gaps');
    console.log('✅ PASS: y =', ys.join(', '), '| ends at', res.endY, '%');
  }

  console.log('\n[STACK 2] Empty fields are skipped (no gap), shapes stay put, overflow is reported');
  {
    const { autoStackBoxes } = await import('../src/utils/autoStack');
    const pg = page('t', ['Title', 'Subtitle', 'Paragraph'], { Subtitle: '' });
    pg.textBoxes = [
      box('Rectangle', 'r', { elementType: 'shape', x: 2, y: 2 }),
      box('Title', 't', { y: 50 }),
      box('Subtitle', 's', { y: 60 }),
      box('Paragraph', 'p', { y: 70 }),
    ];
    const res = autoStackBoxes(pg.textBoxes, pg);
    assert.strictEqual(res.boxes[0].y, 2, 'shape untouched');
    assert.strictEqual(res.boxes[2].y, 60, 'empty field untouched / no gap reserved');
    assert.ok(res.boxes[3].y < 25, 'paragraph sits right under the title');
    const long = page('u', ['Paragraph'], { Paragraph: 'word '.repeat(2500) });
    const over = autoStackBoxes(long.textBoxes!, long);
    assert.strictEqual(over.overflows, true);
    assert.ok(over.boxes[0].fontSize === 24, 'text is flagged, never shrunk');
    console.log('✅ PASS');
  }

  console.log('\n[GROUP 1] Pages are grouped by field types in order (count does not matter)');
  {
    assert.strictEqual(layoutTypeOf('Paragraph - 3'), 'paragraph');
    assert.strictEqual(layoutTypeOf('Paragraph 2'), 'paragraph');
    assert.notStrictEqual(layoutTypeOf('Heading 1'), layoutTypeOf('Heading 2'));
    const pages = [
      page('p1', ['Heading 1', 'Paragraph - 1', 'Paragraph - 2']),
      page('p2', ['Heading 1', 'Paragraph - 1', 'Paragraph - 2', 'Paragraph - 3', 'Paragraph - 4']),
      page('p3', ['Heading 1', 'Subtitle', 'Paragraph - 1']),
      page('p4', ['Heading 1', 'Subtitle', 'Paragraph - 1']),
      page('p5', ['Heading 1', 'Paragraph - 1', 'Paragraph - 2']),
      page('p6', ['Title']),
    ];
    const groups = groupPagesByLayout(pages, []);
    assert.deepStrictEqual(groups.map((g) => g.pages), [[0, 1, 4], [2, 3], [5]]);
    assert.strictEqual(groups[0].summary, 'Heading 1 · Paragraph');
    console.log('✅ PASS:', groups.map((g) => `Layout ${g.id}: pages ${g.pages.map((i) => i + 1).join(',')}`).join(' | '));
  }

  console.log('\n[GROUP 2] Empty fields do not change a page\'s layout; order does');
  {
    const a = page('a', ['Heading 1', 'Subtitle', 'Paragraph'], { Subtitle: '' });
    const b = page('b', ['Heading 1', 'Paragraph']);
    const c = page('c', ['Paragraph', 'Heading 1']);
    const groups = groupPagesByLayout([a, b, c], []);
    assert.deepStrictEqual(groups.map((g) => g.pages), [[0, 1], [2]]);
    console.log('✅ PASS');
  }

  console.log('\n[TAG] Sync-by-field finds the pages that have that field tag');
  {
    const pages = [
      page('a', ['Title - 1', 'Paragraph']),
      page('b', ['Heading 1', 'Paragraph']),
      page('c', ['Title - 2']),
    ];
    assert.deepStrictEqual(pagesWithFields(pages, [], ['Title - 1']), [0, 2]);
    assert.deepStrictEqual(pagesWithFields(pages, [], ['Heading 1']), [1]);
    console.log('✅ PASS');
  }

  console.log('\n--- STACK / GROUP TESTS COMPLETED ---');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
