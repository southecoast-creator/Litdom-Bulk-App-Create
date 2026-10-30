/**
 * Litdom Batch Studio - Global Font Management Engine
 * IndexedDB font storage (Blobs), real SFNT binary 'name' table family extraction,
 * dynamic FontFace API registration, previews, rename, and multi-file imports.
 */

import { StoredFontRecord, Project } from '../types';
import {
  saveFontRecord,
  getAllFontRecords,
  deleteFontRecord,
  deleteAllFonts as dbDeleteAllFonts,
} from './db';

// Cache of registered font family names in document.fonts
const loadedFontFamilies = new Set<string>();

/**
 * Curated list of Google Fonts with category and weights
 */
export interface BuiltinFontMeta {
  name: string;
  category: 'Serif' | 'Sans' | 'Display' | 'Mono' | 'Handwriting';
  weights: string[];
  googleFont: boolean;
}

export const BUILTIN_GOOGLE_FONTS: BuiltinFontMeta[] = [
  { name: 'Plus Jakarta Sans', category: 'Sans', weights: ['400', '500', '600', '700', '800'], googleFont: true },
  { name: 'Cinzel', category: 'Display', weights: ['400', '600', '700'], googleFont: true },
  { name: 'Montserrat', category: 'Sans', weights: ['400', '500', '600', '700'], googleFont: true },
  { name: 'Playfair Display', category: 'Serif', weights: ['400', '600', '700'], googleFont: true },
  { name: 'DM Sans', category: 'Sans', weights: ['400', '500', '700'], googleFont: true },
  { name: 'Outfit', category: 'Sans', weights: ['400', '500', '600', '700'], googleFont: true },
  { name: 'Manrope', category: 'Sans', weights: ['400', '500', '600', '700', '800'], googleFont: true },
  { name: 'Cormorant Garamond', category: 'Serif', weights: ['400', '600', '700'], googleFont: true },
  { name: 'Oswald', category: 'Display', weights: ['400', '500', '600', '700'], googleFont: true },
  { name: 'JetBrains Mono', category: 'Mono', weights: ['400', '500', '700'], googleFont: true },
  { name: 'Inter', category: 'Sans', weights: ['400', '500', '600', '700'], googleFont: true },
  { name: 'Roboto', category: 'Sans', weights: ['400', '500', '700'], googleFont: true },
  { name: 'Poppins', category: 'Sans', weights: ['400', '500', '600', '700'], googleFont: true },
  { name: 'Merriweather', category: 'Serif', weights: ['400', '700'], googleFont: true },
  { name: 'Lora', category: 'Serif', weights: ['400', '600', '700'], googleFont: true },
  { name: 'Bebas Neue', category: 'Display', weights: ['400'], googleFont: true },
];

/**
 * Determine font format from filename
 */
export function detectFontFormat(
  filename: string
): 'truetype' | 'opentype' | 'woff' | 'woff2' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.otf')) return 'opentype';
  if (lower.endsWith('.woff2')) return 'woff2';
  if (lower.endsWith('.woff')) return 'woff';
  return 'truetype';
}

/**
 * Clean human-readable font family name from filename as fallback
 */
export function cleanFontFamilyName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

/**
 * Extract the true Font Family Name from TrueType (.ttf) or OpenType (.otf) binary buffer
 * Reads the SFNT 'name' table (NameID 1: Font Family, NameID 16: Typographic Family)
 */
export function extractFontFamilyNameFromSFNT(
  buffer: ArrayBuffer,
  fallbackFilename: string
): string {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 12) return cleanFontFamilyName(fallbackFilename);

    // Read SFNT Version: 0x00010000 (TrueType) or 0x4F54544F ('OTTO')
    const sfntVersion = view.getUint32(0);
    const isTTF = sfntVersion === 0x00010000 || sfntVersion === 0x74727565; // 'true'
    const isOTF = sfntVersion === 0x4f54544f; // 'OTTO'

    if (!isTTF && !isOTF) {
      // Might be WOFF or WOFF2; fallback to clean filename
      return cleanFontFamilyName(fallbackFilename);
    }

    const numTables = view.getUint16(4);
    let nameTableOffset = 0;

    // Search table directory for 'name' table (0x6E616D65)
    for (let i = 0; i < numTables; i++) {
      const tableEntryOffset = 12 + i * 16;
      if (tableEntryOffset + 16 > view.byteLength) break;

      const tag = view.getUint32(tableEntryOffset);
      if (tag === 0x6e616d65) {
        // 'name' table found!
        nameTableOffset = view.getUint32(tableEntryOffset + 8);
        break;
      }
    }

    if (nameTableOffset === 0 || nameTableOffset + 6 > view.byteLength) {
      return cleanFontFamilyName(fallbackFilename);
    }

    const count = view.getUint16(nameTableOffset + 2);
    const stringOffset = nameTableOffset + view.getUint16(nameTableOffset + 4);

    let typographicFamily: string | null = null;
    let standardFamily: string | null = null;
    let fullName: string | null = null;

    for (let i = 0; i < count; i++) {
      const recordOffset = nameTableOffset + 6 + i * 12;
      if (recordOffset + 12 > view.byteLength) break;

      const platformID = view.getUint16(recordOffset);
      const nameID = view.getUint16(recordOffset + 6);
      const length = view.getUint16(recordOffset + 8);
      const offset = stringOffset + view.getUint16(recordOffset + 10);

      if (offset + length > view.byteLength) continue;

      let extractedStr = '';

      if (platformID === 3 || platformID === 0) {
        // Windows or Unicode: UTF-16BE encoding
        const chars: string[] = [];
        for (let j = 0; j < length; j += 2) {
          if (offset + j + 1 < view.byteLength) {
            chars.push(String.fromCharCode(view.getUint16(offset + j)));
          }
        }
        extractedStr = chars.join('').trim();
      } else if (platformID === 1) {
        // Mac: MacRoman (8-bit ASCII)
        const chars: string[] = [];
        for (let j = 0; j < length; j++) {
          chars.push(String.fromCharCode(view.getUint8(offset + j)));
        }
        extractedStr = chars.join('').trim();
      }

      if (!extractedStr) continue;

      // NameID 16 = Typographic Family Name (Preferred)
      if (nameID === 16 && !typographicFamily) {
        typographicFamily = extractedStr;
      }
      // NameID 1 = Standard Font Family Name
      else if (nameID === 1 && !standardFamily) {
        standardFamily = extractedStr;
      }
      // NameID 4 = Full Font Name
      else if (nameID === 4 && !fullName) {
        fullName = extractedStr;
      }
    }

    const detected = typographicFamily || standardFamily || fullName;
    if (detected && detected.length >= 2 && !/[\x00-\x08\x0E-\x1F]/.test(detected)) {
      return detected;
    }
  } catch (err) {
    console.warn('SFNT font name parsing exception:', err);
  }

  return cleanFontFamilyName(fallbackFilename);
}

/**
 * Dynamically register a font buffer into document.fonts using the FontFace API
 */
export async function registerFontFace(
  familyName: string,
  buffer: ArrayBuffer
): Promise<FontFace | null> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return null;
  }

  try {
    const fontFace = new FontFace(familyName, buffer);
    const loaded = await fontFace.load();
    document.fonts.add(loaded);
    loadedFontFamilies.add(familyName);
    return loaded;
  } catch (err) {
    console.warn(`Failed to dynamically load FontFace "${familyName}":`, err);
    return null;
  }
}

/**
 * Upload a font file (.ttf, .otf, .woff, .woff2), store as Blob in IndexedDB,
 * and dynamically load into document.fonts via FontFace API.
 */
export async function uploadAndRegisterFont(
  file: File,
  customFamilyName?: string
): Promise<StoredFontRecord> {
  const format = detectFontFormat(file.name);
  const buffer = await file.arrayBuffer();

  const realFamilyName =
    customFamilyName?.trim() ||
    extractFontFamilyNameFromSFNT(buffer, file.name);

  // Dynamically load via FontFace API
  const loadedFace = await registerFontFace(realFamilyName, buffer);
  if (!loadedFace) {
    throw new Error(
      `Could not register font "${realFamilyName}". Please ensure the file is a valid .ttf, .otf, .woff, or .woff2 font.`
    );
  }

  const record: StoredFontRecord = {
    id: `font_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    familyName: realFamilyName,
    format,
    blob: file, // Store binary Blob directly in IndexedDB
    fileName: file.name,
    fileSize: file.size,
    createdAt: Date.now(),
  };

  // Persist to IndexedDB "fonts" store
  await saveFontRecord(record);

  return record;
}

/**
 * Batch upload multiple font files at once
 */
export async function uploadMultipleFonts(
  files: FileList | File[]
): Promise<{ added: StoredFontRecord[]; errors: string[] }> {
  const added: StoredFontRecord[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const record = await uploadAndRegisterFont(file);
      added.push(record);
    } catch (err: any) {
      errors.push(`${file.name}: ${err.message || 'Failed to upload'}`);
    }
  }

  return { added, errors };
}

/**
 * Load and register all stored custom fonts from IndexedDB into document.fonts.
 * Call this on application startup and project load.
 */
export async function loadAllStoredFonts(): Promise<StoredFontRecord[]> {
  try {
    const records = await getAllFontRecords();

    for (const record of records) {
      if (!loadedFontFamilies.has(record.familyName)) {
        try {
          const buffer = await record.blob.arrayBuffer();
          await registerFontFace(record.familyName, buffer);
        } catch (err) {
          console.warn(`Could not restore font "${record.familyName}" from Blob:`, err);
        }
      }
    }

    return records;
  } catch (err) {
    console.error('Failed to load stored custom fonts:', err);
    return [];
  }
}

/**
 * Check if a font family is currently in use across any project
 */
export function isFontUsedInProjects(
  familyName: string,
  projects: Project[]
): { used: boolean; projectNames: string[] } {
  const matchingProjects = new Set<string>();

  for (const proj of projects) {
    // Check project template
    if (proj.template?.some((b) => b.fontFamily === familyName)) {
      matchingProjects.add(proj.name);
    }
    // Check individual design pages and runs
    if (proj.pages) {
      for (const page of proj.pages) {
        if (page.textBoxes?.some((b) => b.fontFamily === familyName)) {
          matchingProjects.add(proj.name);
        }
        if (page.richValues) {
          for (const runs of Object.values(page.richValues)) {
            if (runs?.some((r) => r.fontFamily === familyName)) {
              matchingProjects.add(proj.name);
            }
          }
        }
      }
    }
  }

  const projectNames = Array.from(matchingProjects);
  return {
    used: projectNames.length > 0,
    projectNames,
  };
}

/**
 * Remove a custom font from IndexedDB
 */
export async function removeCustomFont(id: string): Promise<void> {
  await deleteFontRecord(id);
}

/**
 * Delete all custom fonts
 */
export async function deleteAllCustomFonts(): Promise<void> {
  await dbDeleteAllFonts();
  loadedFontFamilies.clear();
}

/**
 * Rename a custom font
 */
export async function renameCustomFont(
  id: string,
  newFamilyName: string
): Promise<void> {
  const records = await getAllFontRecords();
  const target = records.find((r) => r.id === id);
  if (!target) throw new Error('Font not found');

  const updated: StoredFontRecord = {
    ...target,
    familyName: newFamilyName.trim(),
  };

  // Re-register with new name
  const buffer = await updated.blob.arrayBuffer();
  await registerFontFace(updated.familyName, buffer);
  await saveFontRecord(updated);
}

/**
 * Ensure a specific font family is loaded from DB or Google Fonts before rendering
 */
export async function ensureFontLoaded(familyName: string): Promise<void> {
  if (loadedFontFamilies.has(familyName)) return;

  const all = await getAllFontRecords();
  const match = all.find((f) => f.familyName === familyName);
  if (match) {
    const buffer = await match.blob.arrayBuffer();
    await registerFontFace(match.familyName, buffer);
    return;
  }

  // If built-in Google Font, trigger document.fonts.load
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.load(`16px "${familyName}"`);
      loadedFontFamilies.add(familyName);
    } catch {
      // safe fallback
    }
  }
}
