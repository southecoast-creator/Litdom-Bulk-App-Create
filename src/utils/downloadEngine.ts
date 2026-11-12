/**
 * Litdom Batch Studio - High-Resolution Export Engine
 * Sequential rendering at 100% native or custom resolution, UI yields, JSZip STORE compression,
 * multi-page PDF generation with true CMYK separation, Flatten, and Crop Marks & Bleed options.
 */

import JSZip from 'jszip';
import { Project, DesignPage, PdfExportSettings } from '../types';
import { renderDesignToCanvas, preloadTemplateFonts } from './canvasEngine';
import { getOriginalImageBlob, getImageRecord } from './db';
import { PdfBuilder, rgbaToRgb, rgbaToCmyk } from './pdfWriter';

/** Either an exact size, or a multiplier of every page's own size. */
export interface ExportDimensions {
  width?: number;
  height?: number;
  scale?: number;
}

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
 * Check, BEFORE anything is rendered, that every page still has its background image and every
 * image overlay. A missing file is reported by page number instead of being silently left out.
 */
export async function verifyPageAssets(project: Project, pageIndexes: number[]): Promise<void> {
  const problems: string[] = [];
  for (const idx of pageIndexes) {
    const page = project.pages[idx];
    if (!page) {
      problems.push(`page ${idx + 1} does not exist`);
      continue;
    }
    const bg = page.imageId ? await getImageRecord(page.imageId) : null;
    if (!bg) problems.push(`page ${idx + 1}: background image is missing`);
    const boxes = page.textBoxes && page.textBoxes.length > 0 ? page.textBoxes : project.template;
    for (const b of boxes) {
      if (b.elementType === 'image_overlay' && b.imageOverlayId) {
        const ov = await getImageRecord(b.imageOverlayId);
        if (!ov) problems.push(`page ${idx + 1}: an uploaded image on the page is missing`);
      }
    }
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 6).join('; ');
    throw new Error(
      `Download stopped so nothing is left out: ${shown}${problems.length > 6 ? ` (and ${problems.length - 6} more)` : ''}. Re-upload that image, then download again.`
    );
  }
}

/**
 * Render a single design to a Blob at native or custom resolution
 */
export async function exportSingleDesign(
  project: Project,
  pageIndex: number,
  format: ExportFormat = 'png',
  quality = 0.92,
  customDimensions?: ExportDimensions
): Promise<Blob> {
  const page = project.pages[pageIndex];
  if (!page) throw new Error('Design page not found.');

  const boxesToRender =
    page.textBoxes && page.textBoxes.length > 0 ? page.textBoxes : project.template;

  await preloadTemplateFonts(boxesToRender, page.richValues);

  const imageBlob = await getOriginalImageBlob(page.imageId);
  if (!imageBlob) throw new Error(`Could not load background image for ${page.name}`);

  const canvas = document.createElement('canvas');
  let targetW = customDimensions?.width || page.width || 1000;
  let targetH = customDimensions?.height || page.height || 1000;
  if (!customDimensions?.width && customDimensions?.scale && customDimensions.scale > 1) {
    // Sharper export: multiply the page's own size, but stay within what a phone can render
    const maxPixels = 36_000_000;
    const k = Math.min(customDimensions.scale, Math.sqrt(maxPixels / (targetW * targetH)));
    targetW = Math.round(targetW * Math.max(1, k));
    targetH = Math.round(targetH * Math.max(1, k));
  }
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
  customDimensions?: ExportDimensions,
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
  customDimensions?: ExportDimensions,
  onProgress?: (progress: ExportProgress) => void,
  pageIndexes?: number[]
): Promise<Blob> {
  // Only the pages that were chosen (all of them when nothing is chosen)
  const indexes = pageIndexes ?? project.pages.map((_, i) => i);
  const total = indexes.length;
  if (total === 0) throw new Error('No designs to export.');

  await verifyPageAssets(project, indexes);

  const zip = new JSZip();

  for (let n = 0; n < total; n++) {
    const i = indexes[n];
    const page = project.pages[i];

    if (onProgress) {
      onProgress({
        current: n + 1,
        total,
        statusText: `Creating ${n + 1} of ${total}…`,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    const blob = await exportSingleDesign(project, i, format, quality, customDimensions);
    // The number in the file name is the page's real number in the project
    zip.file(generateFilename(page, i, format), blob);
  }

  if (Object.keys(zip.files).length !== total) {
    throw new Error('The archive is missing files, so it was not saved. Please try again.');
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
 * Draws print crop marks in the margin around the trimmed page
 */
function drawCropMarks(ctx: CanvasRenderingContext2D, trimX: number, trimY: number, w: number, h: number, bleed: number, len: number): void {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  const draw = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const xs = [trimX, trimX + w];
  const ys = [trimY, trimY + h];
  for (const x of xs) {
    const dir = x === trimX ? -1 : 1;
    for (const y of ys) {
      const vdir = y === trimY ? -1 : 1;
      // horizontal mark, starting just outside the bleed
      draw(x + dir * bleed, y, x + dir * (bleed + len), y);
      // vertical mark
      draw(x, y + vdir * bleed, x, y + vdir * (bleed + len));
    }
  }
  ctx.restore();
}

const BLEED_PX = 24;
const MARK_PX = 36;

/**
 * Export the chosen designs as ONE multi-page PDF, one PDF page per design, in order.
 *  - Digital: RGB, JPEG-compressed (small, for screens)
 *  - RGB: RGB, lossless (JPEG-compressed when "Flatten / compress" is on)
 *  - CMYK: real DeviceCMYK colour for print
 * "Crop marks & bleed" really adds a bleed margin (the edge of the design is extended) and marks.
 * If anything is missing the export stops with a clear message instead of leaving pages out.
 */
export async function exportDesignsToPdf(
  project: Project,
  pageIndexes: number[],
  settings: PdfExportSettings,
  onProgress?: (progress: ExportProgress) => void
): Promise<Blob> {
  if (pageIndexes.length === 0) throw new Error('No pages selected for PDF export.');
  await verifyPageAssets(project, pageIndexes);

  const pdf = new PdfBuilder(project.name || 'Litdom design');
  const total = pageIndexes.length;
  const useJpeg = settings.colorMode === 'digital' || (settings.colorMode === 'rgb' && settings.flatten);

  for (let i = 0; i < total; i++) {
    const pageIndex = pageIndexes[i];
    const page = project.pages[pageIndex];
    if (!page) throw new Error(`Page ${pageIndex + 1} does not exist.`);

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
    if (!imageBlob) throw new Error(`Page ${pageIndex + 1}: background image is missing.`);

    const w = page.width || 1080;
    const h = page.height || 1920;
    const design = document.createElement('canvas');
    design.width = w;
    design.height = h;
    await renderDesignToCanvas(design, boxesToRender, page, imageBlob, {
      showBoundingBoxes: false,
      targetWidth: w,
      targetHeight: h,
      isExport: true,
    });

    // Optional bleed + crop marks: a larger sheet with the design in the middle
    let out = design;
    let outW = w;
    let outH = h;
    if (settings.cropMarksAndBleed) {
      const m = BLEED_PX + MARK_PX;
      outW = w + 2 * m;
      outH = h + 2 * m;
      out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      const octx = out.getContext('2d');
      if (octx) {
        octx.fillStyle = '#FFFFFF';
        octx.fillRect(0, 0, outW, outH);
        // Bleed: stretch the design's own edge pixels outward
        const b = BLEED_PX;
        octx.drawImage(design, 0, 0, w, 1, m, m - b, w, b); // top
        octx.drawImage(design, 0, h - 1, w, 1, m, m + h, w, b); // bottom
        octx.drawImage(design, 0, 0, 1, h, m - b, m, b, h); // left
        octx.drawImage(design, w - 1, 0, 1, h, m + w, m, b, h); // right
        octx.drawImage(design, 0, 0, 1, 1, m - b, m - b, b, b);
        octx.drawImage(design, w - 1, 0, 1, 1, m + w, m - b, b, b);
        octx.drawImage(design, 0, h - 1, 1, 1, m - b, m + h, b, b);
        octx.drawImage(design, w - 1, h - 1, 1, 1, m + w, m + h, b, b);
        octx.drawImage(design, m, m);
        drawCropMarks(octx, m, m, w, h, b, MARK_PX);
      }
    }

    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('This device could not prepare the PDF page.');

    if (useJpeg) {
      const jpg = await new Promise<Blob | null>((res) => out.toBlob((b) => res(b), 'image/jpeg', 0.92));
      if (!jpg) throw new Error(`Could not prepare page ${pageIndex + 1}.`);
      await pdf.addPage({
        width: outW,
        height: outH,
        pxWidth: outW,
        pxHeight: outH,
        kind: 'jpeg',
        data: new Uint8Array(await jpg.arrayBuffer()),
      });
    } else {
      const rgba = ctx.getImageData(0, 0, outW, outH).data;
      await pdf.addPage({
        width: outW,
        height: outH,
        pxWidth: outW,
        pxHeight: outH,
        kind: settings.colorMode === 'cmyk' ? 'cmyk' : 'rgb',
        data: settings.colorMode === 'cmyk' ? rgbaToCmyk(rgba) : rgbaToRgb(rgba),
      });
    }

    design.width = 1;
    design.height = 1;
    if (out !== design) {
      out.width = 1;
      out.height = 1;
    }
  }

  if (pdf.pages !== total) {
    throw new Error(`The PDF has ${pdf.pages} pages instead of ${total}, so it was not saved. Please try again.`);
  }
  return pdf.build();
}
