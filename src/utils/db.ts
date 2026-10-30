/**
 * Litdom Batch Studio - IndexedDB Storage Engine
 * High-reliability database storing lightweight projects in "projects" store,
 * binary Blobs (original + ~1200px preview + ~240px thumbnail) in "images" store,
 * and custom font Blobs in "fonts" store.
 * Supports honest exact byte accounting, atomic single/batch deletion, and complete wipe.
 */

import {
  Project,
  TextBoxTemplate,
  DesignPage,
  StoredImageRecord,
  StoredFontRecord,
  StorageBreakdown,
} from '../types';

const DB_NAME = 'litdom_batch_studio_v2';
const OLD_DB_NAME = 'litdom_batch_studio_db';
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
    try {
      URL.revokeObjectURL(url);
    } catch {
      // safe fallback
    }
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
 * Generate a resized JPEG Blob from an Image/Blob
 */
export async function createResizedImageBlob(
  source: Blob | HTMLImageElement,
  maxDimension: number,
  quality = 0.85
): Promise<Blob> {
  let img: HTMLImageElement;

  if (source instanceof Blob) {
    img = new Image();
    const url = URL.createObjectURL(source);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image for resizing'));
      img.src = url;
    });
    URL.revokeObjectURL(url);
  } else {
    img = source;
  }

  const srcW = img.naturalWidth || img.width || 1000;
  const srcH = img.naturalHeight || img.height || 1000;

  let dstW = srcW;
  let dstH = srcH;

  if (srcW > maxDimension || srcH > maxDimension) {
    const ratio = srcW / srcH;
    if (srcW > srcH) {
      dstW = maxDimension;
      dstH = Math.round(maxDimension / ratio);
    } else {
      dstH = maxDimension;
      dstW = Math.round(maxDimension * ratio);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, dstW);
  canvas.height = Math.max(1, dstH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas 2d context');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        canvas.width = 1;
        canvas.height = 1;
        if (b) resolve(b);
        else reject(new Error('Resizing image failed'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Save an uploaded design image into the "images" store as Blobs:
 * - originalBlob: full resolution
 * - previewBlob: ~1200px wide for high-speed buttery editing
 * - thumbnailBlob: ~240px for thumbnail carousel
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

  // Generate downscaled preview (~1200px) and thumbnail (~240px)
  const [previewBlob, thumbnailBlob] = await Promise.all([
    width > 1200 || height > 1200
      ? createResizedImageBlob(img, 1200, 0.88)
      : fileOrBlob,
    createResizedImageBlob(img, 240, 0.82),
  ]);

  const record: StoredImageRecord = {
    id: imageId,
    originalBlob: fileOrBlob,
    previewBlob,
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

/**
 * Get downscaled preview Blob (~1200px) for smooth 60fps editing on screen
 */
export async function getPreviewImageBlob(imageId: string): Promise<Blob | null> {
  const record = await getImageRecord(imageId);
  if (!record) return null;
  return record.previewBlob || record.originalBlob;
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
 * Convert base64 data URLs to Blobs (migration helper)
 */
async function base64ToBlob(base64DataUrl: string): Promise<Blob> {
  const res = await fetch(base64DataUrl);
  return await res.blob();
}

/**
 * Migrate legacy projects into modern format with per-design text boxes
 */
export async function migrateLegacyProject(rawProject: any): Promise<Project> {
  let template: TextBoxTemplate[] =
    Array.isArray(rawProject.template) && rawProject.template.length > 0
      ? rawProject.template
      : [];

  const legacyPages: any[] = rawProject.pages || [];

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

    const values: Record<string, string> = { ...(lp.values || {}) };
    if (lp.textBoxes && Array.isArray(lp.textBoxes)) {
      for (const box of lp.textBoxes) {
        if (box.fieldLabel && values[box.fieldLabel] === undefined) {
          values[box.fieldLabel] = box.content || '';
        }
      }
    }

    let pageBoxes: TextBoxTemplate[];
    if (Array.isArray(lp.textBoxes) && lp.textBoxes.length > 0 && lp.textBoxes[0].fieldLabel) {
      const pageW = lp.originalWidth || lp.width || 1000;
      pageBoxes = lp.textBoxes.map((b: any, idx: number) => ({
        id: b.id || `box_${i}_${idx}`,
        fieldLabel: b.fieldLabel || `Field ${idx + 1}`,
        x: typeof b.x === 'number' ? b.x : 10,
        y: typeof b.y === 'number' ? b.y : 10 + idx * 15,
        width: typeof b.width === 'number' ? b.width : 80,
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
      richValues: lp.richValues || {},
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
 * Atomic Project Deletion: deletes project and its unreferenced image records
 * in a SINGLE IndexedDB transaction without running migration!
 */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS, STORE_IMAGES], 'readwrite');
    const projStore = tx.objectStore(STORE_PROJECTS);
    const imgStore = tx.objectStore(STORE_IMAGES);

    // 1. Get all projects to find orphaned images safely
    const allProjReq = projStore.getAll();

    allProjReq.onsuccess = () => {
      const allProjects: Project[] = allProjReq.result || [];
      const targetProject = allProjects.find((p) => p.id === id);

      // Collect target project's images
      const targetImages = new Set<string>();
      if (targetProject?.pages) {
        for (const p of targetProject.pages) {
          if (p.imageId) targetImages.add(p.imageId);
        }
      }

      // Check which images are still used by other projects
      const otherReferencedImages = new Set<string>();
      for (const p of allProjects) {
        if (p.id !== id && p.pages) {
          for (const page of p.pages) {
            if (page.imageId) otherReferencedImages.add(page.imageId);
          }
        }
      }

      // Delete the project
      projStore.delete(id);

      // Delete images that are not used by any other project
      for (const imgId of targetImages) {
        if (!otherReferencedImages.has(imgId)) {
          imgStore.delete(imgId);
        }
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Could not delete project and image assets.'));
  });
}

/**
 * Atomic Multi-Page Deletion from Project:
 * Deletes specified pages from project and immediately deletes their image records
 * if not used by any other design in any project.
 */
export async function deleteDesignsFromProjectAtomic(
  projectId: string,
  pageIdsToDelete: string[]
): Promise<Project> {
  const db = await getDB();
  const pageIdSet = new Set(pageIdsToDelete);

  return new Promise<Project>((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS, STORE_IMAGES], 'readwrite');
    const projStore = tx.objectStore(STORE_PROJECTS);
    const imgStore = tx.objectStore(STORE_IMAGES);

    const allProjReq = projStore.getAll();

    allProjReq.onsuccess = () => {
      const allProjects: Project[] = allProjReq.result || [];
      const targetProject = allProjects.find((p) => p.id === projectId);
      if (!targetProject) {
        reject(new Error('Project not found'));
        return;
      }

      // Find deleted pages and their image IDs
      const deletedImages = new Set<string>();
      const retainedPages: DesignPage[] = [];

      for (const p of targetProject.pages || []) {
        if (pageIdSet.has(p.id)) {
          if (p.imageId) deletedImages.add(p.imageId);
        } else {
          retainedPages.push(p);
        }
      }

      const updatedProject: Project = {
        ...targetProject,
        pages: retainedPages,
        updatedAt: Date.now(),
      };

      // Save updated project
      projStore.put(updatedProject);

      // Check if any deleted image is still used by retained pages or other projects
      const stillUsedImages = new Set<string>();
      for (const p of allProjects) {
        const pages = p.id === projectId ? retainedPages : p.pages || [];
        for (const page of pages) {
          if (page.imageId) stillUsedImages.add(page.imageId);
        }
      }

      for (const imgId of deletedImages) {
        if (!stillUsedImages.has(imgId)) {
          imgStore.delete(imgId);
        }
      }

      tx.oncomplete = () => resolve(updatedProject);
    };

    tx.onerror = () => reject(new Error('Failed to delete selected design pages.'));
  });
}

/**
 * Exact Storage Calculation:
 * Exact sum of the byte sizes of all stored image blobs (original + preview + thumbnail),
 * font blobs, and project JSON strings. Reads 0 B when nothing is stored.
 */
export async function calculateExactStorageBreakdown(): Promise<StorageBreakdown> {
  const db = await getDB();

  return new Promise<StorageBreakdown>((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS, STORE_IMAGES, STORE_FONTS], 'readonly');
    const projStore = tx.objectStore(STORE_PROJECTS);
    const imgStore = tx.objectStore(STORE_IMAGES);
    const fontStore = tx.objectStore(STORE_FONTS);

    let projectsBytes = 0;
    let designsBytes = 0;
    let fontsBytes = 0;
    const projectSizes: Record<string, number> = {};
    const imageSizeMap: Record<string, number> = {};

    const imgReq = imgStore.getAll();
    const fontReq = fontStore.getAll();
    const projReq = projStore.getAll();

    tx.oncomplete = () => {
      // 1. Calculate image sizes
      const images: StoredImageRecord[] = imgReq.result || [];
      for (const img of images) {
        let size = 0;
        if (img.originalBlob) size += img.originalBlob.size || 0;
        if (img.previewBlob) size += img.previewBlob.size || 0;
        if (img.thumbnailBlob) size += img.thumbnailBlob.size || 0;
        designsBytes += size;
        imageSizeMap[img.id] = size;
      }

      // 2. Calculate font sizes
      const fonts: StoredFontRecord[] = fontReq.result || [];
      for (const f of fonts) {
        fontsBytes += f.blob ? f.blob.size || 0 : f.fileSize || 0;
      }

      // 3. Calculate project sizes
      const projects: Project[] = projReq.result || [];
      for (const p of projects) {
        const jsonBytes = new Blob([JSON.stringify(p)]).size;
        projectsBytes += jsonBytes;

        let projImagesSize = 0;
        if (p.pages) {
          for (const page of p.pages) {
            if (page.imageId && imageSizeMap[page.imageId]) {
              projImagesSize += imageSizeMap[page.imageId];
            }
          }
        }
        projectSizes[p.id] = jsonBytes + projImagesSize;
      }

      const totalBytes = designsBytes + fontsBytes + projectsBytes;

      resolve({
        designsBytes,
        fontsBytes,
        projectsBytes,
        totalBytes,
        projectSizes,
      });
    };

    tx.onerror = () => reject(new Error('Failed to compute storage breakdown.'));
  });
}

/**
 * Clean up orphaned images not referenced by any project,
 * and delete old database 'litdom_batch_studio_db'.
 */
export async function cleanupOrphanedImages(): Promise<{ freedBytes: number; deletedCount: number }> {
  const db = await getDB();

  // Also remove old legacy database if it exists
  try {
    indexedDB.deleteDatabase(OLD_DB_NAME);
  } catch {
    // safe fallback
  }

  return new Promise<{ freedBytes: number; deletedCount: number }>((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS, STORE_IMAGES], 'readwrite');
    const projStore = tx.objectStore(STORE_PROJECTS);
    const imgStore = tx.objectStore(STORE_IMAGES);

    const projReq = projStore.getAll();
    const imgReq = imgStore.getAll();

    tx.oncomplete = () => {
      // safe completion
    };

    let done = false;
    const checkAndClean = () => {
      if (done) return;
      if (projReq.readyState === 'done' && imgReq.readyState === 'done') {
        done = true;
        const projects: Project[] = projReq.result || [];
        const images: StoredImageRecord[] = imgReq.result || [];

        const referencedImageIds = new Set<string>();
        for (const p of projects) {
          if (p.pages) {
            for (const page of p.pages) {
              if (page.imageId) referencedImageIds.add(page.imageId);
            }
          }
        }

        let freedBytes = 0;
        let deletedCount = 0;

        for (const img of images) {
          if (!referencedImageIds.has(img.id)) {
            const size =
              (img.originalBlob?.size || 0) +
              (img.previewBlob?.size || 0) +
              (img.thumbnailBlob?.size || 0);
            freedBytes += size;
            deletedCount++;
            imgStore.delete(img.id);
          }
        }

        tx.oncomplete = () => resolve({ freedBytes, deletedCount });
      }
    };

    projReq.onsuccess = checkAndClean;
    imgReq.onsuccess = checkAndClean;
    tx.onerror = () => reject(new Error('Failed to clean up storage.'));
  });
}

/**
 * Erase Everything:
 * Closes DB, deletes both IndexedDB databases, deletes Cache Storage entries,
 * unregisters service workers, clears localStorage & sessionStorage, revokes URLs, and reloads.
 */
export async function eraseEverything(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  // Delete IndexedDBs
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {}
  try {
    indexedDB.deleteDatabase(OLD_DB_NAME);
  } catch {}

  // Delete Cache Storage
  if (typeof caches !== 'undefined' && caches.keys) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
  }

  // Unregister Service Workers
  if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    } catch {}
  }

  // Clear Storage
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {}

  // Revoke Object URLs
  revokeAllManagedObjectUrls();

  // Reload the application cleanly
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

/**
 * Storage estimate from navigator.storage
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
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
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

export async function deleteAllFonts(): Promise<void> {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_FONTS, 'readwrite');
    const store = tx.objectStore(STORE_FONTS);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error('Failed to clear custom fonts.'));
  });
}
