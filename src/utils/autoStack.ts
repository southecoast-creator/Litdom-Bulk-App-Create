/**
 * Litdom Batch Studio - Auto-stacking of text boxes in reading order.
 *
 * Text boxes are placed one under the other in the order they are given (the Word reading order):
 * the first at the top margin, every next one directly below the previous one's measured height
 * plus a small equal gap, all sharing one left margin and one width. Nothing is hand-placed.
 * Shapes / images / tables are left where they are.
 */

import { DesignPage, TextBoxTemplate } from '../types';
import { computeTextBoxLayout } from './canvasEngine';

export interface AutoStackOptions {
  /** Top margin, % of page height (default 8) */
  top?: number;
  /** Text should end above this line, % of page height (default 94) */
  bottomLimit?: number;
  /** Gap between elements as a fraction of the font size (default 0.5 = half a line) */
  gapFactor?: number;
  /** Line spacing applied to every stacked box (default: keep each box's own) */
  lineHeight?: number;
  /** Shared left margin, % of page width (default: the first text box's x) */
  left?: number;
  /** Shared width, % of page width (default: the first text box's width) */
  width?: number;
}

export interface AutoStackResult {
  boxes: TextBoxTemplate[];
  /** Bottom of the last stacked box, % of page height */
  endY: number;
  /** True when the stack runs past the bottom limit (text is never shrunk or dropped) */
  overflows: boolean;
}

const isTextBox = (b: TextBoxTemplate) => !b.elementType || b.elementType === 'text';
const r1 = (n: number) => Math.round(n * 10) / 10;

const hasText = (page: DesignPage, label: string): boolean => {
  const runs = page.richValues?.[label];
  if (runs && runs.some((r) => (r.text || '').trim() !== '')) return true;
  return (page.values?.[label] ?? '').trim() !== '';
};

export function autoStackBoxes(
  boxes: TextBoxTemplate[],
  page: DesignPage,
  ctx?: CanvasRenderingContext2D | null,
  opts: AutoStackOptions = {}
): AutoStackResult {
  const top = opts.top ?? 8;
  const bottomLimit = opts.bottomLimit ?? 94;
  const gapFactor = opts.gapFactor ?? 0.5;

  // Font sizes are stored for a 1000px-wide page, so measure on a 1000px-wide virtual page
  const targetW = 1000;
  const targetH = Math.max(1, Math.round(1000 * ((page.height || 1920) / (page.width || 1080))));

  const firstText = boxes.find(isTextBox);
  const left = opts.left ?? firstText?.x ?? 10;
  const width = opts.width ?? firstText?.width ?? 80;

  let cursor = top;
  let lastGap = 0;

  const out = boxes.map((b) => {
    if (!isTextBox(b) || !hasText(page, b.fieldLabel)) return b;

    const placed: TextBoxTemplate = {
      ...b,
      x: r1(left),
      width: r1(width),
      y: r1(cursor),
      ...(opts.lineHeight !== undefined ? { lineHeight: opts.lineHeight } : {}),
    };
    let heightPct = 5;
    try {
      heightPct = (computeTextBoxLayout(ctx, placed, page, targetW, targetH).computedHeightPx / targetH) * 100;
    } catch {
      heightPct = placed.height || 5;
    }
    lastGap = ((placed.fontSize * gapFactor) / targetH) * 100;
    cursor += heightPct + lastGap;
    return placed;
  });

  const endY = r1(Math.max(top, cursor - lastGap));
  return { boxes: out, endY, overflows: endY > bottomLimit };
}
