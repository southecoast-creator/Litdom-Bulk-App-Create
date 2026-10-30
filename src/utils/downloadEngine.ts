/**
 * Litdom Batch Studio - High-Resolution Export Engine
 * Sequential rendering at 100% native resolution, UI yields, JSZip STORE compression,
 * 2-minute URL revocation, and clean slugified filenames (001-title-words.png).
 */

import JSZip from 'jszip';
import { Project, DesignPage } from '../types';
import { renderDesignToCanvas, preloadTemplateFonts } from './canvasEngine';
import { getOriginalImageBlob } from './db';

export interface ExportProgress {
  current: number;
  total: number;
  statusText: string;
}

export type ExportFormat = 'png' | 'jpeg';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 30);
}

export function generateFilename(page: DesignPage, index: number, format: ExportFormat): string {
  const paddedIndex = String(index + 1).padStart(3, '0');
  const titleVal =
    page.values['Title'] ||
    page.values['Headline'] ||
    page.values['TITLE'] ||
    page.name ||
    'design';
  const slug = slugify(titleVal) || 'design';
  const ext = format === 'png' ? 'png' : 'jpg';
  return `${paddedIndex}-${slug}.${ext}`;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke download URL after 2 minutes (120,000ms), not 1 second
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 120000);
}

export interface RenderedDesignItem {
  pageIndex: number;
  page: DesignPage;
  blob: Blob;
  file: File;
  filename: string;
  previewUrl: string;
}

/**
 * Render a single design to a Blob at native full resolution (exact width x height)
 */
export async function exportSingleDesign(
  project: Project,
  pageIndex: number,
  format: ExportFormat = 'png',
  quality = 0.92
): Promise<Blob> {
  const page = project.pages[pageIndex];
  if (!page) throw new Error('Design page not found.');

  const boxesToRender =
    page.textBoxes && page.textBoxes.length > 0 ? page.textBoxes : project.template;

  await preloadTemplateFonts(boxesToRender);

  const imageBlob = await getOriginalImageBlob(page.imageId);
  if (!imageBlob) throw new Error(`Could not load background image for ${page.name}`);

  const canvas = document.createElement('canvas');
  const nativeW = page.width || 1000;
  const nativeH = page.height || 1000;
  canvas.width = nativeW;
  canvas.height = nativeH;

  await renderDesignToCanvas(canvas, boxesToRender, page, imageBlob, {
    showBoundingBoxes: false,
    targetWidth: nativeW,
    targetHeight: nativeH,
  });

  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        // Free canvas memory
        canvas.width = 1;
        canvas.height = 1;
        if (b) resolve(b);
        else reject(new Error('Failed to generate image file.'));
      },
      mimeType,
      quality
    );
  });
}

/**
 * Render all or specific designs into File objects and preview URLs for Gallery saving
 */
export async function exportDesignsToFiles(
  project: Project,
  pageIndexes: number[],
  format: ExportFormat = 'png',
  quality = 0.92,
  onProgress?: (progress: ExportProgress) => void
): Promise<RenderedDesignItem[]> {
  const results: RenderedDesignItem[] = [];
  const total = pageIndexes.length;

  for (let i = 0; i < total; i++) {
    const pageIndex = pageIndexes[i];
    const page = project.pages[pageIndex];
    if (!page) continue;

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        statusText: `Rendering ${i + 1} of ${total} at original resolution (${page.width}×${page.height})…`,
      });
    }

    // Yield to UI to avoid blocking
    await new Promise((resolve) => setTimeout(resolve, 0));

    const blob = await exportSingleDesign(project, pageIndex, format, quality);
    const filename = generateFilename(page, pageIndex, format);
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const file = new File([blob], filename, { type: mimeType });
    const previewUrl = URL.createObjectURL(blob);

    results.push({
      pageIndex,
      page,
      blob,
      file,
      filename,
      previewUrl,
    });
  }

  return results;
}

/**
 * Export all designs sequentially into a ZIP archive with STORE compression
 */
export async function exportAllDesignsZip(
  project: Project,
  format: ExportFormat = 'png',
  quality = 0.92,
  onProgress?: (progress: ExportProgress) => void
): Promise<Blob> {
  const total = project.pages.length;
  if (total === 0) throw new Error('No designs to export.');

  const zip = new JSZip();

  for (let i = 0; i < total; i++) {
    const page = project.pages[i];

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        statusText: `Creating ${i + 1} of ${total}…`,
      });
    }

    // Yield to the UI between designs to keep animations smooth
    await new Promise((resolve) => setTimeout(resolve, 0));

    const blob = await exportSingleDesign(project, i, format, quality);
    const filename = generateFilename(page, i, format);
    zip.file(filename, blob);
  }

  if (onProgress) {
    onProgress({
      current: total,
      total,
      statusText: 'Compressing archive…',
    });
  }

  // JSZip with STORE compression (no compression overhead for already compressed images)
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });

  return zipBlob;
}
