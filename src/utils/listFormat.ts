/**
 * Litdom Batch Studio - Bullet & Numbered List helpers (pure, no DOM, no React)
 *
 * Lists are stored as real text markers at the start of a line:
 *    "• First point"        (bullet)
 *    "1. First step"        (number)
 * That keeps them working everywhere (canvas preview, PNG/JPG/PDF export, spreadsheets,
 * the plain "Current Design Text" box). The canvas renderer and the in-place editor detect
 * these markers and give wrapped lines a hanging indent so the text lines up neatly.
 */

export type ListKind = 'bullet' | 'number';

export const BULLET_MARK = '•';

/** Strict: exactly what this app writes. Used for rendering, toggling and editing. */
const LIST_LINE_RE = /^([ \t]*)(•|(\d{1,3})[.)])([ \t]+)/;

/**
 * Loose: also strips markers typed by hand or pasted from other apps. Only used when a column
 * is already known to be a list column (so "- text" in a normal paragraph is never touched).
 */
const LOOSE_MARKER_RE = /^[ \t]*(?:[•●▪◦‣▫■□○◆◇–—\-*]|\d{1,3}[.)]|[a-zA-Z][.)])[ \t]+/;

export interface ListLineInfo {
  kind: ListKind;
  /** Number shown for numbered lines. */
  number?: number;
  /** Length of "indent + marker + spaces" at the start of the line. */
  prefixLength: number;
}

export function parseListLine(line: string): ListLineInfo | null {
  const m = LIST_LINE_RE.exec(line);
  if (!m) return null;
  if (m[2] === BULLET_MARK) {
    return { kind: 'bullet', prefixLength: m[0].length };
  }
  return { kind: 'number', number: parseInt(m[3], 10), prefixLength: m[0].length };
}

export function makeMarker(kind: ListKind, n: number = 1): string {
  return kind === 'bullet' ? `${BULLET_MARK} ` : `${n}. `;
}

/** Remove a strict list marker from the start of a line (if any). */
export function stripListMarker(line: string): string {
  const info = parseListLine(line);
  return info ? line.slice(info.prefixLength) : line;
}

/** Remove any marker-looking prefix (strict or hand-typed). */
export function stripLooseMarker(line: string): string {
  return line.replace(LOOSE_MARKER_RE, '');
}

/**
 * Renumber every consecutive run of numbered lines as 1, 2, 3 ...
 * Bullet lines, blank lines and normal lines end a run.
 */
export function renumberLines(lines: string[]): string[] {
  const out: string[] = [];
  let counter = 0;
  for (const line of lines) {
    const info = parseListLine(line);
    if (info && info.kind === 'number') {
      counter += 1;
      out.push(`${counter}. ${line.slice(info.prefixLength)}`);
    } else {
      counter = 0;
      out.push(line);
    }
  }
  return out;
}

/**
 * Which list (if any) does a spreadsheet column / field label stand for?
 *   "List Bullet", "List Bullet - 2"  -> bullet
 *   "List Number", "List Number - 3"  -> number
 */
export function listKindFromLabel(label: string | undefined | null): ListKind | null {
  if (!label) return null;
  const clean = label.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (/^list ?bullet(s|ed)?\b/.test(clean)) return 'bullet';
  if (/^list ?number(s|ed)?\b/.test(clean)) return 'number';
  if (/^(bullet(ed)?|bullets?) list\b/.test(clean)) return 'bullet';
  if (/^(number(ed)?|numbers?) list\b/.test(clean)) return 'number';
  return null;
}

/**
 * Turn plain items (one per line) into a bullet or numbered list.
 * Idempotent: running it twice gives the same result. Blank lines are kept and
 * do not consume a number.
 */
export function applyListMarkers(text: string, kind: ListKind): string {
  if (!text) return text;
  const lines = text.split(/\r\n|\r|\n/);
  let n = 0;
  const out = lines.map((line) => {
    if (!line.trim()) return '';
    const body = stripLooseMarker(line).trim();
    if (!body) return '';
    n += 1;
    return makeMarker(kind, n) + body;
  });
  return out.join('\n');
}

/** True when every non-empty line already carries a marker of this kind. */
export function allLinesAreList(lines: string[], kind: ListKind): boolean {
  let seen = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const info = parseListLine(line);
    if (!info || info.kind !== kind) return false;
    seen += 1;
  }
  return seen > 0;
}
