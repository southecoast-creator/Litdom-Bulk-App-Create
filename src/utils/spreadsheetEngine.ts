/**
 * Litdom Batch Studio - Spreadsheet Engine
 * UTF-8 CSV & ArrayBuffer XLSX parsing with SheetJS.
 * Immediate 1:1 row-to-design mapping, fuzzy & alias matching, positional fallback,
 * and reconciliation.
 */

import * as XLSX from 'xlsx';
import { TextBoxTemplate, DesignPage } from '../types';

export interface ParsedSpreadsheet {
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface AutoMappingResult {
  mappings: Record<string, string>; // fieldLabel -> column header (or empty string if not mapped)
  usedHeaders: Set<string>;
  unusedHeaders: string[];
  matchedByName: boolean;
}

export interface PopulationResult {
  pages: DesignPage[];
  totalDesigns: number;
  totalRows: number;
  statusMessage: string;
  statusType: 'exact' | 'fewer_rows' | 'more_rows' | 'empty';
  excessRowCount: number;
  unfilledDesignStart: number;
}

// Canonical Aliases for Common Design Fields
const FIELD_ALIASES: Record<string, string[]> = {
  cta: ['cta', 'button', 'action', 'btn', 'calltoaction', 'link', 'bouton', 'url'],
  title: ['title', 'headline', 'heading', 'header', 'titre', 'maintitle', 'name', 'titre1'],
  subtitle: ['subtitle', 'subhead', 'subheadline', 'tagline', 'subtext', 'secondline', 'soustitre'],
  paragraph1: ['paragraph1', 'p1', 'paragraph', 'body', 'desc', 'description', 'copy', 'content', 'text', 'para1'],
  paragraph2: ['paragraph2', 'p2', 'body2', 'desc2', 'para2'],
  paragraph3: ['paragraph3', 'p3', 'body3', 'desc3', 'para3'],
  footer: ['footer', 'disclaimer', 'footnote', 'bottom', 'copyright', 'pieddepage'],
};

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Make headers unique if duplicate columns exist
 */
function makeHeadersUnique(rawHeaders: string[]): string[] {
  const counts: Record<string, number> = {};
  return rawHeaders.map((h, i) => {
    const clean = (h || `Column_${i + 1}`).trim();
    if (counts[clean] === undefined) {
      counts[clean] = 1;
      return clean;
    } else {
      counts[clean] += 1;
      return `${clean}_${counts[clean]}`;
    }
  });
}

/**
 * Parse CSV (as UTF-8 text) or Excel file (.xlsx, .xls)
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  let workbook: XLSX.WorkBook;

  if (isCsv) {
    // Read CSV as UTF-8 text so emoji, accents, and symbols survive
    const text = await file.text();
    workbook = XLSX.read(text, {
      type: 'string',
      raw: true,
      codepage: 65001, // UTF-8
    });
  } else {
    // Read Excel as ArrayBuffer
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, {
      type: 'array',
      raw: true,
      cellDates: true,
    });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Spreadsheet contains no sheets or readable data.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });

  if (!rawMatrix || rawMatrix.length === 0) {
    throw new Error('The spreadsheet is empty.');
  }

  // Find first non-empty row as header
  let headerRowIndex = -1;
  for (let r = 0; r < rawMatrix.length; r++) {
    const row = rawMatrix[r];
    if (Array.isArray(row) && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('No column headers could be found in the spreadsheet.');
  }

  const rawHeaders = rawMatrix[headerRowIndex].map((c) => String(c ?? '').trim());
  const headers = makeHeadersUnique(rawHeaders);

  const rows: Record<string, string>[] = [];
  for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
    const rowData = rawMatrix[r];
    if (!Array.isArray(rowData)) continue;

    // Check if entire row is blank
    const isBlank = rowData.every(
      (c) => c === null || c === undefined || String(c).trim() === ''
    );
    if (isBlank) continue;

    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      const cellValue = rowData[c];
      // Keep empty cells as clean empty strings
      rowObj[colName] =
        cellValue !== null && cellValue !== undefined ? String(cellValue).trim() : '';
    }
    rows.push(rowObj);
  }

  return {
    filename: file.name,
    headers,
    rows,
  };
}

/**
 * Auto-map headings to field labels:
 * 1. Exact match
 * 2. Case-insensitive
 * 3. Alphanumeric normalized
 * 4. Aliases (e.g. Button -> CTA, Headline -> Title)
 * 5. If NOTHING matches by name, map by column order!
 */
export function calculateAutoMappings(
  template: TextBoxTemplate[],
  headers: string[]
): AutoMappingResult {
  const mappings: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  let anyMatchedByName = false;

  for (const box of template) {
    const fieldLabel = box.fieldLabel;
    const normField = normalizeString(fieldLabel);

    // 1. Exact match
    const exact = headers.find((h) => !usedHeaders.has(h) && h === fieldLabel);
    if (exact) {
      mappings[fieldLabel] = exact;
      usedHeaders.add(exact);
      anyMatchedByName = true;
      continue;
    }

    // 2. Case-insensitive
    const caseMatch = headers.find(
      (h) => !usedHeaders.has(h) && h.toLowerCase() === fieldLabel.toLowerCase()
    );
    if (caseMatch) {
      mappings[fieldLabel] = caseMatch;
      usedHeaders.add(caseMatch);
      anyMatchedByName = true;
      continue;
    }

    // 3. Alphanumeric normalized
    const normMatch = headers.find(
      (h) => !usedHeaders.has(h) && normalizeString(h) === normField
    );
    if (normMatch) {
      mappings[fieldLabel] = normMatch;
      usedHeaders.add(normMatch);
      anyMatchedByName = true;
      continue;
    }

    // 4. Aliases
    let aliasMatch: string | undefined;
    for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
      if (normField === canonical || aliases.includes(normField)) {
        aliasMatch = headers.find(
          (h) => !usedHeaders.has(h) && aliases.includes(normalizeString(h))
        );
        if (aliasMatch) break;
      }
    }

    if (aliasMatch) {
      mappings[fieldLabel] = aliasMatch;
      usedHeaders.add(aliasMatch);
      anyMatchedByName = true;
      continue;
    }

    mappings[fieldLabel] = '';
  }

  // 5. Positional fallback: If NOTHING matched by name at all, map by column order
  if (!anyMatchedByName && headers.length > 0) {
    template.forEach((box, idx) => {
      if (idx < headers.length) {
        mappings[box.fieldLabel] = headers[idx];
        usedHeaders.add(headers[idx]);
      }
    });
  }

  const unusedHeaders = headers.filter((h) => !usedHeaders.has(h));

  return {
    mappings,
    usedHeaders,
    unusedHeaders,
    matchedByName: anyMatchedByName,
  };
}

/**
 * Apply mapped spreadsheet rows immediately to design pages:
 * Row 1 -> Design 1, Row 2 -> Design 2, etc.
 * Empty cells remain empty strings; text styles and background images are 100% preserved.
 */
export function populateDesignsFromSpreadsheet(
  pages: DesignPage[],
  rows: Record<string, string>[],
  mappings: Record<string, string>
): PopulationResult {
  const totalDesigns = pages.length;
  const totalRows = rows.length;

  if (totalDesigns === 0) {
    return {
      pages: [],
      totalDesigns: 0,
      totalRows,
      statusMessage: 'No design pages uploaded yet to populate.',
      statusType: 'empty',
      excessRowCount: totalRows,
      unfilledDesignStart: 1,
    };
  }

  const updatedPages: DesignPage[] = pages.map((page, idx) => {
    // If there is a corresponding row, update mapped fields
    if (idx < totalRows) {
      const row = rows[idx];
      const updatedValues = { ...page.values };

      for (const [fieldLabel, colName] of Object.entries(mappings)) {
        if (colName && row[colName] !== undefined) {
          // Replace with row value, or empty string if cell is empty
          updatedValues[fieldLabel] = row[colName];
        }
      }

      return {
        ...page,
        values: updatedValues,
      };
    }

    // If fewer rows than designs, leave page unchanged
    return page;
  });

  let statusMessage = `${totalDesigns} designs · ${totalRows} rows`;
  let statusType: 'exact' | 'fewer_rows' | 'more_rows' = 'exact';
  let excessRowCount = 0;
  let unfilledDesignStart = totalRows + 1;

  if (totalRows < totalDesigns) {
    statusType = 'fewer_rows';
    statusMessage = `Designs ${totalRows + 1}–${totalDesigns} have no row and were left unchanged`;
  } else if (totalRows > totalDesigns) {
    excessRowCount = totalRows - totalDesigns;
    statusType = 'more_rows';
    statusMessage = `${excessRowCount} row${excessRowCount > 1 ? 's have' : ' has'} no design`;
  }

  return {
    pages: updatedPages,
    totalDesigns,
    totalRows,
    statusMessage,
    statusType,
    excessRowCount,
    unfilledDesignStart,
  };
}
