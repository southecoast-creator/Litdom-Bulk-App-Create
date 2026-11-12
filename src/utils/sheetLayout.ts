/**
 * Litdom Batch Studio - lays out sheet content in COLUMN ORDER.
 *
 * Column 1 goes at the top of the page, column 2 directly under it, column 3 under that ...
 * one shared left margin, 1.5 line spacing, a small equal gap, text black by default.
 * Used whenever a sheet fills pages, so nothing has to be arranged by hand.
 */

import { DesignPage, TextBoxTemplate } from '../types';
import { autoStackBoxes } from './autoStack';
import { preloadTemplateFonts } from './canvasEngine';

export const DEFAULT_TEXT_COLOR = '#000000';
export const STACK_LINE_HEIGHT = 1.5;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** A fresh text box for a sheet column, styled by what the column is (title, heading, ...). */
export function boxForHeader(header: string, idx: number): TextBoxTemplate {
  let fontSize = 24;
  let fontWeight: '400' | '500' | '600' | '700' | '800' = '400';
  if (/title|heading 1/i.test(header)) {
    fontSize = 44;
    fontWeight = '700';
  } else if (/subtitle|heading 2/i.test(header)) {
    fontSize = 32;
    fontWeight = '600';
  } else if (/heading/i.test(header)) {
    fontSize = 28;
    fontWeight = '600';
  } else if (/quote/i.test(header)) {
    fontSize = 26;
    fontWeight = '500';
  }
  const isTitle = /title/i.test(header);
  return {
    id: `tpl_box_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fieldLabel: header,
    x: 10,
    y: 8,
    width: 80,
    fontFamily: isTitle ? 'Cinzel' : 'Plus Jakarta Sans',
    fontSize,
    fontWeight,
    fontStyle: /quote/i.test(header) ? 'italic' : 'normal',
    textAlign: isTitle ? 'center' : 'left',
    color: DEFAULT_TEXT_COLOR,
    lineHeight: STACK_LINE_HEIGHT,
    letterSpacing: 0,
  };
}

/**
 * One text box per sheet column, in column order. A box of the base template with the same
 * label keeps its look (font, size, colour); columns without one get a fresh black box.
 */
export function buildTemplateForHeaders(headers: string[], base: TextBoxTemplate[] = []): TextBoxTemplate[] {
  return headers.map((h, idx) => {
    const donor = base.find((b) => b.fieldLabel === h) || base.find((b) => norm(b.fieldLabel) === norm(h));
    return donor
      ? { ...JSON.parse(JSON.stringify(donor)), id: `tpl_box_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, fieldLabel: h }
      : boxForHeader(h, idx);
  });
}

/**
 * Stack the text of the given pages from the top, in sheet column order.
 * Boxes whose label is not a sheet column keep their place after the sheet's boxes.
 */
export async function stackPagesInColumnOrder(
  pages: DesignPage[],
  headers: string[],
  mappings: Record<string, string> = {},
  onlyIndices?: number[]
): Promise<DesignPage[]> {
  const allBoxes = pages.flatMap((p) => p.textBoxes || []);
  try {
    await preloadTemplateFonts(allBoxes);
  } catch {}
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement('canvas').getContext('2d');
  } catch {}

  const colIndex = (label: string): number => {
    const col = mappings[label] ?? label;
    let i = headers.indexOf(col);
    if (i < 0) i = headers.findIndex((h) => norm(h) === norm(col));
    return i < 0 ? 100000 : i;
  };

  return pages.map((p, idx) => {
    if (onlyIndices && !onlyIndices.includes(idx)) return p;
    const boxes = p.textBoxes || [];
    if (boxes.length === 0) return p;
    const ordered = boxes
      .map((b, i) => ({ b, i }))
      .sort((a, c) => colIndex(a.b.fieldLabel) - colIndex(c.b.fieldLabel) || a.i - c.i)
      .map((o) => o.b);
    const res = autoStackBoxes(ordered, p, ctx, { lineHeight: STACK_LINE_HEIGHT });
    const byId = new Map(res.boxes.map((b) => [b.id, b]));
    return { ...p, textBoxes: boxes.map((b) => byId.get(b.id) || b) };
  });
}
