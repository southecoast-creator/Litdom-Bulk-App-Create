/**
 * Litdom Batch Studio - Core Types
 * Shared Template Model: One shared template of text boxes per project,
 * scaled to each image from a 1000px baseline.
 */

export interface EffectItemSettings {
  enabled?: boolean;
  intensity?: number; // 0 - 100
  color?: string;
  color2?: string;
  color3?: string;
  angle?: number; // 0 - 360
  blur?: number; // 0 - 50
  opacity?: number; // 0 - 100
  spread?: number; // 0 - 100
  offsetX?: number;
  offsetY?: number;
  width?: number;
  strength?: number;
  strokeWidth?: number;
  strokeColor?: string;
}

export interface TextRunEffect {
  [key: string]: any;
  shadow?: EffectItemSettings;
  outline?: EffectItemSettings;
  glow?: EffectItemSettings;
  // Standard Canva/Adobe style effects
  lift?: EffectItemSettings;
  hardShadow?: EffectItemSettings;
  hollow?: EffectItemSettings;
  neon?: EffectItemSettings;
  echo?: EffectItemSettings;
  splice?: EffectItemSettings;
  highlight?: EffectItemSettings;
  gradient?: EffectItemSettings;
  glitch?: EffectItemSettings;
  extrude?: EffectItemSettings;
  pill?: EffectItemSettings;
  // Group A: Textures
  chalk?: EffectItemSettings;
  ink?: EffectItemSettings;
  fabric?: EffectItemSettings;
  // Group B: Artistic
  chromatic?: EffectItemSettings;
  halftone?: EffectItemSettings;
  stencil?: EffectItemSettings;
  doubleExposure?: EffectItemSettings;
  wavy?: EffectItemSettings;
  // Group C: Liquid
  droplets?: EffectItemSettings;
  liquid?: EffectItemSettings;
  melting?: EffectItemSettings;
  dripping?: EffectItemSettings;
}

export interface TextGradientSettings {
  enabled?: boolean;
  color?: string; // Stop 1 (default #22C55E)
  color2?: string; // Stop 2 (default #FACC15)
  color3?: string; // Stop 3 (default #3B82F6)
  angle?: number; // 0 - 360 (default 90)
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  gradient?: TextGradientSettings;
  fontFamily?: string;
  fontSize?: number; // stored for a 1000px-wide baseline
  letterSpacing?: number;
  effects?: TextRunEffect;
}

export interface TextBoxTemplate {
  id: string;
  fieldLabel: string; // e.g. "Title", "Subtitle", "Paragraph 1", "CTA"
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  width: number; // percentage 0 - 100
  height?: number; // automatic computed height (kept optional for legacy records)
  fontFamily: string;
  fontSize: number; // stored for a 1000px-wide baseline
  fontWeight: '400' | '500' | '600' | '700' | '800';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  color: string;
  gradient?: TextGradientSettings;
  lineHeight?: number;
  letterSpacing?: number;
  textCase?: 'lowercase' | 'uppercase' | 'title' | 'none';
  padding?: number;
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  stroke?: {
    color: string;
    width: number;
  };
  fill?: {
    color: string;
    opacity: number;
  };
  effects?: TextRunEffect;
  elementType?: 'text' | 'shape' | 'table' | 'line' | 'image_overlay';
  shapeType?: 'rectangle' | 'square' | 'circle' | 'triangle' | 'star';
  rotation?: number; // 0 - 360 degrees
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  imageOverlayId?: string;
  tableRows?: number;
  tableCols?: number;
  tableData?: string[][];
}

export interface DesignPage {
  id: string;
  imageId: string; // Key in IndexedDB "images" store
  name: string;
  width: number; // original pixel width
  height: number; // original pixel height
  values: Record<string, string>; // fieldLabel -> plain text value
  richValues?: Record<string, TextRun[]>; // fieldLabel -> rich text runs
  textBoxes?: TextBoxTemplate[]; // Per-design text boxes (geometry & styles)
}

export interface CustomFont {
  id: string;
  familyName: string;
  format: 'truetype' | 'opentype' | 'woff' | 'woff2';
  dataUrl?: string; // or stored in font store
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  template: TextBoxTemplate[];
  pages: DesignPage[];
  lastSpreadsheet?: {
    filename: string;
    headers: string[];
    rows: Record<string, string>[];
    mappings: Record<string, string>; // fieldLabel -> spreadsheet column
  };
  customFonts?: CustomFont[];
}

export interface StoredImageRecord {
  id: string;
  originalBlob: Blob;
  previewBlob?: Blob; // ~1200px wide preview for high-speed editing
  thumbnailBlob: Blob; // ~240px thumbnail
  mimeType: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface StoredFontRecord {
  id: string;
  familyName: string;
  format: 'truetype' | 'opentype' | 'woff' | 'woff2';
  blob: Blob;
  fileName: string;
  fileSize: number;
  createdAt: number;
}

export interface StorageBreakdown {
  designsBytes: number;
  fontsBytes: number;
  projectsBytes: number;
  totalBytes: number;
  projectSizes: Record<string, number>;
}

export interface SavedTemplate {
  id: string;
  name: string;
  createdAt: number;
  imageId: string;
  width: number;
  height: number;
  template: TextBoxTemplate[];
}

export const DOCX_STANDARD_STYLES = [
  'Title',
  'Subtitle',
  'Heading 1',
  'Heading 2',
  'Heading 3',
  'Heading 4',
  'Heading 5',
  'Heading 6',
  'Heading 7',
  'Heading 8',
  'Heading 9',
  'Normal Text',
  'Quote',
  'Intense Quote',
  'Block Text',
  'Body Text',
  'Body Text 2',
  'Body Text 3',
  'Body Text First Indent',
  'Body Text Indent',
  'Caption',
  'Book Title',
  'List Paragraph',
  'List Number',
  'List Bullet',
  'Note Heading',
  'Plain Text',
] as const;

export type DocxStyleCategory = (typeof DOCX_STANDARD_STYLES)[number] | string;

export interface DocxBlock {
  style: DocxStyleCategory;
  text: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
}

export interface DocxPageScan {
  pageNumber: number;
  blocks: DocxBlock[];
  occurrences: Record<string, string[]>; // style -> array of consecutive grouped text blocks
}

export interface DocxScanResult {
  filename: string;
  pages: DocxPageScan[];
  detectedStyles: string[];
  maxOccurrences: Record<string, number>;
  generatedColumns: string[];
  spreadsheetData: Record<string, string>[];
}

export type DocxWorkflowStage =
  | 'idle'
  | 'scanning'
  | 'scanned'
  | 'templates_needed'
  | 'revised_sheet_needed'
  | 'validating'
  | 'placeholders_ready'
  | 'populated';

export interface PdfExportSettings {
  colorMode: 'digital' | 'rgb' | 'cmyk';
  flatten: boolean;
  cropMarksAndBleed: boolean;
}

export interface FontCombination {
  id: string;
  name: string;
  headingFont: string;
  bodyFont: string;
  accentFont?: string;
  description: string;
}



