/**
 * Litdom Batch Studio - Layout / field syncing between designs.
 *
 * Rule: syncing copies POSITION and STYLE only. A design keeps its own text boxes (and therefore
 * its own content): nothing is deleted, no field label is renamed, no text value is touched.
 *
 * Matching (source box -> target box):
 *   1. same field label                       ("Heading 1"      -> "Heading 1")
 *   2. same field family, in order            ("Title - 1"      -> "Title - 2" when "Title - 1" is missing)
 *   3. (layout sync only) by reading order    first unmatched box of the target takes the first
 *                                             unmatched slot of the source, and so on down the page
 * Target boxes that still have no slot are stacked underneath so they never overlap or vanish.
 */

import { TextBoxTemplate } from '../types';

const isTextBox = (b: TextBoxTemplate): boolean => !b.elementType || b.elementType === 'text';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** "Title - 2" -> "title". Only the docx-style " - N" suffix is removed ("Heading 1" stays "heading 1"). */
export function labelFamily(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s*[-–]\s*\d+\s*$/, '')
    .trim();
}

/** Copy geometry + styling from `source` onto `target`, keeping the target's id, label and kind. */
export function copyBoxLook(target: TextBoxTemplate, source: TextBoxTemplate): TextBoxTemplate {
  return {
    ...target,
    x: source.x,
    y: source.y,
    width: source.width,
    height: source.height,
    fontFamily: source.fontFamily,
    fontSize: source.fontSize,
    fontWeight: source.fontWeight,
    fontStyle: source.fontStyle,
    textAlign: source.textAlign,
    color: source.color,
    lineHeight: source.lineHeight,
    letterSpacing: source.letterSpacing,
    rotation: source.rotation,
    textCase: source.textCase,
    shadow: source.shadow ? clone(source.shadow) : undefined,
    stroke: source.stroke ? clone(source.stroke) : undefined,
    fill: source.fill ? clone(source.fill) : undefined,
    effects: source.effects ? clone(source.effects) : undefined,
    fillColor: source.fillColor,
    strokeColor: source.strokeColor,
    strokeWidth: source.strokeWidth,
    gradient: source.gradient ? clone(source.gradient) : undefined,
    padding: source.padding,
  };
}

const byReadingOrder = (a: TextBoxTemplate, b: TextBoxTemplate) => a.y - b.y || a.x - b.x;

/** For every target box returns the index of its source box, or -1. Steps 1 and 2 only. */
function matchByLabel(sources: TextBoxTemplate[], targets: TextBoxTemplate[]): number[] {
  const used = new Set<number>();
  const result = targets.map(() => -1);

  targets.forEach((t, ti) => {
    const si = sources.findIndex((s, i) => !used.has(i) && s.fieldLabel === t.fieldLabel);
    if (si >= 0) {
      result[ti] = si;
      used.add(si);
    }
  });
  targets.forEach((t, ti) => {
    if (result[ti] >= 0) return;
    const fam = labelFamily(t.fieldLabel);
    const si = sources.findIndex((s, i) => !used.has(i) && labelFamily(s.fieldLabel) === fam);
    if (si >= 0) {
      result[ti] = si;
      used.add(si);
    }
  });
  return result;
}

/**
 * Sync a whole design's layout onto another design.
 * Returns the target's new box list: the source's shapes/images, plus every one of the target's
 * own text boxes (all of them kept) positioned and styled like the source.
 */
export function syncLayoutOntoPage(
  sourceBoxes: TextBoxTemplate[],
  targetBoxes: TextBoxTemplate[]
): TextBoxTemplate[] {
  const sourceText = sourceBoxes.filter(isTextBox);
  const targetText = targetBoxes.filter(isTextBox);

  const match = matchByLabel(sourceText, targetText);
  const usedSources = new Set(match.filter((m) => m >= 0));

  // Step 3: remaining boxes follow reading order
  const freeTargets = targetText
    .map((t, ti) => ({ t, ti }))
    .filter(({ ti }) => match[ti] < 0)
    .sort((a, b) => byReadingOrder(a.t, b.t));
  const freeSources = sourceText
    .map((s, si) => ({ s, si }))
    .filter(({ si }) => !usedSources.has(si))
    .sort((a, b) => byReadingOrder(a.s, b.s));
  const pairs = Math.min(freeTargets.length, freeSources.length);
  for (let k = 0; k < pairs; k++) {
    match[freeTargets[k].ti] = freeSources[k].si;
    usedSources.add(freeSources[k].si);
  }

  const styledByTarget = new Map<number, TextBoxTemplate>();
  targetText.forEach((t, ti) => {
    if (match[ti] >= 0) styledByTarget.set(ti, copyBoxLook(t, sourceText[match[ti]]));
  });

  // Leftover target boxes (more content than the source has slots) are stacked underneath
  const leftovers = targetText
    .map((t, ti) => ({ t, ti }))
    .filter(({ ti }) => match[ti] < 0)
    .sort((a, b) => byReadingOrder(a.t, b.t));
  let nextY = 0;
  styledByTarget.forEach((b) => {
    nextY = Math.max(nextY, b.y);
  });
  nextY = Math.min(92, nextY + 10);
  for (const { t, ti } of leftovers) {
    styledByTarget.set(ti, { ...t, y: nextY });
    nextY = Math.min(92, nextY + 10);
  }

  // Build the result in the source's layering order (shapes behind text stay behind text)
  const out: TextBoxTemplate[] = [];
  const placedTargets = new Set<number>();
  for (const sb of sourceBoxes) {
    if (!isTextBox(sb)) {
      out.push(clone(sb));
      continue;
    }
    const si = sourceText.indexOf(sb);
    const ti = targetText.findIndex((_, i) => match[i] === si && !placedTargets.has(i));
    if (ti >= 0) {
      out.push(styledByTarget.get(ti)!);
      placedTargets.add(ti);
    }
  }
  targetText.forEach((_, ti) => {
    if (!placedTargets.has(ti)) out.push(styledByTarget.get(ti)!);
  });
  return out;
}

/**
 * Sync only the chosen fields (their position and style) onto another design.
 * Fields are matched by label, then by family. A chosen field the design does not have is added
 * only when that design actually has text for it (empty fields never get a placeholder box).
 */
export function syncFieldsOntoPage(
  selectedSourceBoxes: TextBoxTemplate[],
  targetBoxes: TextBoxTemplate[],
  targetValues: Record<string, string> = {}
): TextBoxTemplate[] {
  const sources = selectedSourceBoxes.filter(isTextBox);
  const textTargets = targetBoxes.filter(isTextBox);
  const match = matchByLabel(sources, textTargets);

  let k = 0;
  const out = targetBoxes.map((b) => {
    if (!isTextBox(b)) return b;
    const si = match[k++];
    return si >= 0 ? copyBoxLook(b, sources[si]) : b;
  });

  const matchedSources = new Set(match.filter((m) => m >= 0));
  sources.forEach((s, si) => {
    if (matchedSources.has(si)) return;
    const hasText = (targetValues[s.fieldLabel] ?? '').trim() !== '';
    if (hasText) {
      out.push({ ...clone(s), id: `box_sync_${Math.random().toString(36).substring(2, 8)}` });
    }
  });
  return out;
}
