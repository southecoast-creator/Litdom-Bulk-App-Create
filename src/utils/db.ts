/**
 * Litdom Batch Studio - IndexedDB Storage Engine
 * 100% Client-Side Persistent Storage for Projects, Images, and Fonts.
 */
import { Project, CustomFont } from '../types';

const DB_NAME = 'litdom_batch_studio_db';
const DB_VERSION = 1;

interface DBSchema {
  projects: Project;
  customFonts: CustomFont;
  templates: { id: string; name: string; pages: any[]; createdAt: number };
}

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('customFonts')) {
        db.createObjectStore('customFonts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };
  });
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const req = store.put({ ...project, updatedAt: Date.now() });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const req = store.getAll();

      req.onsuccess = () => {
        const sorted = (req.result || []).sort(
          (a: Project, b: Project) => b.updatedAt - a.updatedAt
        );
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function clearAllProjects(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function saveCustomFont(font: CustomFont): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('customFonts', 'readwrite');
      const store = tx.objectStore('customFonts');
      const req = store.put(font);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getAllCustomFonts(): Promise<CustomFont[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('customFonts', 'readonly');
      const store = tx.objectStore('customFonts');
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function deleteCustomFont(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('customFonts', 'readwrite');
      const store = tx.objectStore('customFonts');
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Check browser storage estimate and remaining quota
 */
export async function getStorageEstimate(): Promise<{
  usedBytes: number;
  quotaBytes: number;
  percentage: number;
  isSupported: boolean;
}> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedBytes = estimate.usage || 0;
      const quotaBytes = estimate.quota || 1;
      const percentage = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
      return { usedBytes, quotaBytes, percentage, isSupported: true };
    } catch {
      // Fallback
    }
  }
  return { usedBytes: 0, quotaBytes: 0, percentage: 0, isSupported: false };
}

/**
 * Format bytes to readable string (e.g. 14.2 MB)
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Export project to a downloadable JSON backup file
 */
export function exportProjectBackup(project: Project) {
  const jsonStr = JSON.stringify(project, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const sanitizedName = (project.name || 'litdom-project')
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '_');
  a.href = url;
  a.download = `${sanitizedName}-backup-${new Date().toISOString().slice(0, 10)}.litdom.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Read imported project backup file
 */
export async function importProjectBackup(file: File): Promise<Project> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !parsed.name || !Array.isArray(parsed.pages)) {
    throw new Error('Invalid Litdom Studio project backup file format.');
  }

  // Create clean ID to avoid collision or allow restoring
  const restoredProject: Project = {
    ...parsed,
    id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: `${parsed.name} (Restored)`,
    updatedAt: Date.now(),
  };

  await saveProject(restoredProject);
  return restoredProject;
}
