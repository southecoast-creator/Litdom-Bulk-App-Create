/**
 * Litdom Batch Studio - Core Types
 * Shared Template Model: One shared template of text boxes per project,
 * scaled to each image from a 1000px baseline.
 */

export interface TextBoxTemplate {
  id: string;
  fieldLabel: string; // e.g. "Title", "Subtitle", "Paragraph 1", "CTA"
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  width: number; // percentage 0 - 100
  height: number; // percentage 0 - 100
  fontFamily: string;
  fontSize: number; // stored for a 1000px-wide baseline
  fontWeight: '400' | '500' | '600' | '700' | '800';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  color: string;
  lineHeight: number;
  letterSpacing: number;
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
}

export interface DesignPage {
  id: string;
  imageId: string; // Key in IndexedDB "images" store
  name: string;
  width: number; // original pixel width
  height: number; // original pixel height
  values: Record<string, string>; // fieldLabel -> text value
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
  thumbnailBlob: Blob;
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


