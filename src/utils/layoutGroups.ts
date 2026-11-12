/**
 * Litdom Batch Studio - Pages that share a layout.
 *
 * Two pages share a layout when their text fields are the same TYPES in the same ORDER
 * (how many paragraphs / bullets each has does not matter):
 *   Heading 1 · Paragraph        (2 paragraphs)  ==  Heading 1 · Paragraph        (4 paragraphs)
 *   Heading 1 · Subtitle · Paragraph             !=  Heading 1 · Paragraph
 */

import { DesignPage, TextBoxTemplate } from '../types';
import { labelFamily } from './layoutSync';

export interface LayoutGroup {
  /** 1-based group number, in order of first page */
  id: number;
  /** Field types in order, e.g. ["heading 1", "paragraph"] */
  signature: string[];
  /** 0-based page indices */
  pages: number[];
  /** Readable summary, e.g. "Heading 1 · Paragraph" */
  summary: string;
}

const isTextBox = (b: TextBoxTemplate) => !b.elementType || b.elementType === 'text';

/** "Paragraph - 2" / "Paragraph 2" -> "paragraph". "Heading 1" and "Heading 2" stay different. */
export function layoutTypeOf(label: string): string {
  const base = labelFamily(label);
  if (/^heading\s*\d+$/.test(base)) return base;
  return base.replace(/\s+\d+$/, '').trim();
}

const pageHasText = (page: DesignPage, label: string): boolean => {
  const runs = page.richValues?.[label];
  if (runs && runs.some((r) => (r.text || '').trim() !== '')) return true;
  return (page.values?.[label] ?? '').trim() !== '';
};

export function pageLayoutSignature(page: DesignPage, template: TextBoxTemplate[]): string[] {
  const boxes = (page.textBoxes && page.textBoxes.length > 0 ? page.textBoxes : template).filter(isTextBox);
  const withText = boxes.filter((b) => pageHasText(page, b.fieldLabel));
  const used = withText.length > 0 ? withText : boxes;
  const sig: string[] = [];
  for (const b of used) {
    const t = layoutTypeOf(b.fieldLabel);
    if (sig[sig.length - 1] !== t) sig.push(t);
  }
  return sig;
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function groupPagesByLayout(pages: DesignPage[], template: TextBoxTemplate[]): LayoutGroup[] {
  const bySig = new Map<string, LayoutGroup>();
  pages.forEach((p, idx) => {
    const sig = pageLayoutSignature(p, template);
    const key = sig.join('\u0001');
    let g = bySig.get(key);
    if (!g) {
      g = {
        id: bySig.size + 1,
        signature: sig,
        pages: [],
        summary: sig.length > 0 ? sig.map(titleCase).join(' · ') : 'Blank page',
      };
      bySig.set(key, g);
    }
    g.pages.push(idx);
  });
  return Array.from(bySig.values());
}

/** Pages (0-based) that have a text box for any of the given field labels (same label or same family). */
export function pagesWithFields(
  pages: DesignPage[],
  template: TextBoxTemplate[],
  labels: string[]
): number[] {
  const wanted = new Set(labels);
  const families = new Set(labels.map((l) => labelFamily(l)));
  const out: number[] = [];
  pages.forEach((p, idx) => {
    const boxes = (p.textBoxes && p.textBoxes.length > 0 ? p.textBoxes : template).filter(isTextBox);
    if (boxes.some((b) => wanted.has(b.fieldLabel) || families.has(labelFamily(b.fieldLabel)))) out.push(idx);
  });
  return out;
}
