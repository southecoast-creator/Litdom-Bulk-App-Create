/**
 * Unit Test Suite for Litdom Batch Studio Core Engine
 * Tests spreadsheet mapping, row-to-page population, empty cell preservation,
 * and the 1-page 4-box Excel workbook workflow.
 */
import * as XLSX from 'xlsx';
import {
  generateMappingSuggestions,
  populatePagesWithSpreadsheetData,
  parseSpreadsheetFile,
} from '../src/utils/spreadsheet';
import { PageDesign, TextBox } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

console.log('--- LITDOM BATCH STUDIO CORE ENGINE TESTS ---');

// Test 1: Header Mapping Normalization & Fuzzy Match
{
  const fieldLabels = ['TITLE', 'SUBTITLE', 'PARAGRAPH 1', 'CTA'];
  const spreadsheetHeaders = ['title', ' SubTitle ', 'Paragraph 1', 'UNMAPPED_COL'];

  const mapping = generateMappingSuggestions(fieldLabels, spreadsheetHeaders);
  assert(mapping['TITLE'] === 'title', 'Maps lowercase "title" to "TITLE"');
  assert(mapping['SUBTITLE'] === ' SubTitle ', 'Maps trimmed " SubTitle " to "SUBTITLE"');
  assert(mapping['PARAGRAPH 1'] === 'Paragraph 1', 'Maps "Paragraph 1" to "PARAGRAPH 1"');
  assert(mapping['CTA'] === null, 'Leaves missing "CTA" as null');
}

// Test 2: Row-to-Page Population & Empty Cell Integrity
{
  const dummyPage1: PageDesign = {
    id: 'p1',
    pageNumber: 1,
    name: 'Cover',
    imageUrl: 'data:image/png;base64,sample',
    originalWidth: 1080,
    originalHeight: 1350,
    textBoxes: [
      {
        id: 'b1',
        fieldLabel: 'TITLE',
        content: 'Original Title 1',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 32,
        fontWeight: '700',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#D4AF37',
        lineHeight: 1.3,
        letterSpacing: 0,
      },
      {
        id: 'b2',
        fieldLabel: 'PARAGRAPH 1',
        content: 'Original Paragraph 1',
        x: 10,
        y: 40,
        width: 80,
        height: 20,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 20,
        fontWeight: '400',
        fontStyle: 'normal',
        textAlign: 'left',
        color: '#FFF8E7',
        lineHeight: 1.4,
        letterSpacing: 0,
      },
    ],
  };

  const dummyPage2: PageDesign = {
    id: 'p2',
    pageNumber: 2,
    name: 'Spec',
    imageUrl: 'data:image/png;base64,sample',
    originalWidth: 1080,
    originalHeight: 1350,
    textBoxes: [
      {
        id: 'b3',
        fieldLabel: 'TITLE',
        content: 'Original Title 2',
        x: 10,
        y: 20,
        width: 80,
        height: 15,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 32,
        fontWeight: '700',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#D4AF37',
        lineHeight: 1.3,
        letterSpacing: 0,
      },
      {
        id: 'b4',
        fieldLabel: 'PARAGRAPH 1',
        content: 'Original Paragraph 2',
        x: 10,
        y: 40,
        width: 80,
        height: 20,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 20,
        fontWeight: '400',
        fontStyle: 'normal',
        textAlign: 'left',
        color: '#FFF8E7',
        lineHeight: 1.4,
        letterSpacing: 0,
      },
    ],
  };

  const rows = [
    { TITLE: 'New Sovereign Title', 'PARAGRAPH 1': 'New Body Text for Page 1' },
    { TITLE: 'Second Page Title', 'PARAGRAPH 1': '' }, // Empty cell test
  ];

  const mapping = {
    TITLE: 'TITLE',
    'PARAGRAPH 1': 'PARAGRAPH 1',
  };

  const result = populatePagesWithSpreadsheetData([dummyPage1, dummyPage2], rows, mapping);

  assert(result.populatedCount === 2, 'Populated exactly 2 pages');
  assert(result.updatedPages[0].textBoxes[0].content === 'New Sovereign Title', 'Row 1 populates Page 1 TITLE');
  assert(result.updatedPages[0].textBoxes[1].content === 'New Body Text for Page 1', 'Row 1 populates Page 1 PARAGRAPH 1');
  assert(result.updatedPages[1].textBoxes[0].content === 'Second Page Title', 'Row 2 populates Page 2 TITLE');
  assert(
    result.updatedPages[1].textBoxes[1].content === '',
    'Empty cell remains strictly empty and DOES NOT borrow or carry over text from row 1'
  );
  assert(
    result.updatedPages[0].textBoxes[0].color === '#D4AF37',
    'Text-box styling (color, font, position) is 100% preserved during text population'
  );
}

// Test 3: Discrepancy handling (Fewer rows than pages)
{
  const pages = [
    { pageNumber: 1, textBoxes: [] },
    { pageNumber: 2, textBoxes: [] },
    { pageNumber: 3, textBoxes: [] },
  ] as any;
  const rows = [{ TITLE: 'Row 1' }];
  const mapping = { TITLE: 'TITLE' };

  const result = populatePagesWithSpreadsheetData(pages, rows, mapping);
  assert(result.populatedCount === 1, 'Only 1 page populated when 1 row is given');
  assert(
    result.unpopulatedPageNumbers.length === 2 &&
      result.unpopulatedPageNumbers[0] === 2 &&
      result.unpopulatedPageNumbers[1] === 3,
    'Identifies unpopulated pages (Pages 2 and 3) cleanly'
  );
}

// Test 4: Discrepancy handling (More rows than pages)
{
  const pages = [{ pageNumber: 1, textBoxes: [] }] as any;
  const rows = [{ TITLE: 'Row 1' }, { TITLE: 'Row 2' }, { TITLE: 'Row 3' }];
  const mapping = { TITLE: 'TITLE' };

  const result = populatePagesWithSpreadsheetData(pages, rows, mapping);
  assert(result.populatedCount === 1, 'Populates 1 page');
  assert(result.excessRowCount === 2, 'Reports exactly 2 excess rows without silent corruption');
}

// Test 5: MINIMAL END-TO-END TEST: 1 Background Image, 4 Labelled Text Boxes, 1-Row Excel Workbook (.xlsx)
async function testMinimalOnePageFourBoxesExcelWorkflow() {
  console.log('\n--- TEST 5: 1-PAGE 4-BOXES 1-ROW EXCEL (.XLSX) POPULATION ---');

  // Step 1: Create a design page with 1 background image and 4 labelled boxes
  const pageWithFourBoxes: PageDesign = {
    id: 'test_page_1',
    pageNumber: 1,
    name: 'Minimal Test Design',
    imageUrl: 'data:image/png;base64,preserved_background_image_hash',
    originalWidth: 1080,
    originalHeight: 1350,
    textBoxes: [
      {
        id: 'box_title',
        fieldLabel: 'TITLE',
        content: 'Original Template Title',
        x: 10,
        y: 22,
        width: 80,
        height: 14,
        fontFamily: 'Cinzel',
        fontSize: 50,
        fontWeight: '700',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#D4AF37',
        lineHeight: 1.25,
        letterSpacing: 2,
      },
      {
        id: 'box_subtitle',
        fieldLabel: 'SUBTITLE',
        content: 'Original Subtitle Placeholder',
        x: 15,
        y: 39,
        width: 70,
        height: 10,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 26,
        fontWeight: '500',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#FFF8E7',
        lineHeight: 1.4,
        letterSpacing: 0,
      },
      {
        id: 'box_paragraph1',
        fieldLabel: 'PARAGRAPH 1',
        content: 'Original paragraph 1 text placeholder.',
        x: 15,
        y: 52,
        width: 70,
        height: 18,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 22,
        fontWeight: '400',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#F4D58D',
        lineHeight: 1.5,
        letterSpacing: 0,
      },
      {
        id: 'box_cta',
        fieldLabel: 'CTA',
        content: 'ORIGINAL BUTTON',
        x: 25,
        y: 76,
        width: 50,
        height: 8,
        fontFamily: 'Montserrat',
        fontSize: 20,
        fontWeight: '700',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#0B0B0F',
        lineHeight: 1.2,
        letterSpacing: 2,
        backgroundColor: '#D4AF37',
      },
    ],
  };

  // Step 2: Create a real, binary Excel (.xlsx) workbook with 1 row using SheetJS
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['TITLE', 'SUBTITLE', 'PARAGRAPH 1', 'CTA'],
    [
      'APEX SOVEREIGN EDITION',
      'Precision Engineered Mechanical Distinction',
      'Hand-finished titanium chassis calibrated to micron tolerances with sapphire crystal.',
      'ACQUIRE ALLOCATION',
    ],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'CatalogData');
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Wrap into a File-like object with arrayBuffer()
  const mockFile = {
    name: 'test_catalog_1row.xlsx',
    arrayBuffer: async () => xlsxBuffer.buffer.slice(xlsxBuffer.byteOffset, xlsxBuffer.byteOffset + xlsxBuffer.byteLength),
  } as unknown as File;

  // Step 3: Parse the spreadsheet file
  const parseResult = await parseSpreadsheetFile(mockFile);
  assert(parseResult.headers.length === 4, 'Detected exactly 4 column headers');
  assert(parseResult.rows.length === 1, 'Detected exactly 1 data row');

  // Step 4: Generate column mapping for the 4 text boxes
  const labels = pageWithFourBoxes.textBoxes.map((b) => b.fieldLabel);
  const mapping = generateMappingSuggestions(labels, parseResult.headers);

  assert(mapping['TITLE'] === 'TITLE', 'TITLE maps to TITLE');
  assert(mapping['SUBTITLE'] === 'SUBTITLE', 'SUBTITLE maps to SUBTITLE');
  assert(mapping['PARAGRAPH 1'] === 'PARAGRAPH 1', 'PARAGRAPH 1 maps to PARAGRAPH 1');
  assert(mapping['CTA'] === 'CTA', 'CTA maps to CTA');

  // Step 5: Execute Population Action
  const { updatedPages } = populatePagesWithSpreadsheetData(
    [pageWithFourBoxes],
    parseResult.rows,
    mapping,
    { mode: 'singlePage', selectedRowIndex: 0, targetPageIndex: 0 }
  );

  const populatedPage = updatedPages[0];
  const bTitle = populatedPage.textBoxes.find((b) => b.fieldLabel === 'TITLE')!;
  const bSub = populatedPage.textBoxes.find((b) => b.fieldLabel === 'SUBTITLE')!;
  const bP1 = populatedPage.textBoxes.find((b) => b.fieldLabel === 'PARAGRAPH 1')!;
  const bCta = populatedPage.textBoxes.find((b) => b.fieldLabel === 'CTA')!;

  // Step 6: Verify text replacement
  assert(bTitle.content === 'APEX SOVEREIGN EDITION', 'TITLE content updated to "APEX SOVEREIGN EDITION"');
  assert(bSub.content === 'Precision Engineered Mechanical Distinction', 'SUBTITLE content updated');
  assert(
    bP1.content === 'Hand-finished titanium chassis calibrated to micron tolerances with sapphire crystal.',
    'PARAGRAPH 1 content updated'
  );
  assert(bCta.content === 'ACQUIRE ALLOCATION', 'CTA content updated to "ACQUIRE ALLOCATION"');

  // Step 7: Verify preservation of background image and all styling properties
  assert(
    populatedPage.imageUrl === pageWithFourBoxes.imageUrl,
    'Background image URL and data are 100% preserved'
  );
  assert(bTitle.color === '#D4AF37', 'TITLE color (#D4AF37) preserved');
  assert(bTitle.fontSize === 50, 'TITLE font size (50px) preserved');
  assert(bTitle.fontFamily === 'Cinzel', 'TITLE font family (Cinzel) preserved');
  assert(bCta.backgroundColor === '#D4AF37', 'CTA button background fill preserved');
  assert(bCta.color === '#0B0B0F', 'CTA button text color (#0B0B0F) preserved');

  console.log('✅ MINIMAL 1-PAGE 4-BOXES EXCEL WORKFLOW VERIFIED SUCCESSFULLY!\n');
}

testMinimalOnePageFourBoxesExcelWorkflow()
  .then(() => {
    console.log('--- ALL UNIT TESTS COMPLETED SUCCESSFULLY ---');
  })
  .catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
