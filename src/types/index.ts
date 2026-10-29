/**
 * Litdom Batch Studio Types
 */

export interface TextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface TextStroke {
  color: string;
  width: number;
}

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export interface TextBox {
  id: string;
  fieldLabel: string; // Internal mapping identifier (e.g. TITLE, CTA, PARAGRAPH 1)
  content: string; // Visible artwork text

  // Position & Dimensions (normalized 0-100% or absolute px relative to canvas)
  x: number; // percentage (0-100) of image width
  y: number; // percentage (0-100) of image height
  width: number; // percentage (0-100) of image width
  height: number; // percentage (0-100) of image height

  // Typography
  fontFamily: string;
  fontSize: number; // in px at native background resolution
  fontWeight: string; // '400' | '500' | '600' | '700' | '800'
  fontStyle: 'normal' | 'italic';
  textAlign: TextAlignment;
  color: string; // hex or rgba
  lineHeight: number; // multiplier e.g. 1.2, 1.4
  letterSpacing: number; // px

  // Effects
  shadow?: TextShadow;
  stroke?: TextStroke;
  backgroundColor?: string; // optional background fill for the text box
  padding?: number; // px padding inside text box

  // Quality check / overflow flag
  isOverflowing?: boolean;
}

export interface PageDesign {
  id: string;
  pageNumber: number;
  name: string;
  imageUrl: string; // Blob URL or base64 data URL
  originalWidth: number;
  originalHeight: number;
  textBoxes: TextBox[];
}

export interface CustomFont {
  id: string;
  name: string;
  familyName: string;
  fileName: string;
  format: 'truetype' | 'opentype' | 'woff' | 'woff2';
  dataUrl?: string; // base64 representation for persistence
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  defaultFontFamily: string;
  defaultColor: string;
  pages: PageDesign[];
  customFonts: CustomFont[];
  lastSpreadsheetName?: string;
  spreadsheetHistory?: {
    populatedAt: number;
    rowCount: number;
    columnHeaders: string[];
    backupPagesSnapshot?: PageDesign[]; // for undo
  };
}

export type WorkflowStep =
  | 'projects'
  | 'upload'
  | 'edit'
  | 'settings'
  | 'spreadsheet'
  | 'preview'
  | 'download';

export interface SpreadsheetRow {
  [header: string]: string;
}

export interface SpreadsheetMapping {
  fieldLabel: string;
  spreadsheetColumn: string;
}

export interface ExportProgress {
  total: number;
  current: number;
  currentFileName: string;
  status: 'idle' | 'rendering' | 'zipping' | 'pdf' | 'completed' | 'error';
  errorMessage?: string;
  failedFiles?: string[];
}
