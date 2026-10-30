/**
 * Litdom Batch Studio - Font Management Utility
 * Uploads custom .ttf and .otf font files, stores them as Blobs in IndexedDB,
 * and dynamically registers them via the FontFace API before canvas rendering.
 */

import { StoredFontRecord } from '../types';
import {
  saveFontRecord,
  getAllFontRecords,
  deleteFontRecord,
  getFontRecord,
} from './db';

// Cache of registered font family names in document.fonts
const loadedFontFamilies = new Set<string>();

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
 * Clean human-readable font family name from filename
 */
export function cleanFontFamilyName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
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
 * Upload a custom .ttf or .otf file, store as Blob in IndexedDB,
 * and dynamically load into document.fonts via FontFace API.
 */
export async function uploadAndRegisterFont(
  file: File,
  customFamilyName?: string
): Promise<StoredFontRecord> {
  const format = detectFontFormat(file.name);
  const familyName =
    customFamilyName?.trim() || cleanFontFamilyName(file.name);

  // Read ArrayBuffer for FontFace API
  const buffer = await file.arrayBuffer();

  // Dynamically load via FontFace API
  const loadedFace = await registerFontFace(familyName, buffer);
  if (!loadedFace) {
    throw new Error(
      `Could not register font "${familyName}". Please ensure the file is a valid .ttf or .otf font.`
    );
  }

  const record: StoredFontRecord = {
    id: `font_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    familyName,
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
 * Remove a custom font from IndexedDB
 */
export async function removeCustomFont(id: string): Promise<void> {
  await deleteFontRecord(id);
}

/**
 * Ensure a specific font family is loaded from DB before rendering
 */
export async function ensureFontLoaded(familyName: string): Promise<void> {
  if (loadedFontFamilies.has(familyName)) return;

  const all = await getAllFontRecords();
  const match = all.find((f) => f.familyName === familyName);
  if (match) {
    const buffer = await match.blob.arrayBuffer();
    await registerFontFace(match.familyName, buffer);
  }
}
