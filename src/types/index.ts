/**
 * Litdom Batch Studio - Core Types
 * Shared Template Model: One shared template of text boxes per project,
 * scaled to each image from a 1000px baseline.
 */

export interface TextRunEffect {
  shadow?: {
    enabled?: boolean;
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  outline?: {
    enabled?: boolean;
    color: string;
    width: number;
  };
  glow?: {
    enabled?: boolean;
    color: string;
    strength: number; // drawn as blurred glow shadow
  };
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
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



