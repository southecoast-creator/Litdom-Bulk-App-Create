/**
 * Litdom Batch Studio - In-place text editor: DOM <-> rich text model bridge
 *
 * The editor surface is an uncontrolled contentEditable element:
 *    <div root>
 *      <div line> <span data-s='{"bold":true}'>Hello</span> <span>world</span> </div>
 *      <div line> <br> </div>                       (empty line placeholder)
 *    </div>
 * Every <span> carries its explicit style overrides in `data-s`, so style survives the browser
 * splitting / merging nodes while the user types. The model (TextRun[]) is the single source of
 * truth: after every edit we read the DOM back into runs, and after every formatting command we
 * rebuild the DOM from runs.
 *
 * Offsets everywhere are plain-text offsets (lines joined with "\n"), identical to richText.ts.
 */

import { TextBoxTemplate, TextRun, TextRunEffect } from '../types';
import { parseListLine } from './listFormat';
import { cloneRun, normalizeRuns, styleOf, RunStyle } from './richText';

export interface EditorRenderOptions {
  box: TextBoxTemplate;
  /** Screen pixels per 1000px design baseline. */
  scale: number;
}

// ---------------------------------------------------------------------------------------------
// Traversal (single definition of "what is a line break" used by every function below)
// ---------------------------------------------------------------------------------------------

const BLOCK_TAGS = new Set([
  'DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'TABLE', 'TR',
]);

function isBlockEl(n: Node): boolean {
  return n.nodeType === 1 && BLOCK_TAGS.has((n as Element).tagName);
}

function parseStyleAttr(el: Element): RunStyle | undefined {
  const raw = el.getAttribute('data-s');
  if (!raw) return undefined;
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? (o as RunStyle) : undefined;
  } catch {
    return undefined;
  }
}

interface Visitor {
  onText(node: Text, style: RunStyle | undefined): void;
  onNewline(): void;
  onEmptyBlock?(el: Element): void;
  onBoundary?(el: Node, index: number): void;
}

export function traverseEditable(root: HTMLElement, v: Visitor): void {
  let needNl = false; // a block just ended: the next content starts on a new line
  let lastWasText = false;
  let emitted = 0;

  const emitNl = () => {
    v.onNewline();
    needNl = false;
    lastWasText = false;
    emitted++;
  };
  const preBlock = () => {
    if (needNl || lastWasText) emitNl();
  };

  const walkChildren = (el: Node, style: RunStyle | undefined) => {
    const kids = el.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      if (isBlockEl(child)) preBlock();
      v.onBoundary?.(el, i);
      walk(child, style);
    }
    v.onBoundary?.(el, kids.length);
  };

  const walk = (node: Node, style: RunStyle | undefined) => {
    if (node.nodeType === 3) {
      const t = node as Text;
      if (!t.data) return;
      if (needNl) emitNl();
      v.onText(t, style);
      lastWasText = true;
      emitted++;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;

    if (el.tagName === 'BR') {
      // A <br> that closes its block only keeps an empty line open: it is not a line break.
      const parent = el.parentElement;
      const placeholder = !!parent && parent !== root && isBlockEl(parent) && parent.lastChild === el;
      if (placeholder) return;
      if (needNl) emitNl();
      emitNl();
      return;
    }

    const st = parseStyleAttr(el) || style;
    if (isBlockEl(el)) {
      preBlock();
      const before = emitted;
      walkChildren(el, st);
      if (emitted === before) v.onEmptyBlock?.(el);
      needNl = true;
      lastWasText = false;
    } else {
      walkChildren(el, st);
    }
  };

  walkChildren(root, undefined);
}

/** Read the editor DOM back into normalized runs. */
export function domToRuns(root: HTMLElement): TextRun[] {
  const out: TextRun[] = [];
  let lastStyle: RunStyle | undefined;
  traverseEditable(root, {
    onText(node, style) {
      out.push({ ...(style || {}), text: node.data.replace(/ /g, ' ') });
      lastStyle = style;
    },
    onNewline() {
      out.push({ ...(lastStyle || {}), text: '\n' });
    },
  });
  return normalizeRuns(out);
}

// ---------------------------------------------------------------------------------------------
// Selection <-> plain-text offsets
// ---------------------------------------------------------------------------------------------

export function pointToOffset(root: HTMLElement, nodeIn: Node, kIn: number): number {
  let node = nodeIn;
  let k = kIn;
  if (node.nodeName === 'BR' && node.parentNode) {
    k = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
    node = node.parentNode;
  }
  let pos = 0;
  let found = -1;
  traverseEditable(root, {
    onText(t) {
      if (found < 0 && t === node) found = pos + Math.min(k, t.data.length);
      pos += t.data.length;
    },
    onNewline() {
      pos += 1;
    },
    onBoundary(el, i) {
      if (found < 0 && el === node && i === k) found = pos;
    },
  });
  return found >= 0 ? found : pos;
}

export function offsetToPoint(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const stops: { node: Node; pos: number; len: number }[] = [];
  let pos = 0;
  traverseEditable(root, {
    onText(t) {
      stops.push({ node: t, pos, len: t.data.length });
      pos += t.data.length;
    },
    onNewline() {
      pos += 1;
    },
    onEmptyBlock(el) {
      stops.push({ node: el, pos, len: 0 });
    },
  });
  for (const s of stops) {
    if (offset >= s.pos && offset <= s.pos + s.len) {
      return s.node.nodeType === 3
        ? { node: s.node, offset: offset - s.pos }
        : { node: s.node, offset: 0 };
    }
  }
  const last = stops[stops.length - 1];
  if (last) {
    return last.node.nodeType === 3
      ? { node: last.node, offset: last.len }
      : { node: last.node, offset: 0 };
  }
  return { node: root, offset: 0 };
}

export function getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const s = pointToOffset(root, r.startContainer, r.startOffset);
  const e = pointToOffset(root, r.endContainer, r.endOffset);
  return { start: Math.min(s, e), end: Math.max(s, e) };
}

export function setSelectionOffsets(root: HTMLElement, start: number, end: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const a = offsetToPoint(root, start);
  const b = start === end ? a : offsetToPoint(root, end);
  const range = document.createRange();
  try {
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
  } catch {
    return;
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

// ---------------------------------------------------------------------------------------------
// Rendering runs -> DOM
// ---------------------------------------------------------------------------------------------

function mergeEffects(box: TextBoxTemplate, run: TextRun): TextRunEffect | undefined {
  const merged: TextRunEffect = { ...(box.effects || {}) };
  if (box.shadow) merged.shadow = { enabled: true, ...box.shadow };
  if (box.stroke) merged.outline = { enabled: true, ...box.stroke };
  Object.assign(merged, run.effects || {});
  return Object.keys(merged).length ? merged : undefined;
}

function applyRunCss(el: HTMLElement, run: TextRun, opts: EditorRenderOptions): void {
  const { box, scale } = opts;
  const s = el.style;

  const family = run.fontFamily || box.fontFamily || 'Plus Jakarta Sans';
  s.fontFamily = `"${family}", sans-serif`;

  const size = run.fontSize !== undefined ? run.fontSize : box.fontSize;
  s.fontSize = `${Math.max(6, Math.round(size * scale))}px`;

  const bold = run.bold !== undefined ? run.bold : box.fontWeight === '700' || box.fontWeight === '800';
  s.fontWeight = bold ? '800' : '400';

  const italic = run.italic !== undefined ? run.italic : box.fontStyle === 'italic';
  s.fontStyle = italic ? 'italic' : 'normal';

  const deco = `${run.underline ? 'underline ' : ''}${run.strike ? 'line-through' : ''}`.trim();
  s.textDecoration = deco || 'none';

  const spacing = run.letterSpacing !== undefined ? run.letterSpacing : box.letterSpacing || 0;
  s.letterSpacing = `${Math.round(spacing * scale * 10) / 10}px`;

  // Colour / gradient (same priority as the canvas renderer: own colour wins, then gradient)
  const runGradient = run.gradient?.enabled ? run.gradient : undefined;
  const boxGradient = box.gradient?.enabled
    ? box.gradient
    : box.effects?.gradient?.enabled
    ? box.effects.gradient
    : undefined;
  const gradient = run.color !== undefined ? undefined : runGradient || boxGradient;
  if (gradient) {
    const c1 = gradient.color || '#22C55E';
    const c2 = gradient.color2 || '#FACC15';
    const c3 = gradient.color3 || '#3B82F6';
    s.backgroundImage = `linear-gradient(${gradient.angle ?? 90}deg, ${c1}, ${c2}, ${c3})`;
    s.setProperty('-webkit-background-clip', 'text');
    s.setProperty('background-clip', 'text');
    s.color = 'transparent';
    s.setProperty('-webkit-text-fill-color', 'transparent');
  } else {
    s.color = run.color || box.color || '#FFF8E7';
  }

  // Light-weight previews of the canvas effects so the editor looks like the result
  const fx = mergeEffects(box, run);
  if (fx) {
    const shadows: string[] = [];
    if (fx.shadow?.enabled !== false && fx.shadow) {
      shadows.push(
        `${(fx.shadow.offsetX ?? 3) * scale}px ${(fx.shadow.offsetY ?? 3) * scale}px ${(fx.shadow.blur ?? 6) * scale}px ${fx.shadow.color || '#000000'}`
      );
    }
    if (fx.glow?.enabled) {
      const c = fx.glow.color || '#D4AF37';
      const r = Math.max(4, (fx.glow.strength ?? 12) * scale);
      shadows.push(`0 0 ${r}px ${c}`);
    }
    if (fx.neon?.enabled) {
      const c = fx.neon.color || '#00FFCC';
      shadows.push(`0 0 ${4 * scale}px ${c}`, `0 0 ${12 * scale}px ${c}`);
    }
    if (shadows.length) s.textShadow = shadows.join(', ');

    if (fx.outline?.enabled && !gradient) {
      s.setProperty(
        '-webkit-text-stroke',
        `${Math.max(0.5, (fx.outline.width ?? fx.outline.strokeWidth ?? 2) * scale * 0.5)}px ${fx.outline.color || '#000000'}`
      );
    }
    if (fx.hollow?.enabled) {
      s.setProperty(
        '-webkit-text-stroke',
        `${Math.max(0.5, (fx.hollow.width ?? 2) * scale * 0.5)}px ${run.color || box.color || '#FFF8E7'}`
      );
      s.color = 'transparent';
      s.setProperty('-webkit-text-fill-color', 'transparent');
    }
    if (fx.highlight?.enabled) {
      s.backgroundColor = fx.highlight.color || '#FACC15';
      s.borderRadius = '3px';
    }
  }
}

/** Split runs into lines (arrays of runs without newline characters). */
export function runsToLines(runs: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [[]];
  for (const r of runs) {
    const parts = r.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push(cloneRun(r, part));
    });
  }
  return lines;
}

/** Rebuild the editable DOM from runs (replaces everything inside `root`). */
export function renderRunsToDom(root: HTMLElement, runs: TextRun[], opts: EditorRenderOptions): void {
  while (root.firstChild) root.removeChild(root.firstChild);
  const lines = runsToLines(runs);
  const listLines: { el: HTMLElement; prefixLength: number }[] = [];

  for (const line of lines) {
    const div = document.createElement('div');
    div.style.minHeight = '1em';
    div.style.whiteSpace = 'pre-wrap';
    div.style.overflowWrap = 'anywhere';
    const lineText = line.map((r) => r.text).join('');

    if (!lineText) {
      div.appendChild(document.createElement('br'));
    } else {
      for (const piece of line) {
        const span = document.createElement('span');
        span.textContent = piece.text;
        const st = styleOf(piece);
        if (Object.keys(st).length) span.setAttribute('data-s', JSON.stringify(st));
        applyRunCss(span, piece, opts);
        div.appendChild(span);
      }
      const info = parseListLine(lineText);
      if (info) {
        div.style.textAlign = 'left';
        listLines.push({ el: div, prefixLength: info.prefixLength });
      }
    }
    root.appendChild(div);
  }

  // Hanging indent for list lines: wrapped text lines up under the first word, not the bullet.
  for (const { el, prefixLength } of listLines) {
    let width = 0;
    try {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let remaining = prefixLength;
      let first: Text | null = null;
      let firstOffset = 0;
      let last: Text | null = null;
      let lastOffset = 0;
      let n = walker.nextNode() as Text | null;
      while (n && remaining > 0) {
        if (!first) first = n;
        const take = Math.min(remaining, n.data.length);
        last = n;
        lastOffset = take;
        remaining -= take;
        n = remaining > 0 ? (walker.nextNode() as Text | null) : null;
      }
      if (first && last) {
        const range = document.createRange();
        range.setStart(first, firstOffset);
        range.setEnd(last, lastOffset);
        width = range.getBoundingClientRect().width;
      }
    } catch {
      width = 0;
    }
    if (width > 1) {
      el.style.paddingLeft = `${Math.ceil(width)}px`;
      el.style.textIndent = `-${Math.ceil(width)}px`;
    } else {
      el.style.paddingLeft = '1.3em';
      el.style.textIndent = '-1.3em';
    }
  }
}

/** True when the DOM still has the exact structure renderRunsToDom produces. */
export function isCleanStructure(root: HTMLElement): boolean {
  if (root.childNodes.length === 0) return false;
  for (const line of Array.from(root.childNodes)) {
    if (line.nodeName !== 'DIV') return false;
    const kids = Array.from(line.childNodes);
    if (kids.length === 1 && kids[0].nodeName === 'BR') continue;
    if (kids.length === 0) return false;
    for (const k of kids) {
      if (k.nodeName !== 'SPAN') return false;
      if (k.childNodes.length !== 1 || k.firstChild!.nodeType !== 3) return false;
    }
  }
  return true;
}
