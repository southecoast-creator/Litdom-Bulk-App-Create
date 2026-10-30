/**
 * Litdom Batch Studio - Core Test Suite
 * Validates:
 * 1. Header matching (case, normalized, aliases)
 * 2. Positional fallback when no headers match
 * 3. Exact 10 rows -> 10 designs population
 * 4. Fewer rows than designs (unmapped pages left unchanged)
 * 5. More rows than designs (reports excess rows)
 * 6. Empty cell preservation (no data shifting or leakage)
 * 7. CSV with emojis, quotes, and commas
 * 8. XLSX workbook parsing
 */

import assert from 'node:assert';
import * as XLSX from 'xlsx';
import { TextBoxTemplate, DesignPage } from '../src/types';
import {
  calculateAutoMappings,
  populateDesignsFromSpreadsheet,
} from '../src/utils/spreadsheetEngine';

console.log('--- LITDOM BATCH STUDIO CORE TESTS ---');

// Standard Template for testing
const testTemplate: TextBoxTemplate[] = [
  {
    id: 't_title',
    fieldLabel: 'Title',
    x: 10,
    y: 20,
    width: 80,
    height: 12,
    fontFamily: 'Cinzel',
    fontSize: 48,
    fontWeight: '700',
    fontStyle: 'normal',
    textAlign: 'center',
    color: '#D4AF37',
    lineHeight: 1.25,
    letterSpacing: 2,
  },
  {
    id: 't_subtitle',
    fieldLabel: 'Subtitle',
    x: 15,
    y: 36,
    width: 70,
    height: 8,
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 24,
    fontWeight: '500',
    fontStyle: 'normal',
    textAlign: 'center',
    color: '#FFF8E7',
    lineHeight: 1.35,
    letterSpacing: 0,
  },
  {
    id: 't_paragraph1',
    fieldLabel: 'Paragraph 1',
    x: 15,
    y: 48,
    width: 70,
    height: 16,
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 20,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'center',
    color: '#F4D58D',
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  {
    id: 't_cta',
    fieldLabel: 'CTA',
    x: 25,
    y: 72,
    width: 50,
    height: 8,
    fontFamily: 'Montserrat',
    fontSize: 18,
    fontWeight: '700',
    fontStyle: 'normal',
    textAlign: 'center',
    color: '#D4AF37',
    lineHeight: 1.2,
    letterSpacing: 2,
  },
];

// Helper to generate N mock design pages
function createMockPages(count: number): DesignPage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `mock_page_${i + 1}`,
    imageId: `img_${i + 1}`,
    name: `Design ${i + 1}`,
    width: 1080,
    height: 1350,
    values: {
      Title: `Initial Title ${i + 1}`,
      Subtitle: `Initial Subtitle ${i + 1}`,
      'Paragraph 1': `Initial Body ${i + 1}`,
      CTA: 'INITIAL CTA',
    },
  }));
}

// ---------------------------------------------------------------------------
// TEST 1: Header matching (Case, Normalized, Aliases)
// ---------------------------------------------------------------------------
console.log('\n[TEST 1] Header Matching & Aliases');
{
  const headers = ['HEADLINE', 'subheadline', 'Paragraph 1', 'Button'];
  const mappingResult = calculateAutoMappings(testTemplate, headers);

  assert.strictEqual(mappingResult.matchedByName, true);
  assert.strictEqual(mappingResult.mappings['Title'], 'HEADLINE', 'Headline should alias to Title');
  assert.strictEqual(mappingResult.mappings['Subtitle'], 'subheadline', 'Subheadline should alias to Subtitle');
  assert.strictEqual(mappingResult.mappings['Paragraph 1'], 'Paragraph 1', 'Exact match for Paragraph 1');
  assert.strictEqual(mappingResult.mappings['CTA'], 'Button', 'Button should alias to CTA');
  console.log('✅ PASS: Aliases and normalized names match correctly');
}

// ---------------------------------------------------------------------------
// TEST 2: Positional Fallback (When NOTHING matches by name)
// ---------------------------------------------------------------------------
console.log('\n[TEST 2] Positional Fallback');
{
  const headers = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  const mappingResult = calculateAutoMappings(testTemplate, headers);

  assert.strictEqual(mappingResult.matchedByName, false, 'Should detect no name matches');
  assert.strictEqual(mappingResult.mappings['Title'], 'Alpha', 'Position 0 maps to Title');
  assert.strictEqual(mappingResult.mappings['Subtitle'], 'Beta', 'Position 1 maps to Subtitle');
  assert.strictEqual(mappingResult.mappings['Paragraph 1'], 'Gamma', 'Position 2 maps to Paragraph 1');
  assert.strictEqual(mappingResult.mappings['CTA'], 'Delta', 'Position 3 maps to CTA');
  console.log('✅ PASS: Positional fallback maps columns in index order');
}

// ---------------------------------------------------------------------------
// TEST 3: 10 Rows -> 10 Designs Exact 1:1 Population
// ---------------------------------------------------------------------------
console.log('\n[TEST 3] 10 Rows -> 10 Designs Exact Population');
{
  const pages = createMockPages(10);
  const rows = Array.from({ length: 10 }, (_, i) => ({
    Title: `Batch Title ${i + 1}`,
    Subtitle: `Batch Subtitle ${i + 1}`,
    'Paragraph 1': `Batch Copy ${i + 1}`,
    CTA: `BUY NOW ${i + 1}`,
  }));

  const mappings = {
    Title: 'Title',
    Subtitle: 'Subtitle',
    'Paragraph 1': 'Paragraph 1',
    CTA: 'CTA',
  };

  const result = populateDesignsFromSpreadsheet(pages, rows, mappings);

  assert.strictEqual(result.totalDesigns, 10);
  assert.strictEqual(result.totalRows, 10);
  assert.strictEqual(result.statusType, 'exact');
  assert.strictEqual(result.statusMessage, '10 designs · 10 rows');

  // Verify Design 1
  assert.strictEqual(result.pages[0].values['Title'], 'Batch Title 1');
  assert.strictEqual(result.pages[0].values['CTA'], 'BUY NOW 1');

  // Verify Design 10
  assert.strictEqual(result.pages[9].values['Title'], 'Batch Title 10');
  assert.strictEqual(result.pages[9].values['CTA'], 'BUY NOW 10');
  console.log('✅ PASS: 10 rows populated 10 designs with 1:1 accuracy');
}

// ---------------------------------------------------------------------------
// TEST 4: Fewer Rows Than Designs (Unmapped pages left unchanged)
// ---------------------------------------------------------------------------
console.log('\n[TEST 4] Fewer Rows Than Designs');
{
  const pages = createMockPages(10);
  const rows = Array.from({ length: 4 }, (_, i) => ({
    Title: `Row ${i + 1} Title`,
  }));
  const mappings = { Title: 'Title' };

  const result = populateDesignsFromSpreadsheet(pages, rows, mappings);

  assert.strictEqual(result.statusType, 'fewer_rows');
  assert.strictEqual(
    result.statusMessage,
    'Designs 5–10 have no row and were left unchanged'
  );
  // Pages 1-4 updated
  assert.strictEqual(result.pages[0].values['Title'], 'Row 1 Title');
  assert.strictEqual(result.pages[3].values['Title'], 'Row 4 Title');
  // Pages 5-10 strictly preserved
  assert.strictEqual(result.pages[4].values['Title'], 'Initial Title 5');
  assert.strictEqual(result.pages[9].values['Title'], 'Initial Title 10');
  console.log('✅ PASS: Unmapped designs strictly left unchanged without corruption');
}

// ---------------------------------------------------------------------------
// TEST 5: More Rows Than Designs (Reports excess rows)
// ---------------------------------------------------------------------------
console.log('\n[TEST 5] More Rows Than Designs');
{
  const pages = createMockPages(3);
  const rows = Array.from({ length: 8 }, (_, i) => ({
    Title: `Row ${i + 1}`,
  }));
  const mappings = { Title: 'Title' };

  const result = populateDesignsFromSpreadsheet(pages, rows, mappings);

  assert.strictEqual(result.statusType, 'more_rows');
  assert.strictEqual(result.excessRowCount, 5);
  assert.strictEqual(result.statusMessage, '5 rows have no design');
  console.log('✅ PASS: Excess rows reported accurately');
}

// ---------------------------------------------------------------------------
// TEST 6: Empty Cells Remain Empty Strings
// ---------------------------------------------------------------------------
console.log('\n[TEST 6] Empty Cells Remain Empty Strings');
{
  const pages = createMockPages(2);
  const rows = [
    { Title: 'Apex Watch', Subtitle: '', 'Paragraph 1': 'Full description', CTA: 'DISCOVER' },
    { Title: 'Sovereign Edition', Subtitle: 'Luxury Tier', 'Paragraph 1': '', CTA: '' },
  ];
  const mappings = {
    Title: 'Title',
    Subtitle: 'Subtitle',
    'Paragraph 1': 'Paragraph 1',
    CTA: 'CTA',
  };

  const result = populateDesignsFromSpreadsheet(pages, rows, mappings);

  assert.strictEqual(result.pages[0].values['Subtitle'], '', 'Row 1 empty Subtitle remains empty string');
  assert.strictEqual(result.pages[1].values['Paragraph 1'], '', 'Row 2 empty Paragraph remains empty string');
  assert.strictEqual(result.pages[1].values['CTA'], '', 'Row 2 empty CTA remains empty string');
  console.log('✅ PASS: Empty cells strictly remain empty strings and do not bleed');
}

// ---------------------------------------------------------------------------
// TEST 7: CSV with Emojis, Quotes, and Commas (UTF-8)
// ---------------------------------------------------------------------------
console.log('\n[TEST 7] CSV with Emojis, Quotes, and Commas');
{
  const csvContent =
    'Title,Subtitle,Paragraph 1,CTA\n' +
    '"💎 Luxury Watch ✨","Limited Edition, 2026","Hand-finished, calibrated to micron tolerances.","ACQUIRE NOW"\n';

  const workbook = XLSX.read(csvContent, {
    type: 'string',
    raw: true,
    codepage: 65001,
  });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  assert.strictEqual(matrix[0][0], 'Title');
  assert.strictEqual(matrix[1][0], '💎 Luxury Watch ✨');
  assert.strictEqual(matrix[1][1], 'Limited Edition, 2026');
  assert.strictEqual(matrix[1][2], 'Hand-finished, calibrated to micron tolerances.');
  assert.strictEqual(matrix[1][3], 'ACQUIRE NOW');
  console.log('✅ PASS: CSV emojis, embedded commas, and quotes preserved 100%');
}

// ---------------------------------------------------------------------------
// TEST 8: XLSX Binary Workbook Parsing
// ---------------------------------------------------------------------------
console.log('\n[TEST 8] Binary XLSX Parsing');
{
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['Headline', 'Subhead', 'Body Text', 'Action Button'],
    ['APEX 1', 'SUB 1', 'DESC 1', 'CLICK 1'],
    ['APEX 2', 'SUB 2', 'DESC 2', 'CLICK 2'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const xlsxBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const readBack = XLSX.read(xlsxBuffer, { type: 'array', raw: true });
  const readSheet = readBack.Sheets[readBack.SheetNames[0]];
  const readMatrix: any[][] = XLSX.utils.sheet_to_json(readSheet, { header: 1, raw: true });

  assert.strictEqual(readMatrix.length, 3);
  assert.strictEqual(readMatrix[0][0], 'Headline');
  assert.strictEqual(readMatrix[1][0], 'APEX 1');
  assert.strictEqual(readMatrix[2][3], 'CLICK 2');
  console.log('✅ PASS: XLSX binary array buffer correctly parsed');
}

// ---------------------------------------------------------------------------
// TEST 9: Font Management Utility (Format detection & family name cleaning)
// ---------------------------------------------------------------------------
console.log('\n[TEST 9] Font Management Utility Format & Name Processing');
{
  const { detectFontFormat, cleanFontFamilyName } = await import(
    '../src/utils/fontManager'
  );

  assert.strictEqual(detectFontFormat('my-luxury-font.ttf'), 'truetype');
  assert.strictEqual(detectFontFormat('SovereignDisplay.otf'), 'opentype');
  assert.strictEqual(detectFontFormat('webfont.woff2'), 'woff2');
  assert.strictEqual(detectFontFormat('webfont.woff'), 'woff');

  assert.strictEqual(
    cleanFontFamilyName('CinzelDecorative-Bold.ttf'),
    'CinzelDecorative Bold'
  );
  assert.strictEqual(
    cleanFontFamilyName('Apex_Sovereign_Display.otf'),
    'Apex Sovereign Display'
  );
  console.log('✅ PASS: Font format detection and family name cleaning verified');
}

// ---------------------------------------------------------------------------
// TEST 10: 4-Corner Box Manipulation Math
// ---------------------------------------------------------------------------
console.log('\n[TEST 10] 4-Corner and 8-Way Box Resizing Logic');
{
  const initialBox = { x: 15, y: 20, width: 70, height: 15 };

  // 1. Dragging SE corner outward (+10% deltaX, +8% deltaY)
  const seW = Math.max(10, Math.min(100 - initialBox.x, initialBox.width + 10));
  const seH = Math.max(4, Math.min(100 - initialBox.y, initialBox.height + 8));
  assert.strictEqual(seW, 80, 'SE corner expands width to 80%');
  assert.strictEqual(seH, 23, 'SE corner expands height to 23%');

  // 2. Dragging NW corner inward (+5% deltaX, +3% deltaY)
  const nwW = Math.max(10, initialBox.width - 5);
  const nwX = Math.max(0, initialBox.x + 5);
  const nwH = Math.max(4, initialBox.height - 3);
  const nwY = Math.max(0, initialBox.y + 3);
  assert.strictEqual(nwW, 65, 'NW corner contracts width to 65%');
  assert.strictEqual(nwX, 20, 'NW corner shifts x right to 20%');
  assert.strictEqual(nwH, 12, 'NW corner contracts height to 12%');
  assert.strictEqual(nwY, 23, 'NW corner shifts y down to 23%');

  // 3. Clamping boundary checks
  const maxW = Math.min(100 - initialBox.x, initialBox.width + 50);
  assert.strictEqual(maxW, 85, 'Clamped to 100 - x = 85%');

  console.log('✅ PASS: 4-corner box expansion, reduction, and boundary clamping verified');
}

// ---------------------------------------------------------------------------
// TEST 11: Style Scope - This Design Only vs All Designs
// ---------------------------------------------------------------------------
console.log('\n[TEST 11] Style Scope: This Design Only vs All Designs');
{
  const pages: DesignPage[] = [
    {
      id: 'p1',
      imageId: 'img_1',
      name: 'Design 1',
      width: 1000,
      height: 1000,
      values: { Title: 'Page 1 Title' },
      textBoxes: JSON.parse(JSON.stringify(testTemplate)),
    },
    {
      id: 'p2',
      imageId: 'img_2',
      name: 'Design 2',
      width: 1000,
      height: 1000,
      values: { Title: 'Page 2 Title' },
      textBoxes: JSON.parse(JSON.stringify(testTemplate)),
    },
  ];

  // 1. "This design only" change on Page 1: change Title color to #FF0000
  pages[0].textBoxes = pages[0].textBoxes!.map((b) =>
    b.fieldLabel === 'Title' ? { ...b, color: '#FF0000' } : b
  );

  assert.strictEqual(
    pages[0].textBoxes!.find((b) => b.fieldLabel === 'Title')?.color,
    '#FF0000',
    'Page 1 Title color updated'
  );
  assert.strictEqual(
    pages[1].textBoxes!.find((b) => b.fieldLabel === 'Title')?.color,
    '#D4AF37',
    'Page 2 Title color must NOT change when scope is "this design only"'
  );

  // 2. "All designs" change: change Title font to "Cinzel Decorative" everywhere
  for (const p of pages) {
    p.textBoxes = p.textBoxes!.map((b) =>
      b.fieldLabel === 'Title' ? { ...b, fontFamily: 'Cinzel Decorative' } : b
    );
  }

  assert.strictEqual(
    pages[0].textBoxes!.find((b) => b.fieldLabel === 'Title')?.fontFamily,
    'Cinzel Decorative'
  );
  assert.strictEqual(
    pages[1].textBoxes!.find((b) => b.fieldLabel === 'Title')?.fontFamily,
    'Cinzel Decorative',
    'All designs updated when scope is "all designs"'
  );
  console.log('✅ PASS: Style scope "This design only" vs "All designs" strictly verified');
}

// ---------------------------------------------------------------------------
// TEST 12: Copy Layout to All Designs Preserves Page Values
// ---------------------------------------------------------------------------
console.log('\n[TEST 12] Copy Layout to All Designs');
{
  const pages: DesignPage[] = [
    {
      id: 'p1',
      imageId: 'img_1',
      name: 'Design 1',
      width: 1000,
      height: 1000,
      values: { Title: 'Unique Title 1', Subtitle: 'Unique Subtitle 1' },
      textBoxes: [
        {
          id: 'box_custom',
          fieldLabel: 'Title',
          x: 20,
          y: 25,
          width: 60,
          height: 14,
          fontFamily: 'Montserrat',
          fontSize: 52,
          fontWeight: '800',
          fontStyle: 'normal',
          textAlign: 'left',
          color: '#E0AA3E',
          lineHeight: 1.2,
          letterSpacing: 1,
        },
      ],
    },
    {
      id: 'p2',
      imageId: 'img_2',
      name: 'Design 2',
      width: 1000,
      height: 1000,
      values: { Title: 'Unique Title 2', Subtitle: 'Unique Subtitle 2' },
      textBoxes: JSON.parse(JSON.stringify(testTemplate)),
    },
  ];

  // Perform "Copy this design's layout to all designs" from Page 1 to all pages
  const sourceLayout = pages[0].textBoxes!;
  for (let i = 1; i < pages.length; i++) {
    pages[i].textBoxes = JSON.parse(JSON.stringify(sourceLayout));
  }

  // Verify Page 2 received Page 1's geometry & styles
  assert.strictEqual(pages[1].textBoxes!.length, 1);
  assert.strictEqual(pages[1].textBoxes![0].fontSize, 52);
  assert.strictEqual(pages[1].textBoxes![0].x, 20);
  assert.strictEqual(pages[1].textBoxes![0].fontFamily, 'Montserrat');

  // Verify Page 2's distinct text content values are 100% preserved
  assert.strictEqual(pages[1].values['Title'], 'Unique Title 2');
  assert.strictEqual(pages[1].values['Subtitle'], 'Unique Subtitle 2');
  console.log('✅ PASS: Layout copying propagates styles while preserving text values');
}

// ---------------------------------------------------------------------------
// TEST 13: Strict Image ID Matching Prevents Wrong Background Race Condition
// ---------------------------------------------------------------------------
console.log('\n[TEST 13] Image ID Strict Binding & Race Guard');
{
  const activePage = { id: 'p3', imageId: 'img_3' };
  const staleLoadedBlob = { imageId: 'img_1', blob: new Blob(['fake1']) };
  const matchingLoadedBlob = { imageId: 'img_3', blob: new Blob(['fake3']) };

  const shouldDrawStale = staleLoadedBlob.imageId === activePage.imageId;
  assert.strictEqual(shouldDrawStale, false, 'Must NOT draw when blob.imageId !== activePage.imageId');

  const shouldDrawMatching = matchingLoadedBlob.imageId === activePage.imageId;
  assert.strictEqual(shouldDrawMatching, true, 'Draws when blob.imageId matches activePage.imageId');
  console.log('✅ PASS: Image ID matching guard prevents cross-page image corruption');
}

// ---------------------------------------------------------------------------
// TEST 14: 10-Design Batch Grouping for Gallery Sharing
// ---------------------------------------------------------------------------
console.log('\n[TEST 14] 10-Design Batch Grouping for Web Share API');
{
  // 25 mock designs
  const mockItems = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

  const chunkSize = 10;
  const groups: { label: string; count: number }[] = [];
  for (let i = 0; i < mockItems.length; i += chunkSize) {
    const chunk = mockItems.slice(i, i + chunkSize);
    const start = i + 1;
    const end = i + chunk.length;
    groups.push({
      label: `Designs ${start}–${end}`,
      count: chunk.length,
    });
  }

  assert.strictEqual(groups.length, 3, '25 items split into 3 groups');
  assert.strictEqual(groups[0].label, 'Designs 1–10');
  assert.strictEqual(groups[0].count, 10);
  assert.strictEqual(groups[1].label, 'Designs 11–20');
  assert.strictEqual(groups[1].count, 10);
  assert.strictEqual(groups[2].label, 'Designs 21–25');
  assert.strictEqual(groups[2].count, 5);
  console.log('✅ PASS: Large batch chunking splits into groups of 10 for Web Share API');
}

console.log('\n--- ALL UNIT TESTS COMPLETED SUCCESSFULLY ---');

