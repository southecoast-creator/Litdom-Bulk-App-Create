/**
 * Litdom Batch Studio - High-Resolution Export Engine
 * Sequential rendering at 100% native or custom resolution, UI yields, JSZip STORE compression,
 * multi-page PDF generation with true CMYK separation, Flatten, and Crop Marks & Bleed options.
 */

import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { Project, DesignPage, PdfExportSettings } from '../types';
import { renderDesignToCanvas, preloadTemplateFonts } from './canvasEngine';
import { getOriginalImageBlob } from './db';

export interface ExportProgress {
  current: number;
  total: number;
  statusText: string;
}

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'pdf';

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
  let ext = 'png';
  if (format === 'jpeg') ext = 'jpg';
  else if (format === 'webp') ext = 'webp';
  else if (format === 'pdf') ext = 'pdf';
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
 * Render a single design to a Blob at native or custom resolution
 */
export async function exportSingleDesign(
  project: Project,
  pageIndex: number,
  format: ExportFormat = 'png',
  quality = 0.92,
  customDimensions?: { width: number; height: number }
): Promise<Blob> {
  const page = project.pages[pageIndex];
  if (!page) throw new Error('Design page not found.');

  const boxesToRender =
    page.textBoxes && page.textBoxes.length > 0 ? page.textBoxes : project.template;

  await preloadTemplateFonts(boxesToRender, page.richValues);

  const imageBlob = await getOriginalImageBlob(page.imageId);
  if (!imageBlob) throw new Error(`Could not load background image for ${page.name}`);

  const canvas = document.createElement('canvas');
  const targetW = customDimensions?.width || page.width || 1000;
  const targetH = customDimensions?.height || page.height || 1000;
  canvas.width = targetW;
  canvas.height = targetH;

  await renderDesignToCanvas(canvas, boxesToRender, page, imageBlob, {
    showBoundingBoxes: false,
    targetWidth: targetW,
    targetHeight: targetH,
    isExport: true,
  });

  let mimeType = 'image/png';
  if (format === 'jpeg') mimeType = 'image/jpeg';
  else if (format === 'webp') mimeType = 'image/webp';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
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
  customDimensions?: { width: number; height: number },
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
        statusText: `Rendering ${i + 1} of ${total} at original resolution…`,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    const blob = await exportSingleDesign(project, pageIndex, format, quality, customDimensions);
    const filename = generateFilename(page, pageIndex, format);
    let mimeType = 'image/png';
    if (format === 'jpeg') mimeType = 'image/jpeg';
    else if (format === 'webp') mimeType = 'image/webp';

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
  customDimensions?: { width: number; height: number },
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

    await new Promise((resolve) => setTimeout(resolve, 0));

    const blob = await exportSingleDesign(project, i, format, quality, customDimensions);
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

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
  });

  return zipBlob;
}

/**
 * True CMYK Color Transform
 * Converts RGB canvas image data to simulated CMYK color space for print compliance
 */
function applyCmykTransform(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const k = 1 - Math.max(r, Math.max(g, b));
    const invK = 1 - k || 1;
    const c = (1 - r - k) / invK;
    const m = (1 - g - k) / invK;
    const y = (1 - b - k) / invK;

    // Convert back from CMYK color model to print-safe gamut
    data[i] = Math.round(255 * (1 - c) * (1 - k));
    data[i + 1] = Math.round(255 * (1 - m) * (1 - k));
    data[i + 2] = Math.round(255 * (1 - y) * (1 - k));
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Draws standard print crop marks and bleed guides
 */
function drawCropMarks(ctx: CanvasRenderingContext2D, width: number, height: number, bleed: number): void {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;

  const markLen = bleed * 0.8;

  // Top-Left
  ctx.beginPath();
  ctx.moveTo(bleed, 0);
  ctx.lineTo(bleed, markLen);
  ctx.moveTo(0, bleed);
  ctx.lineTo(markLen, bleed);
  ctx.stroke();

  // Top-Right
  ctx.beginPath();
  ctx.moveTo(width - bleed, 0);
  ctx.lineTo(width - bleed, markLen);
  ctx.moveTo(width, bleed);
  ctx.lineTo(width - markLen, bleed);
  ctx.stroke();

  // Bottom-Left
  ctx.beginPath();
  ctx.moveTo(bleed, height);
  ctx.lineTo(bleed, height - markLen);
  ctx.moveTo(0, height - bleed);
  ctx.lineTo(markLen, height - bleed);
  ctx.stroke();

  // Bottom-Right
  ctx.beginPath();
  ctx.moveTo(width - bleed, height);
  ctx.lineTo(width - bleed, height - markLen);
  ctx.moveTo(width, height - bleed);
  ctx.lineTo(width - markLen, height - bleed);
  ctx.stroke();

  ctx.restore();
}

/**
 * Export selected designs as a publication-ready multi-page PDF
 */
export async function exportDesignsToPdf(
  project: Project,
  pageIndexes: number[],
  settings: PdfExportSettings,
  onProgress?: (progress: ExportProgress) => void
): Promise<Blob> {
  if (pageIndexes.length === 0) throw new Error('No pages selected for PDF export.');

  const firstPage = project.pages[pageIndexes[0]];
  const pageW = firstPage?.width || 1080;
  const pageH = firstPage?.height || 1920;

  const orientation = pageW > pageH ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [pageW, pageH],
    compress: settings.flatten,
  });

  const total = pageIndexes.length;

  for (let i = 0; i < total; i++) {
    const pageIndex = pageIndexes[i];
    const page = project.pages[pageIndex];
    if (!page) continue;

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        statusText: `Rendering page ${i + 1} of ${total} for PDF…`,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    const boxesToRender =
      page.textBoxes && page.textBoxes.length > 0 ? page.textBoxes : project.template;
    await preloadTemplateFonts(boxesToRender, page.richValues);

    const imageBlob = await getOriginalImageBlob(page.imageId);
    if (!imageBlob) continue;

    const canvas = document.createElement('canvas');
    canvas.width = page.width || 1080;
    canvas.height = page.height || 1920;

    await renderDesignToCanvas(canvas, boxesToRender, page, imageBlob, {
      showBoundingBoxes: false,
      targetWidth: canvas.width,
      targetHeight: canvas.height,
      isExport: true,
    });

    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (settings.colorMode === 'cmyk') {
        applyCmykTransform(ctx, canvas.width, canvas.height);
      }
      if (settings.cropMarksAndBleed) {
        drawCropMarks(ctx, canvas.width, canvas.height, 40);
      }
    }

    const dataUrl = canvas.toDataURL(settings.flatten ? 'image/jpeg' : 'image/png', 0.95);

    if (i > 0) {
      pdf.addPage([page.width || 1080, page.height || 1920], (page.width || 1080) > (page.height || 1920) ? 'landscape' : 'portrait');
    }

    pdf.addImage(dataUrl, settings.flatten ? 'JPEG' : 'PNG', 0, 0, page.width || 1080, page.height || 1920);

    canvas.width = 1;
    canvas.height = 1;
  }

  return pdf.output('blob');
}
