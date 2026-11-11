/**
 * Litdom Batch Studio - DOCX/OpenXML 27-Style Structure Parser & Adaptive Spreadsheet Engine
 * Inspects word/document.xml and word/styles.xml using JSZip.
 * Maps paragraph styles to 27 standard style categories, groups consecutive same-style content,
 * calculates maximum occurrences per page, and generates dynamic shared-column spreadsheets.
 */

import JSZip from 'jszip';
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
  if (stylesXmlEntry) {
    const stylesXml = await stylesXmlEntry.async('string');
    styleMap = parseStylesXml(stylesXml);
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
  const startNewPage = () => {
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
    let pText = '';
    let isB = false;
    let isI = false;
    let isU = false;

    const flush = () => {
      const cleanText = pText.trim();
      if (cleanText) {
        rawPages[currentPageIndex].push({
          style: category,
          text: cleanText,
          isBold: isB,
          isItalic: isI,
          isUnderline: isU,
        });
      }
      pText = '';
      isB = false;
      isI = false;
      isU = false;
    };

    const runs = p.getElementsByTagName('w:r');
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const rPr = run.getElementsByTagName('w:rPr')[0];
      if (rPr) {
        if (rPr.getElementsByTagName('w:b').length > 0) isB = true;
        if (rPr.getElementsByTagName('w:i').length > 0) isI = true;
        if (rPr.getElementsByTagName('w:u').length > 0) isU = true;
      }

      for (let c = 0; c < run.childNodes.length; c++) {
        const child = run.childNodes[c] as Element;
        const nodeName = child.nodeName;
        if (nodeName === 'w:t') {
          pText += child.textContent || '';
        } else if (nodeName === 'w:br' && child.getAttribute('w:type') === 'page') {
          flush();
          startNewPage();
        }
      }
    }
    flush();

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

  validPages.forEach((pageBlocks, idx) => {
    const occurrences: Record<string, string[]> = {};
    let currentStyle: string | null = null;
    let currentText = '';

    const commitGroup = () => {
      if (currentStyle && currentText) {
        if (!occurrences[currentStyle]) occurrences[currentStyle] = [];
        occurrences[currentStyle].push(currentText);
        detectedStylesSet.add(currentStyle);
      }
      currentStyle = null;
      currentText = '';
    };

    for (const b of pageBlocks) {
      if (b.style === currentStyle) {
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

  const generatedColumns: string[] = [];
  for (const st of detectedStylesList) {
    const count = maxOccurrences[st] || 1;
    if (count === 1) {
      generatedColumns.push(st);
    } else {
      for (let c = 1; c <= count; c++) {
        generatedColumns.push(`${st} - ${c}`);
      }
    }
  }

  // Generate Spreadsheet Data rows: Row 1 = Headers (handled by xlsx), Row 2+ = Page 1, Page 2...
  const spreadsheetData: Record<string, string>[] = [];

  for (const scan of pageScans) {
    const row: Record<string, string> = {};
    // Ensure all columns exist in the object
    for (const col of generatedColumns) {
      row[col] = '';
    }

    for (const st of detectedStylesList) {
      const groups = scan.occurrences[st] || [];
      const count = maxOccurrences[st] || 1;

      if (count === 1) {
        row[st] = groups[0] || '';
      } else {
        for (let c = 0; c < count; c++) {
          row[`${st} - ${c + 1}`] = groups[c] || '';
        }
      }
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
