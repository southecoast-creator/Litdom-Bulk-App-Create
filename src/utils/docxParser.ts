/**
 * Litdom Batch Studio - DOCX/OpenXML 27-Style Structure Parser & Adaptive Spreadsheet Engine
 * Inspects word/document.xml and word/styles.xml using JSZip.
 * Maps paragraph styles to 27 standard style categories, groups consecutive same-style content,
 * calculates maximum occurrences per page, and generates dynamic shared-column spreadsheets.
 */

import JSZip from 'jszip';
import { ColumnKey, orderColumnKeys } from './columnOrder';
import * as XLSX from 'xlsx';
import {
  DOCX_STANDARD_STYLES,
  DocxBlock,
  DocxPageScan,
  DocxScanResult,
  DocxStyleCategory,
} from '../types';

/**
 * Standard Style Normalization Dictionary
 * Maps raw OpenXML style IDs and names to the official 27 Litdom categories.
 */
function normalizeStyleName(rawId: string, rawName: string): DocxStyleCategory {
  const combined = `${rawId} ${rawName}`.toLowerCase().replace(/[-_\s]+/g, '');

  if (combined.includes('title') && !combined.includes('subtitle') && !combined.includes('book')) {
    return 'Title';
  }
  if (combined.includes('subtitle')) return 'Subtitle';
  if (combined.includes('heading1')) return 'Heading 1';
  if (combined.includes('heading2')) return 'Heading 2';
  if (combined.includes('heading3')) return 'Heading 3';
  if (combined.includes('heading4')) return 'Heading 4';
  if (combined.includes('heading5')) return 'Heading 5';
  if (combined.includes('heading6')) return 'Heading 6';
  if (combined.includes('heading7')) return 'Heading 7';
  if (combined.includes('heading8')) return 'Heading 8';
  if (combined.includes('heading9')) return 'Heading 9';
  if (combined.includes('intensequote')) return 'Intense Quote';
  if (combined.includes('quote')) return 'Quote';
  if (combined.includes('blocktext')) return 'Block Text';
  if (combined.includes('bodytextfirstindent')) return 'Body Text First Indent';
  if (combined.includes('bodytextindent')) return 'Body Text Indent';
  if (combined.includes('bodytext2')) return 'Body Text 2';
  if (combined.includes('bodytext3')) return 'Body Text 3';
  if (combined.includes('bodytext')) return 'Body Text';
  if (combined.includes('caption')) return 'Caption';
  if (combined.includes('booktitle')) return 'Book Title';
  if (combined.includes('listbullet') || combined.includes('bullet')) return 'List Bullet';
  if (combined.includes('listnumber') || combined.includes('numbering')) return 'List Number';
  if (combined.includes('listparagraph') || combined.includes('list')) return 'List Paragraph';
  if (combined.includes('noteheading')) return 'Note Heading';
  if (combined.includes('plaintext')) return 'Plain Text';
  if (combined.includes('normal') || combined.includes('standard') || combined.includes('body')) {
    return 'Normal Text';
  }

  // Exact matches against 27 categories
  for (const std of DOCX_STANDARD_STYLES) {
    if (std.toLowerCase().replace(/[-_\s]+/g, '') === combined) {
      return std;
    }
  }

  return 'Normal Text';
}

/**
 * Parses word/styles.xml to create styleId -> styleName lookup
 */
function parseStylesXml(xmlStr: string): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'application/xml');
    const styleNodes = doc.getElementsByTagName('w:style');

    for (let i = 0; i < styleNodes.length; i++) {
      const node = styleNodes[i];
      const styleId = node.getAttribute('w:styleId') || '';
      const nameNode = node.getElementsByTagName('w:name')[0];
      const nameVal = nameNode?.getAttribute('w:val') || styleId;
      if (styleId) {
        map[styleId] = nameVal;
      }
    }
  } catch (err) {
    console.warn('Failed to parse styles.xml:', err);
  }
  return map;
}

/**
 * Paragraph spacing (twips; 20 twips = 1pt). A gap of about a line or more between two paragraphs
 * means "new paragraph = new text box". Plain Enter with Word's small default spacing does not.
 */
const PARAGRAPH_GAP_TWIPS = 200; // 10pt, a bit less than one line of body text
const LINE_TWIPS = 240;
const AUTO_SPACING_TWIPS = 280;

interface Spacing {
  before?: number;
  after?: number;
  contextual?: boolean;
}
interface StyleSpacingInfo {
  defaults: Spacing;
  styles: Record<string, { basedOn?: string; sp: Spacing }>;
}

/** Reads <w:spacing> and <w:contextualSpacing> out of a paragraph-properties element */
function readSpacing(pPr: Element | undefined | null): Spacing {
  const out: Spacing = {};
  if (!pPr) return out;
  const el = pPr.getElementsByTagName('w:spacing')[0];
  if (el) {
    const side = (name: 'before' | 'after') => {
      const auto = el.getAttribute(`w:${name}Autospacing`);
      if (auto === '1' || auto === 'true') return AUTO_SPACING_TWIPS;
      const lines = el.getAttribute(`w:${name}Lines`);
      if (lines !== null && lines !== '' && !isNaN(Number(lines))) return (Number(lines) / 100) * LINE_TWIPS;
      const tw = el.getAttribute(`w:${name}`);
      if (tw !== null && tw !== '' && !isNaN(Number(tw))) return Number(tw);
      return undefined;
    };
    out.before = side('before');
    out.after = side('after');
  }
  const ctx = pPr.getElementsByTagName('w:contextualSpacing')[0];
  if (ctx) {
    const v = (ctx.getAttribute('w:val') || '').toLowerCase();
    out.contextual = !(v === '0' || v === 'false');
  }
  return out;
}

function parseStyleSpacing(xmlStr: string): StyleSpacingInfo {
  const info: StyleSpacingInfo = { defaults: {}, styles: {} };
  try {
    const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    const dd = doc.getElementsByTagName('w:pPrDefault')[0];
    if (dd) info.defaults = readSpacing(dd.getElementsByTagName('w:pPr')[0]);
    const nodes = doc.getElementsByTagName('w:style');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const id = n.getAttribute('w:styleId') || '';
      if (!id) continue;
      const basedOn = n.getElementsByTagName('w:basedOn')[0]?.getAttribute('w:val') || undefined;
      // only the style's own paragraph properties (not its table/run properties)
      let pPr: Element | undefined;
      for (let c = 0; c < n.childNodes.length; c++) {
        if (n.childNodes[c].nodeName === 'w:pPr') pPr = n.childNodes[c] as Element;
      }
      info.styles[id] = { basedOn, sp: readSpacing(pPr) };
    }
  } catch (err) {
    console.warn('Failed to read paragraph spacing from styles.xml:', err);
  }
  return info;
}

/** The spacing a paragraph really has: its own settings, else its style chain, else the defaults */
function resolveSpacing(pPr: Element | undefined | null, styleId: string, info: StyleSpacingInfo): Required<Spacing> {
  const direct = readSpacing(pPr);
  let before = direct.before;
  let after = direct.after;
  let contextual = direct.contextual;
  let id: string | undefined = styleId;
  const seen = new Set<string>();
  while (id && !seen.has(id) && info.styles[id]) {
    seen.add(id);
    const st = info.styles[id];
    if (before === undefined) before = st.sp.before;
    if (after === undefined) after = st.sp.after;
    if (contextual === undefined) contextual = st.sp.contextual;
    id = st.basedOn;
  }
  if (before === undefined) before = info.defaults.before;
  if (after === undefined) after = info.defaults.after;
  return { before: before ?? 0, after: after ?? 0, contextual: contextual ?? false };
}

/**
 * Parses word/numbering.xml -> "numId:ilvl" -> number format (bullet, decimal, lowerLetter ...).
 * Word's real bullet / numbered lists usually carry the generic "List Paragraph" style and
 * only reveal their kind through numbering.xml.
 */
function parseNumberingXml(xmlStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    const abstractFmt: Record<string, Record<string, string>> = {};
    const abstracts = doc.getElementsByTagName('w:abstractNum');
    for (let i = 0; i < abstracts.length; i++) {
      const a = abstracts[i];
      const id = a.getAttribute('w:abstractNumId') || '';
      const lvls = a.getElementsByTagName('w:lvl');
      abstractFmt[id] = {};
      for (let l = 0; l < lvls.length; l++) {
        const ilvl = lvls[l].getAttribute('w:ilvl') || '0';
        const fmt = lvls[l].getElementsByTagName('w:numFmt')[0]?.getAttribute('w:val') || '';
        abstractFmt[id][ilvl] = fmt;
      }
    }
    const nums = doc.getElementsByTagName('w:num');
    for (let i = 0; i < nums.length; i++) {
      const numId = nums[i].getAttribute('w:numId') || '';
      const absId = nums[i].getElementsByTagName('w:abstractNumId')[0]?.getAttribute('w:val') || '';
      const levels = abstractFmt[absId] || {};
      for (const [ilvl, fmt] of Object.entries(levels)) result[`${numId}:${ilvl}`] = fmt;
    }
  } catch (err) {
    console.warn('Failed to parse numbering.xml:', err);
  }
  return result;
}

const PLAIN_PARAGRAPH_CATEGORIES = new Set(['List Paragraph', 'Normal Text', 'Body Text', 'Plain Text']);

/**
 * Main DOCX File Parser:
 * Deterministic OpenXML structure inspection extracting paragraph styles and pages.
 */
export async function parseDocxFile(file: File | Blob, filename: string = 'document.docx'): Promise<DocxScanResult> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  const documentXmlEntry = loadedZip.file('word/document.xml');
  if (!documentXmlEntry) {
    throw new Error('Invalid DOCX file: word/document.xml missing.');
  }

  const stylesXmlEntry = loadedZip.file('word/styles.xml');
  let styleMap: Record<string, string> = {};
  let styleSpacing: StyleSpacingInfo = { defaults: {}, styles: {} };
  if (stylesXmlEntry) {
    const stylesXml = await stylesXmlEntry.async('string');
    styleMap = parseStylesXml(stylesXml);
    styleSpacing = parseStyleSpacing(stylesXml);
  }

  const numberingEntry = loadedZip.file('word/numbering.xml');
  const numberingMap: Record<string, string> = numberingEntry
    ? parseNumberingXml(await numberingEntry.async('string'))
    : {};

  const documentXml = await documentXmlEntry.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'application/xml');

  const paragraphs = doc.getElementsByTagName('w:p');

  const rawPages: DocxBlock[][] = [[]];
  let currentPageIndex = 0;

  // Every explicit page break starts a new page, even when the current page has no text.
  // That keeps "1 page in the document = 1 row in the sheet", exactly like Word / Docs count pages.
  // A blank line (empty paragraph) in Word means "new paragraph": the next block starts its own
  // sheet column instead of being glued onto the previous one.
  let sawBlank = false;
  // Spacing of the previous paragraph, to measure the gap before the next one
  let prevAfter = 0;
  let prevStyleId = '';
  let prevContextual = false;
  const startNewPage = () => {
    sawBlank = false;
    prevAfter = 0;
    prevStyleId = '';
    prevContextual = false;
    currentPageIndex++;
    rawPages[currentPageIndex] = [];
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];

    // Determine paragraph style
    const pPr = p.getElementsByTagName('w:pPr')[0];
    const pStyle = pPr?.getElementsByTagName('w:pStyle')[0];
    const styleId = pStyle?.getAttribute('w:val') || 'Normal';
    const styleName = styleMap[styleId] || styleId;
    let category = normalizeStyleName(styleId, styleName);
    const spacing = resolveSpacing(pPr, styleId, styleSpacing);

    // Real Word bullet / numbered lists (w:numPr) -> List Bullet / List Number
    const numPr = pPr?.getElementsByTagName('w:numPr')[0];
    if (numPr && PLAIN_PARAGRAPH_CATEGORIES.has(String(category))) {
      const numId = numPr.getElementsByTagName('w:numId')[0]?.getAttribute('w:val') || '';
      const ilvl = numPr.getElementsByTagName('w:ilvl')[0]?.getAttribute('w:val') || '0';
      if (numId && numId !== '0') {
        const fmt = numberingMap[`${numId}:${ilvl}`] ?? numberingMap[`${numId}:0`];
        if (fmt === 'bullet') category = 'List Bullet';
        else if (fmt && fmt !== 'none') category = 'List Number';
      }
    }

    // Walk the runs in order. Text before a page break stays on the current page, text after it
    // goes to the next page (a break at the end of a paragraph must not drag its text forward).
    // Inline formatting is kept per run as markdown markers (**bold**, *italic*, __underline__)
    // so the sheet cell carries it and the template renders it at the same position.
    let segs: { text: string; b: boolean; i: boolean; u: boolean }[] = [];
    let isB = false;
    let isI = false;
    let isU = false;
    const flagOn = (el: Element | undefined) => {
      if (!el) return false;
      const v = (el.getAttribute('w:val') || '').toLowerCase();
      return !(v === '0' || v === 'false' || v === 'none');
    };

    const flush = () => {
      const plain = segs.map((s) => s.text).join('');
      const cleanText = plain.trim();
      if (cleanText) {
        const allSame = (k: 'b' | 'i' | 'u') => segs.every((s) => !s.text.trim() || s[k]);
        // A whole paragraph that is bold in a heading/title style is already bold by its style
        const keepWhole = !/title|heading|quote/i.test(String(category));
        const wrap = (t: string, s: { b: boolean; i: boolean; u: boolean }) => {
          if (!t.trim()) return t;
          const lead = t.match(/^\s*/)![0];
          const trail = t.match(/\s*$/)![0];
          const core = t.trim();
          let m = core;
          if (s.b && (keepWhole || !allSame('b'))) m = `**${core}**`;
          else if (s.i && (keepWhole || !allSame('i'))) m = `*${core}*`;
          else if (s.u && (keepWhole || !allSame('u'))) m = `__${core}__`;
          return lead + m + trail;
        };
        // Merge neighbouring runs that share a format, then wrap each group
        const merged: typeof segs = [];
        for (const sg of segs) {
          const last = merged[merged.length - 1];
          if (last && last.b === sg.b && last.i === sg.i && last.u === sg.u) last.text += sg.text;
          else merged.push({ ...sg });
        }
        const md = merged.map((sg) => wrap(sg.text, sg)).join('').trim();
        rawPages[currentPageIndex].push({
          style: category,
          text: md,
          isBold: isB,
          isItalic: isI,
          isUnderline: isU,
          afterBlank:
            sawBlank ||
            (rawPages[currentPageIndex].length > 0 &&
              !(prevContextual && spacing.contextual && prevStyleId === styleId) &&
              prevAfter + spacing.before >= PARAGRAPH_GAP_TWIPS),
        });
        sawBlank = false;
      }
      segs = [];
      isB = false;
      isI = false;
      isU = false;
    };

    const runs = p.getElementsByTagName('w:r');
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const rPr = run.getElementsByTagName('w:rPr')[0];
      const rb = flagOn(rPr?.getElementsByTagName('w:b')[0]);
      const ri = flagOn(rPr?.getElementsByTagName('w:i')[0]);
      const ru = flagOn(rPr?.getElementsByTagName('w:u')[0]);
      if (rb) isB = true;
      if (ri) isI = true;
      if (ru) isU = true;

      for (let c = 0; c < run.childNodes.length; c++) {
        const child = run.childNodes[c] as Element;
        const nodeName = child.nodeName;
        if (nodeName === 'w:t') {
          segs.push({ text: child.textContent || '', b: rb, i: ri, u: ru });
        } else if (nodeName === 'w:br' && child.getAttribute('w:type') === 'page') {
          flush();
          startNewPage();
        }
      }
    }
    flush();

    // An empty paragraph (nothing in it, no page break, no picture) is a blank line
    if (
      (p.textContent || '').trim() === '' &&
      p.getElementsByTagName('w:br').length === 0 &&
      p.getElementsByTagName('w:drawing').length === 0 &&
      p.getElementsByTagName('w:pict').length === 0 &&
      rawPages[currentPageIndex].length > 0
    ) {
      sawBlank = true;
    }

    prevAfter = spacing.after;
    prevStyleId = styleId;
    prevContextual = spacing.contextual;

    // Check for section break at paragraph end
    const sectPr = pPr?.getElementsByTagName('w:sectPr')[0];
    if (sectPr && i < paragraphs.length - 1 && rawPages[currentPageIndex].length > 0) {
      startNewPage();
    }
  }

  // Blank pages are KEPT (as empty rows) so row N always matches page N. If nothing at all has
  // text, fall back to a single title page.
  const validPages = rawPages;
  if (!validPages.some((p) => p.length > 0)) {
    validPages.length = 0;
    validPages.push([
      {
        style: 'Title',
        text: filename.replace(/\.[^/.]+$/, ''),
      },
    ]);
  }
  const blankPages: number[] = [];
  validPages.forEach((p, idx) => {
    if (p.length === 0) blankPages.push(idx + 1);
  });

  // Group consecutive blocks of the same style on each page
  const pageScans: DocxPageScan[] = [];
  const detectedStylesSet = new Set<string>();
  const maxOccurrences: Record<string, number> = {};
  const pageSequences: ColumnKey[][] = [];

  validPages.forEach((pageBlocks, idx) => {
    const occurrences: Record<string, string[]> = {};
    const sequence: ColumnKey[] = [];
    let currentStyle: string | null = null;
    let currentText = '';

    const commitGroup = () => {
      if (currentStyle && currentText) {
        if (!occurrences[currentStyle]) occurrences[currentStyle] = [];
        occurrences[currentStyle].push(currentText);
        sequence.push({ style: currentStyle, n: occurrences[currentStyle].length - 1 });
        detectedStylesSet.add(currentStyle);
      }
      currentStyle = null;
      currentText = '';
    };

    for (const b of pageBlocks) {
      if (b.style === currentStyle && !b.afterBlank) {
        currentText += `\n${b.text}`;
      } else {
        commitGroup();
        currentStyle = b.style;
        currentText = b.text;
      }
    }
    commitGroup();

    // Update max occurrences across pages
    for (const [st, groups] of Object.entries(occurrences)) {
      maxOccurrences[st] = Math.max(maxOccurrences[st] || 0, groups.length);
    }

    pageSequences.push(sequence);
    pageScans.push({
      pageNumber: idx + 1,
      blocks: pageBlocks,
      occurrences,
    });
  });

  // Generate shared columns in natural order based on detected styles
  const detectedStylesList = Array.from(detectedStylesSet).sort((a, b) => {
    const idxA = DOCX_STANDARD_STYLES.indexOf(a as any);
    const idxB = DOCX_STANDARD_STYLES.indexOf(b as any);
    return (idxA >= 0 ? idxA : 999) - (idxB >= 0 ? idxB : 999);
  });

  // Columns follow the READING ORDER of the document (Heading 1, Paragraph, Heading 1 - 2,
  // Paragraph - 2 ...), not "all headings, then all paragraphs", so stacking text from the sheet
  // gives the same order as the Word page.
  const columnName = (k: ColumnKey) => ((maxOccurrences[k.style] || 1) === 1 ? k.style : `${k.style} - ${k.n + 1}`);
  const generatedColumns: string[] = orderColumnKeys(pageSequences).map(columnName);

  // Generate Spreadsheet Data rows: Row 1 = Headers (handled by xlsx), Row 2+ = Page 1, Page 2...
  const spreadsheetData: Record<string, string>[] = [];

  for (const scan of pageScans) {
    const row: Record<string, string> = {};
    for (const col of generatedColumns) {
      row[col] = '';
    }
    for (const [st, groups] of Object.entries(scan.occurrences)) {
      groups.forEach((text, c) => {
        row[columnName({ style: st, n: c })] = text;
      });
    }
    spreadsheetData.push(row);
  }

  return {
    filename,
    pages: pageScans,
    detectedStyles: detectedStylesList,
    maxOccurrences,
    generatedColumns,
    spreadsheetData,
    blankPages,
  };
}

/**
 * Generates an actual Excel file (.xlsx) Blob from the scan result
 */
export function generateDocxSpreadsheetBlob(result: DocxScanResult): Blob {
  const ws = XLSX.utils.json_to_sheet(result.spreadsheetData, {
    header: result.generatedColumns,
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Document Content');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Triggers native download of the generated Excel spreadsheet
 */
export function downloadDocxSpreadsheet(result: DocxScanResult): void {
  const blob = generateDocxSpreadsheetBlob(result);
  const cleanName = result.filename.replace(/\.[^/.]+$/, '');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanName}_spreadsheet.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
