/**
 * Litdom Batch Studio - Built-in Test Projects & Data Sets
 * Creates 2 luxury Litdom background designs and test spreadsheets
 * covering all required test conditions.
 */
import * as XLSX from 'xlsx';
import { Project, PageDesign, TextBox } from '../types';

/**
 * Procedurally render a luxury Litdom background 1: Dark Obsidian with Gold Geometric Border
 */
function createBackground1DataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background obsidian
  ctx.fillStyle = '#0B0B0F';
  ctx.fillRect(0, 0, 1080, 1350);

  // Subtle radial glow
  const gradient = ctx.createRadialGradient(540, 500, 50, 540, 500, 700);
  gradient.addColorStop(0, 'rgba(212, 175, 55, 0.08)');
  gradient.addColorStop(0.5, 'rgba(23, 23, 28, 0.5)');
  gradient.addColorStop(1, '#0B0B0F');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);

  // Outer gold double frame
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 3;
  ctx.strokeRect(60, 60, 960, 1230);

  ctx.strokeStyle = 'rgba(244, 213, 141, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(76, 76, 928, 1198);

  // Corner decorative flourishes
  const corners = [
    [60, 60],
    [1020, 60],
    [60, 1290],
    [1020, 1290],
  ];
  ctx.fillStyle = '#D4AF37';
  corners.forEach(([x, y]) => {
    ctx.fillRect(x - 8, y - 8, 16, 16);
  });

  // Top header brand mark
  ctx.font = '700 24px "Cinzel", serif';
  ctx.fillStyle = '#D4AF37';
  ctx.textAlign = 'center';
  ctx.fillText('L I T D O M', 540, 160);

  // Subtle divider
  ctx.strokeStyle = '#8C7625';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(420, 185);
  ctx.lineTo(660, 185);
  ctx.stroke();

  return canvas.toDataURL('image/jpeg', 0.95);
}

/**
 * Procedurally render a luxury Litdom background 2: Architectural Card Layout
 */
function createBackground2DataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background deep charcoal obsidian
  ctx.fillStyle = '#17171C';
  ctx.fillRect(0, 0, 1080, 1350);

  // Inner card container
  ctx.fillStyle = '#0B0B0F';
  ctx.fillRect(70, 70, 940, 1210);

  // Gold accent band on top
  ctx.fillStyle = '#D4AF37';
  ctx.fillRect(70, 70, 940, 8);

  // Subtle vertical grid line
  ctx.strokeStyle = 'rgba(140, 118, 37, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(120, 160);
  ctx.lineTo(120, 1200);
  ctx.stroke();

  // Bottom footer bar
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
  ctx.beginPath();
  ctx.moveTo(120, 1180);
  ctx.lineTo(960, 1180);
  ctx.stroke();

  ctx.font = '600 18px "Space Mono", monospace';
  ctx.fillStyle = 'rgba(244, 213, 141, 0.6)';
  ctx.textAlign = 'left';
  ctx.fillText('SPECIFICATION // PAGE 02', 120, 1220);

  return canvas.toDataURL('image/jpeg', 0.95);
}

/**
 * Generate test project with two distinct design layouts
 */
export function createSampleTestProject(): Project {
  const bg1 = createBackground1DataUrl();
  const bg2 = createBackground2DataUrl();

  const page1TextBoxes: TextBox[] = [
    {
      id: 'box_p1_title',
      fieldLabel: 'TITLE',
      content: 'THE IMPERIAL EDITION',
      x: 10,
      y: 30,
      width: 80,
      height: 18,
      fontFamily: 'Cinzel',
      fontSize: 54,
      fontWeight: '700',
      fontStyle: 'normal',
      textAlign: 'center',
      color: '#D4AF37',
      lineHeight: 1.25,
      letterSpacing: 2,
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 12, offsetX: 0, offsetY: 4 },
    },
    {
      id: 'box_p1_subtitle',
      fieldLabel: 'SUBTITLE',
      content: 'A relentless pursuit of architectural refinement and tactile perfection.',
      x: 15,
      y: 52,
      width: 70,
      height: 14,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 26,
      fontWeight: '400',
      fontStyle: 'normal',
      textAlign: 'center',
      color: '#FFF8E7',
      lineHeight: 1.45,
      letterSpacing: 0,
    },
    {
      id: 'box_p1_cta',
      fieldLabel: 'CTA',
      content: 'EXPLORE THE COLLECTION',
      x: 25,
      y: 74,
      width: 50,
      height: 8,
      fontFamily: 'Montserrat',
      fontSize: 20,
      fontWeight: '600',
      fontStyle: 'normal',
      textAlign: 'center',
      color: '#0B0B0F',
      lineHeight: 1.2,
      letterSpacing: 3,
      backgroundColor: '#D4AF37',
      padding: 12,
    },
  ];

  const page2TextBoxes: TextBox[] = [
    {
      id: 'box_p2_head',
      fieldLabel: 'HEADLINE',
      content: 'ENGINEERED WITHOUT COMPROMISE',
      x: 15,
      y: 18,
      width: 75,
      height: 14,
      fontFamily: 'Playfair Display',
      fontSize: 44,
      fontWeight: '700',
      fontStyle: 'normal',
      textAlign: 'left',
      color: '#F4D58D',
      lineHeight: 1.25,
      letterSpacing: 1,
    },
    {
      id: 'box_p2_p1',
      fieldLabel: 'PARAGRAPH 1',
      content:
        'Crafted from high-tensile solid billet titanium, finished with an aerospace physical vapor deposition coating. Every component is audited across thirty-six visual tolerances.',
      x: 15,
      y: 35,
      width: 75,
      height: 22,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 22,
      fontWeight: '400',
      fontStyle: 'normal',
      textAlign: 'left',
      color: '#FFF8E7',
      lineHeight: 1.5,
      letterSpacing: 0,
    },
    {
      id: 'box_p2_p2',
      fieldLabel: 'PARAGRAPH 2',
      content:
        'Equipped with anti-reflective sapphire crystal and calibrated tactile indices.',
      x: 15,
      y: 60,
      width: 75,
      height: 18,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 20,
      fontWeight: '400',
      fontStyle: 'normal',
      textAlign: 'left',
      color: '#FFF8E7',
      lineHeight: 1.5,
      letterSpacing: 0,
    },
    {
      id: 'box_p2_footer',
      fieldLabel: 'FOOTER',
      content: 'BATCH NO. 884 // MANUFACTURED IN EUROPE // RESTRICTED RUN',
      x: 15,
      y: 82,
      width: 75,
      height: 8,
      fontFamily: 'Space Mono',
      fontSize: 16,
      fontWeight: '400',
      fontStyle: 'normal',
      textAlign: 'left',
      color: '#8C7625',
      lineHeight: 1.2,
      letterSpacing: 1,
    },
  ];

  const page1: PageDesign = {
    id: 'page_1_cover',
    pageNumber: 1,
    name: 'Cover Edition (Layout A)',
    imageUrl: bg1,
    originalWidth: 1080,
    originalHeight: 1350,
    textBoxes: page1TextBoxes,
  };

  const page2: PageDesign = {
    id: 'page_2_spec',
    pageNumber: 2,
    name: 'Technical Showcase (Layout B)',
    imageUrl: bg2,
    originalWidth: 1080,
    originalHeight: 1350,
    textBoxes: page2TextBoxes,
  };

  return {
    id: 'proj_sample_test',
    name: 'Litdom Benchmark Suite',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    defaultFontFamily: 'Plus Jakarta Sans',
    defaultColor: '#FFF8E7',
    pages: [page1, page2],
    customFonts: [],
  };
}

/**
 * Standard matching CSV test data
 */
export const SAMPLE_CSV_MATCHED = `TITLE,SUBTITLE,CTA,HEADLINE,PARAGRAPH 1,PARAGRAPH 2,FOOTER
THE GOLDEN CROWN,Forged with relentless precision for modern sovereigns,ACQUIRE NOW,ARCHITECTURAL RIGOR,An uncompromising synthesis of structural weight and optical purity.,Designed for the distinguished few.,SERIES 01 // GLOBAL EDITION
THE OBSIDIAN ARCH,Monolithic silhouettes in aerospace ceramic,VIEW SPECS,TIMELESS TACTILE PURITY,Hand-finished by master craftspeople over seventy hours of continual refinement.,Enduring resilience meets subtle gold leaf detailing.,SERIES 02 // RESTRICTED ATELIER`;

/**
 * Edge case CSV: Contains:
 * 1. Empty cells (PARAGRAPH 2 is blank in row 2)
 * 2. Excess columns (UNMAPPED_COLUMN_SKU)
 * 3. 3 rows for 2 pages (Tests more rows than pages warning)
 * 4. Extremely long text in row 2 PARAGRAPH 1 (Tests text overflow warning detection)
 */
export const SAMPLE_CSV_EDGE_CASES = `TITLE,SUBTITLE,CTA,HEADLINE,PARAGRAPH 1,PARAGRAPH 2,FOOTER,UNMAPPED_COLUMN_SKU
"THE TITANIUM MONOLITH","Engineered for extreme durability and high acoustic dampening","INQUIRE TODAY","PRECISION MACHINING","Every single millimeter of this chassis is carved from a solid block of grade 5 aerospace titanium, subjected to multi-axis CNC micro-milling, hand-deburred, and bead-blasted to achieve a surface texture that absorbs light while resisting micro-abrasions under adverse atmospheric conditions. This intentional overflow sentence is specifically provided to thoroughly test and verify that Litdom Batch Studio actively detects when paragraph text exceeds its designated bounding box!","","EDITION 09 // AUDITED",SKU-99021
"SECOND OVERFLOW TEST","Testing empty cell and excess row handling","SECURE ALLOCATION","THERMAL STABILITY","Thermal dissipation channels are drilled with laser-guided accuracy across the rear heat sink array to maintain absolute thermal equilibrium under continuous heavy loads.","","EDITION 10 // CERTIFIED",SKU-99022
"EXCESS ROW 3","This third row exceeds the two pages in the project to verify row-count warnings","EXCESS ACTION","EXCESS HEADLINE","Excess paragraph content that tests if the studio accurately warns about unpopulated excess spreadsheet rows without silent data loss.","Excess paragraph 2","EXCESS FOOTER",SKU-99023`;

/**
 * Creates a minimal test project with:
 * - One preserved background image
 * - Four labelled text boxes: TITLE, SUBTITLE, PARAGRAPH 1, CTA
 */
export function createMinimalOnePageFourBoxesProject(): Project {
  const bg = createBackground1DataUrl();

  const fourBoxes: TextBox[] = [
    {
      id: 'box_title',
      fieldLabel: 'TITLE',
      content: 'ORIGINAL TEMPLATE TITLE',
      x: 10,
      y: 24,
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
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 10, offsetX: 0, offsetY: 3 },
    },
    {
      id: 'box_subtitle',
      fieldLabel: 'SUBTITLE',
      content: 'Original subtitle awaiting spreadsheet population',
      x: 15,
      y: 42,
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
      content: 'Original paragraph 1 body text placeholder that will be replaced when spreadsheet row 1 is applied.',
      x: 15,
      y: 56,
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
      y: 78,
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
      padding: 10,
    },
  ];

  const singlePage: PageDesign = {
    id: 'page_minimal_1',
    pageNumber: 1,
    name: 'Minimal Test Design (1 Page, 4 Boxes)',
    imageUrl: bg,
    originalWidth: 1080,
    originalHeight: 1350,
    textBoxes: fourBoxes,
  };

  return {
    id: 'proj_minimal_test',
    name: 'Minimal Test: 1 Page & 4 Boxes',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    defaultFontFamily: 'Plus Jakarta Sans',
    defaultColor: '#FFF8E7',
    pages: [singlePage],
    customFonts: [],
  };
}

/**
 * Procedurally generates a real, binary Excel (.xlsx) file with 1 row:
 * Columns: TITLE, SUBTITLE, PARAGRAPH 1, CTA
 */
export function createOneRowExcelWorkbookBlob(): Blob {
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
  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([u8], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

