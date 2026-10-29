/**
 * Litdom Batch Studio - Spreadsheet Import & Mapping Engine
 * Free, client-side CSV and XLSX parser using SheetJS (xlsx)
 */
import * as XLSX from 'xlsx';
import { PageDesign, SpreadsheetRow, TextBox } from '../types';

export interface SpreadsheetParseResult {
  fileName: string;
  headers: string[];
  rows: SpreadsheetRow[];
  totalRows: number;
}

export interface MappingSuggestion {
  fieldLabel: string;
  matchedHeader: string | null;
  confidence: 'exact' | 'case-insensitive' | 'alias' | 'unmatched';
}

/**
 * Common field aliases for intelligent header-to-label matching
 */
const COMMON_ALIASES: Record<string, string[]> = {
  title: ['title', 'headline', 'header', 'heading', 'name', 'main_title', 'main title', 'main title text'],
  subtitle: ['subtitle', 'sub-title', 'sub title', 'subtext', 'sub_text', 'subhead', 'sub-heading', 'sub heading', 'tagline', 'caption'],
  'paragraph 1': ['paragraph 1', 'paragraph1', 'paragraph_1', 'p1', 'body 1', 'body1', 'body_1', 'body', 'content', 'description', 'text', 'main body'],
  'paragraph 2': ['paragraph 2', 'paragraph2', 'paragraph_2', 'p2', 'body 2', 'body2', 'body_2', 'secondary text', 'details'],
  'paragraph 3': ['paragraph 3', 'paragraph3', 'paragraph_3', 'p3', 'body 3', 'body3', 'body_3'],
  cta: ['cta', 'call to action', 'button', 'action', 'btn', 'button text', 'link', 'cta text'],
  footer: ['footer', 'footnote', 'bottom', 'copyright', 'bottom text', 'legal'],
  headline: ['headline', 'head', 'heading', 'title', 'main heading'],
};

/**
 * Parse an uploaded CSV or XLSX file client-side.
 * Preserves original column index to prevent column misalignment when headers have gaps.
 */
export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetParseResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });

  // Use the first sheet
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The spreadsheet contains no sheets.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    throw new Error('Could not read the first sheet in spreadsheet.');
  }

  // Parse to raw array of rows
  const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rawData || rawData.length === 0) {
    throw new Error('The spreadsheet appears to be empty.');
  }

  // Find the header row (first non-empty row)
  let headerRowIndex = -1;
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (Array.isArray(row) && row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== '')) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('No header row with text could be found in the spreadsheet.');
  }

  const rawHeaders = rawData[headerRowIndex];
  const headerMap: { name: string; colIdx: number }[] = [];

  rawHeaders.forEach((h: any, colIdx: number) => {
    const cleaned = String(h || '').trim();
    if (cleaned.length > 0) {
      headerMap.push({ name: cleaned, colIdx });
    }
  });

  if (headerMap.length === 0) {
    throw new Error('No valid column headers found in the first row.');
  }

  const headers = headerMap.map((item) => item.name);

  // Map subsequent rows
  const rows: SpreadsheetRow[] = [];
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const rowArray = rawData[i];
    if (!rowArray || !Array.isArray(rowArray)) continue;

    // Check if entire row is empty
    const hasContent = rowArray.some(
      (cell: any) => cell !== undefined && cell !== null && String(cell).trim() !== ''
    );
    if (!hasContent) continue;

    const rowObj: SpreadsheetRow = {};
    headerMap.forEach(({ name, colIdx }) => {
      const val = rowArray[colIdx];
      // Keep empty string if cell is blank; format numbers and booleans as strings
      rowObj[name] = val !== undefined && val !== null ? String(val).trim() : '';
    });
    rows.push(rowObj);
  }

  if (rows.length === 0) {
    throw new Error('The spreadsheet has column headers, but contains zero data rows.');
  }

  return {
    fileName: file.name,
    headers,
    rows,
    totalRows: rows.length,
  };
}

/**
 * Generate automatic mapping suggestions between design text-box field labels and spreadsheet headers.
 * Handles case-insensitivity, whitespace trimming, alphanumeric normalization, and common aliases.
 */
export function generateMappingSuggestions(
  uniqueFieldLabels: string[],
  spreadsheetHeaders: string[]
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};

  const cleanHeaderMap = new Map<string, string>();
  spreadsheetHeaders.forEach((h) => {
    cleanHeaderMap.set(h.toLowerCase().trim(), h);
  });

  uniqueFieldLabels.forEach((label) => {
    const cleanLabel = label.toLowerCase().trim();

    // 1. Exact match
    if (spreadsheetHeaders.includes(label)) {
      mapping[label] = label;
      return;
    }

    // 2. Case-insensitive / trimmed match
    if (cleanHeaderMap.has(cleanLabel)) {
      mapping[label] = cleanHeaderMap.get(cleanLabel)!;
      return;
    }

    // 3. Normalized alphanumeric match (e.g. "Paragraph 1" -> "paragraph1")
    const alphaNumericLabel = cleanLabel.replace(/[^a-z0-9]/g, '');
    let foundHeader: string | null = null;

    for (const h of spreadsheetHeaders) {
      const alphaNumericHeader = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (alphaNumericHeader === alphaNumericLabel) {
        foundHeader = h;
        break;
      }
    }

    if (foundHeader) {
      mapping[label] = foundHeader;
      return;
    }

    // 4. Common aliases match (e.g. CTA <-> Button, Headline <-> Title)
    const aliases = COMMON_ALIASES[cleanLabel];
    if (aliases) {
      for (const alias of aliases) {
        const match = spreadsheetHeaders.find((h) => h.toLowerCase().trim() === alias);
        if (match) {
          foundHeader = match;
          break;
        }
      }
    }

    mapping[label] = foundHeader;
  });

  return mapping;
}

/**
 * Populate a single page's text boxes using a specific spreadsheet row.
 * Preserves background image, positions, dimensions, fonts, colours, and styles.
 * Blank cells remain blank.
 */
export function populatePageWithRow(
  page: PageDesign,
  row: SpreadsheetRow,
  mapping: Record<string, string | null>
): {
  updatedPage: PageDesign;
  appliedCount: number;
  unmappedLabels: string[];
} {
  const updatedPage: PageDesign = JSON.parse(JSON.stringify(page));
  let appliedCount = 0;
  const unmappedLabels: string[] = [];

  updatedPage.textBoxes.forEach((box) => {
    const mappedHeader = mapping[box.fieldLabel];
    if (mappedHeader && row[mappedHeader] !== undefined) {
      // Replace text content only
      box.content = row[mappedHeader];
      appliedCount++;
    } else {
      unmappedLabels.push(box.fieldLabel);
    }
  });

  return { updatedPage, appliedCount, unmappedLabels };
}

/**
 * Populate pages with spreadsheet rows
 * - Mode 'batch': Row 1 -> Page 1, Row 2 -> Page 2, etc.
 * - Mode 'single': Selected row -> Selected page
 * - Empty cells remain empty (never borrow from other rows)
 * - Preserves all box styling (positions, dimensions, fonts, colors, effects)
 */
export function populatePagesWithSpreadsheetData(
  pages: PageDesign[],
  rows: SpreadsheetRow[],
  mapping: Record<string, string | null>,
  options?: {
    mode?: 'batch' | 'singlePage';
    selectedRowIndex?: number;
    targetPageIndex?: number;
  }
): {
  updatedPages: PageDesign[];
  populatedCount: number;
  unpopulatedPageNumbers: number[];
  excessRowCount: number;
} {
  const updatedPages: PageDesign[] = JSON.parse(JSON.stringify(pages));

  if (options?.mode === 'singlePage') {
    const targetIdx = options.targetPageIndex !== undefined ? options.targetPageIndex : 0;
    const rowIdx = options.selectedRowIndex !== undefined ? options.selectedRowIndex : 0;
    const targetPage = updatedPages[targetIdx];
    const targetRow = rows[rowIdx];

    if (targetPage && targetRow) {
      const { updatedPage } = populatePageWithRow(targetPage, targetRow, mapping);
      updatedPages[targetIdx] = updatedPage;
      return {
        updatedPages,
        populatedCount: 1,
        unpopulatedPageNumbers: [],
        excessRowCount: Math.max(0, rows.length - 1),
      };
    }
  }

  // Default: Batch Row 1 -> Page 1, Row 2 -> Page 2, ...
  const totalPages = updatedPages.length;
  const totalRows = rows.length;
  const populatedCount = Math.min(totalPages, totalRows);
  const unpopulatedPageNumbers: number[] = [];

  if (totalRows < totalPages) {
    for (let i = totalRows; i < totalPages; i++) {
      unpopulatedPageNumbers.push(updatedPages[i].pageNumber);
    }
  }

  const excessRowCount = Math.max(0, totalRows - totalPages);

  for (let i = 0; i < populatedCount; i++) {
    const page = updatedPages[i];
    const row = rows[i];

    page.textBoxes.forEach((box) => {
      const mappedHeader = mapping[box.fieldLabel];
      if (mappedHeader && row[mappedHeader] !== undefined) {
        // Set text from column (preserving empty string if blank)
        box.content = row[mappedHeader];
      }
    });
  }

  return {
    updatedPages,
    populatedCount,
    unpopulatedPageNumbers,
    excessRowCount,
  };
}
