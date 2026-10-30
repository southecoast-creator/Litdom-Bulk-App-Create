/**
 * Litdom Batch Studio - IndexedDB Storage Engine
 * High-reliability database storing lightweight projects in "projects" store
 * and binary Blobs in "images" store (with ~220px thumbnails).
 * Reuses a single connection, handles automatic reconnects, and migrates legacy formats.
 */

import { Project, TextBoxTemplate, DesignPage, StoredImageRecord, StoredFontRecord } from '../types';

const DB_NAME = 'litdom_batch_studio_v2';
const DB_VERSION = 2;
const STORE_PROJECTS = 'projects';
const STORE_IMAGES = 'images';
const STORE_FONTS = 'fonts';

let dbInstance: IDBDatabase | null = null;
let dbConnectingPromise: Promise<IDBDatabase> | null = null;

// Global Object URL Registry for runtime memory hygiene
const activeObjectUrls = new Set<string>();

export function createManagedObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  activeObjectUrls.add(url);
  return url;
}

export function revokeManagedObjectUrl(url: string): void {
  if (url && activeObjectUrls.has(url)) {
    URL.revokeObjectURL(url);
    activeObjectUrls.delete(url);
  }
}

export function revokeAllManagedObjectUrls(): void {
  for (const url of activeObjectUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // safe fallback
    }
  }
  activeObjectUrls.clear();
}

/**
 * Persist storage request to avoid aggressive browser eviction
 */
export async function ensureStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Open and reuse single IndexedDB connection
 */
export function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }
  if (dbConnectingPromise) {
    return dbConnectingPromise;
  }

  dbConnectingPromise = new Promise((resolve, reject) => {
    ensureStoragePersistence();

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FONTS)) {
        db.createObjectStore(STORE_FONTS, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      dbConnectingPromise = null;

      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };

      dbInstance.onclose = () => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      dbConnectingPromise = null;
      reject(new Error('Unable to access local browser database. Please check browser permissions.'));
    };
  });

  return dbConnectingPromise;
}

export function createDefaultTemplate(): TextBoxTemplate[] {
  return [
    {
      id: 'template_title',
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
      id: 'template_subtitle',
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
      id: 'template_paragraph1',
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
      id: 'template_cta',
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
}

/**
 * Generate a ~220px JPEG thumbnail Blob from an Image/Blob
 */
export async function createThumbnailBlob(
  source: Blob | HTMLImageElement,
  maxDimension = 240
): Promise<Blob> {
  let img: HTMLImageElement;
  let shouldRevoke = false;

  if (source instanceof Blob) {
    img = new Image();
    const url = URL.createObjectURL(source);
    shouldRevoke = true;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image for thumbnail'));
      img.src = url;
    });
    URL.revokeObjectURL(url);
  } else {
    img = source;
  }

  const canvas = document.createElement('canvas');
  const srcW = img.naturalWidth || img.width || 1000;
  const srcH = img.naturalHeight || img.height || 1000;

  const ratio = srcW / srcH;
  let dstW = maxDimension;
  let dstH = Math.round(maxDimension / ratio);

  if (srcH > srcW) {
    dstH = maxDimension;
    dstW = Math.round(maxDimension * ratio);
  }

  canvas.width = Math.max(1, dstW);
  canvas.height = Math.max(1, dstH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas 2d context for thumbnail');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Thumbnail generation failed'));
      },
      'image/jpeg',
      0.82
    );
  });
}

/**
 * Save an uploaded design image into the "images" store as Blobs (original + ~220px thumbnail)
 */
export async function storeImageFile(
  fileOrBlob: File | Blob
): Promise<{ imageId: string; width: number; height: number; thumbnailBlob: Blob }> {
  const db = await getDB();
  const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Determine width and height
  const img = new Image();
  const tempUrl = URL.createObjectURL(fileOrBlob);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not read image file'));
    img.src = tempUrl;
  });
  URL.revokeObjectURL(tempUrl);

  const width = img.naturalWidth || 1000;
  const height = img.naturalHeight || 1000;
  const thumbnailBlob = await createThumbnailBlob(img, 240);

  const record: StoredImageRecord = {
    id: imageId,
    originalBlob: fileOrBlob,
    thumbnailBlob,
    mimeType: fileOrBlob.type || 'image/png',
    width,
    height,
    createdAt: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error('Could not save design background image to storage.'));
  });

  return { imageId, width, height, thumbnailBlob };
}

export async function getImageRecord(imageId: string): Promise<StoredImageRecord | null> {
  const db = await getDB();
  return new Promise<StoredImageRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.get(imageId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error('Could not retrieve image from storage.'));
  });
}

export async function getThumbnailBlob(imageId: string): Promise<Blob | null> {
  const record = await getImageRecord(imageId);
  return record ? record.thumbnailBlob : null;
}

export async function getOriginalImageBlob(imageId: string): Promise<Blob | null> {
  const record = await getImageRecord(imageId);
  return record ? record.originalBlob : null;
}

export async function deleteImages(imageIds: string[]): Promise<void> {
  if (!imageIds.length) return;
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    for (const id of imageIds) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Failed to clean up unused image assets.'));
  });
}

/**
 * Migration helper: converts base64 data URLs to Blobs and saves to "images" store
 */
async function base64ToBlob(base64DataUrl: string): Promise<Blob> {
  const res = await fetch(base64DataUrl);
  return await res.blob();
}

/**
 * Migrate legacy projects into the new shared-template format
 */
export async function migrateLegacyProject(rawProject: any): Promise<Project> {
  let template: TextBoxTemplate[] = Array.isArray(rawProject.template) && rawProject.template.length > 0
    ? rawProject.template
    : [];

  const legacyPages: any[] = rawProject.pages || [];

  // Extract shared template from the first page that has textBoxes if template was empty
  if (template.length === 0) {
    for (const page of legacyPages) {
      if (page.textBoxes && Array.isArray(page.textBoxes) && page.textBoxes.length > 0) {
        const pageW = page.originalWidth || page.width || 1000;
        template = page.textBoxes.map((b: any, idx: number) => {
          const scaleTo1000 = 1000 / pageW;
          const baselineFontSize = Math.round((b.fontSize || 36) * scaleTo1000);
          return {
            id: b.id || `tpl_box_${idx}`,
            fieldLabel: b.fieldLabel || `Field ${idx + 1}`,
            x: typeof b.x === 'number' ? b.x : 10,
            y: typeof b.y === 'number' ? b.y : 10 + idx * 15,
            width: typeof b.width === 'number' ? b.width : 80,
            height: typeof b.height === 'number' ? b.height : 12,
            fontFamily: b.fontFamily || 'Plus Jakarta Sans',
            fontSize: baselineFontSize,
            fontWeight: b.fontWeight || '600',
            fontStyle: b.fontStyle || 'normal',
            textAlign: b.textAlign || 'center',
            color: b.color || '#FFF8E7',
            lineHeight: b.lineHeight || 1.3,
            letterSpacing: b.letterSpacing || 0,
            shadow: b.shadow,
            stroke: b.stroke,
            fill: b.fill,
          };
        });
        break;
      }
    }
  }

  if (template.length === 0) {
    template = createDefaultTemplate();
  }

  // Check if project is already completely modern and clean
  const isAlreadyModern =
    Array.isArray(rawProject.template) &&
    rawProject.template.length > 0 &&
    rawProject.pages &&
    Array.isArray(rawProject.pages) &&
    rawProject.pages.every(
      (p: any) =>
        p.imageId &&
        p.values &&
        Array.isArray(p.textBoxes) &&
        p.textBoxes.length > 0
    );

  if (isAlreadyModern) {
    return rawProject as Project;
  }

  // Migrate pages and extract images into Blobs, ensuring each page has its own textBoxes
  const newPages: DesignPage[] = [];

  for (let i = 0; i < legacyPages.length; i++) {
    const lp = legacyPages[i];
    let imageId = lp.imageId;

    if (!imageId) {
      const base64Src = lp.originalUrl || lp.dataUrl || lp.backgroundImage;
      if (base64Src && typeof base64Src === 'string' && base64Src.startsWith('data:')) {
        try {
          const blob = await base64ToBlob(base64Src);
          const stored = await storeImageFile(blob);
          imageId = stored.imageId;
        } catch {
          imageId = `missing_${i}`;
        }
      } else {
        imageId = `img_legacy_${Date.now()}_${i}`;
      }
    }

    // Populate values from legacy textBoxes
    const values: Record<string, string> = { ...(lp.values || {}) };
    if (lp.textBoxes && Array.isArray(lp.textBoxes)) {
      for (const box of lp.textBoxes) {
        if (box.fieldLabel && values[box.fieldLabel] === undefined) {
          values[box.fieldLabel] = box.content || '';
        }
      }
    }

    // Per-design text boxes: clone from page if present, otherwise deep clone project template
    let pageBoxes: TextBoxTemplate[];
    if (Array.isArray(lp.textBoxes) && lp.textBoxes.length > 0 && lp.textBoxes[0].fieldLabel) {
      const pageW = lp.originalWidth || lp.width || 1000;
      pageBoxes = lp.textBoxes.map((b: any, idx: number) => ({
        id: b.id || `box_${i}_${idx}`,
        fieldLabel: b.fieldLabel || `Field ${idx + 1}`,
        x: typeof b.x === 'number' ? b.x : 10,
        y: typeof b.y === 'number' ? b.y : 10 + idx * 15,
        width: typeof b.width === 'number' ? b.width : 80,
        height: typeof b.height === 'number' ? b.height : 12,
        fontFamily: b.fontFamily || 'Plus Jakarta Sans',
        fontSize: b.fontSize ? (b.fontSize > 150 ? Math.round(b.fontSize * (1000 / pageW)) : b.fontSize) : 24,
        fontWeight: b.fontWeight || '600',
        fontStyle: b.fontStyle || 'normal',
        textAlign: b.textAlign || 'center',
        color: b.color || '#FFF8E7',
        lineHeight: b.lineHeight || 1.3,
        letterSpacing: b.letterSpacing || 0,
        shadow: b.shadow,
        stroke: b.stroke,
        fill: b.fill,
      }));
    } else {
      pageBoxes = JSON.parse(JSON.stringify(template));
    }

    newPages.push({
      id: lp.id || `page_${Date.now()}_${i}`,
      imageId,
      name: lp.name || `Design ${i + 1}`,
      width: lp.originalWidth || lp.width || 1000,
      height: lp.originalHeight || lp.height || 1000,
      values,
      textBoxes: pageBoxes,
    });
  }

  const migrated: Project = {
    id: rawProject.id || `proj_${Date.now()}`,
    name: rawProject.name || 'Untitled Project',
    createdAt: rawProject.createdAt || Date.now(),
    updatedAt: Date.now(),
    template,
    pages: newPages,
    lastSpreadsheet: rawProject.lastSpreadsheet,
    customFonts: rawProject.customFonts || [],
  };

  // Re-save the migrated project to IndexedDB
  await saveProject(migrated);
  return migrated;
}

/**
 * Save project to IndexedDB
 */
export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.put({
      ...project,
      updatedAt: Date.now(),
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error('Could not save project to browser storage.'));
  });
}

/**
 * Get project by ID, with automatic legacy migration
 */
export async function getProject(id: string): Promise<Project | null> {
  const db = await getDB();
  return new Promise<Project | null>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.get(id);
    req.onsuccess = async () => {
      const raw = req.result;
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        const migrated = await migrateLegacyProject(raw);
        resolve(migrated);
      } catch (err) {
        console.error('Migration error, returning raw:', err);
        resolve(raw as Project);
      }
    };
    req.onerror = () => reject(new Error('Could not load the requested project.'));
  });
}

/**
 * List all projects (sorted newest first)
 */
export async function getAllProjects(): Promise<Project[]> {
  const db = await getDB();
  return new Promise<Project[]>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.getAll();
    req.onsuccess = () => {
      const results: Project[] = (req.result || []).map((p: any) => ({
        id: p.id,
        name: p.name || 'Untitled Project',
        createdAt: p.createdAt || Date.now(),
        updatedAt: p.updatedAt || Date.now(),
        template: p.template || createDefaultTemplate(),
        pages: p.pages || [],
        lastSpreadsheet: p.lastSpreadsheet,
        customFonts: p.customFonts || [],
      }));
      results.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(results);
    };
    req.onerror = () => reject(new Error('Could not load project library.'));
  });
}

/**
 * Delete a project and its associated image Blobs
 */
export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);
  const imageIdsToDelete: string[] = [];
  if (project?.pages) {
    for (const p of project.pages) {
      if (p.imageId) imageIdsToDelete.push(p.imageId);
    }
  }

  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error('Could not delete project.'));
  });

  if (imageIdsToDelete.length > 0) {
    await deleteImages(imageIdsToDelete);
  }
}

/**
 * Get storage estimate
 */
export async function getStorageEstimate(): Promise<{ usedBytes: number; quotaBytes: number; percentage: number }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 1;
      return {
        usedBytes: used,
        quotaBytes: quota,
        percentage: Math.min(100, Math.round((used / quota) * 100)),
      };
    } catch {
      return { usedBytes: 0, quotaBytes: 0, percentage: 0 };
    }
  }
  return { usedBytes: 0, quotaBytes: 0, percentage: 0 };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Font Store Operations
 */
export async function saveFontRecord(record: StoredFontRecord): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_FONTS, 'readwrite');
    const store = tx.objectStore(STORE_FONTS);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error('Failed to save custom font into database.'));
  });
}

export async function getAllFontRecords(): Promise<StoredFontRecord[]> {
  const db = await getDB();
  return new Promise<StoredFontRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_FONTS, 'readonly');
    const store = tx.objectStore(STORE_FONTS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(new Error('Failed to retrieve custom fonts.'));
  });
}

export async function getFontRecord(id: string): Promise<StoredFontRecord | null> {
  const db = await getDB();
  return new Promise<StoredFontRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_FONTS, 'readonly');
    const store = tx.objectStore(STORE_FONTS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(new Error('Failed to retrieve custom font.'));
  });
}

export async function deleteFontRecord(id: string): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_FONTS, 'readwrite');
    const store = tx.objectStore(STORE_FONTS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error('Failed to delete custom font.'));
  });
}

