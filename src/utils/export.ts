/**
 * Litdom Batch Studio - Multi-Format Export Engine
 * High-quality PNG, JPG, Multi-Page PDF, and ZIP Archive Generation.
 */
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { PageDesign, ExportProgress } from '../types';
import { renderPageToCanvas } from './canvasRenderer';

/**
 * Trigger file download in browser
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export single page as PNG
 */
export async function exportSinglePagePNG(page: PageDesign, filename?: string): Promise<void> {
  const { canvas } = await renderPageToCanvas(page, { showBoundingBoxes: false });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate PNG image blob'));
        return;
      }
      const fname =
        filename || `litdom-page-${String(page.pageNumber).padStart(3, '0')}.png`;
      downloadBlob(blob, fname);
      resolve();
    }, 'image/png');
  });
}

/**
 * Export single page as JPG with quality parameter (0.1 - 1.0)
 */
export async function exportSinglePageJPG(
  page: PageDesign,
  quality: number = 0.92,
  filename?: string
): Promise<void> {
  const { canvas } = await renderPageToCanvas(page, { showBoundingBoxes: false });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to generate JPG image blob'));
          return;
        }
        const fname =
          filename || `litdom-page-${String(page.pageNumber).padStart(3, '0')}.jpg`;
        downloadBlob(blob, fname);
        resolve();
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Export all project pages into a single Multi-Page PDF document
 */
export async function exportProjectPDF(
  pages: PageDesign[],
  projectName: string,
  onProgress?: (progress: ExportProgress) => void
): Promise<void> {
  if (pages.length === 0) throw new Error('No pages to export.');

  const total = pages.length;
  let pdf: jsPDF | null = null;
  const failedFiles: string[] = [];

  for (let i = 0; i < total; i++) {
    const page = pages[i];
    const pageNumStr = String(page.pageNumber).padStart(3, '0');

    if (onProgress) {
      onProgress({
        total,
        current: i + 1,
        currentFileName: `Page ${page.pageNumber}`,
        status: 'pdf',
      });
    }

    try {
      const { canvas } = await renderPageToCanvas(page, { showBoundingBoxes: false });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
      const widthPt = (canvas.width * 72) / 96; // convert px to pt (default 96 dpi)
      const heightPt = (canvas.height * 72) / 96;

      if (i === 0) {
        pdf = new jsPDF({
          orientation,
          unit: 'pt',
          format: [widthPt, heightPt],
        });
        pdf.addImage(imgData, 'JPEG', 0, 0, widthPt, heightPt);
      } else if (pdf) {
        pdf.addPage([widthPt, heightPt], orientation);
        pdf.addImage(imgData, 'JPEG', 0, 0, widthPt, heightPt);
      }
    } catch (err: any) {
      console.error(`Failed to add page ${page.pageNumber} to PDF:`, err);
      failedFiles.push(`Page ${page.pageNumber}: ${err.message || 'Render failure'}`);
    }
  }

  if (!pdf) {
    throw new Error('Failed to create PDF document.');
  }

  if (failedFiles.length > 0 && failedFiles.length === total) {
    throw new Error(`All pages failed to export: ${failedFiles.join(', ')}`);
  }

  const sanitized = (projectName || 'litdom-batch')
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '_');
  pdf.save(`${sanitized}-document.pdf`);

  if (onProgress) {
    onProgress({
      total,
      current: total,
      currentFileName: 'Complete',
      status: failedFiles.length > 0 ? 'error' : 'completed',
      failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
    });
  }
}

/**
 * Export all pages as a ZIP archive with sequential filenames (e.g. litdom-001.png)
 */
export async function exportProjectZIP(
  pages: PageDesign[],
  projectName: string,
  format: 'png' | 'jpg' = 'png',
  quality: number = 0.92,
  onProgress?: (progress: ExportProgress) => void
): Promise<void> {
  if (pages.length === 0) throw new Error('No pages to export.');

  const zip = new JSZip();
  const total = pages.length;
  const failedFiles: string[] = [];
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const extension = format === 'png' ? 'png' : 'jpg';

  for (let i = 0; i < total; i++) {
    const page = pages[i];
    const seqNum = String(page.pageNumber).padStart(3, '0');
    const fileName = `litdom-${seqNum}.${extension}`;

    if (onProgress) {
      onProgress({
        total,
        current: i + 1,
        currentFileName: fileName,
        status: 'rendering',
      });
    }

    try {
      const { canvas } = await renderPageToCanvas(page, { showBoundingBoxes: false });
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Failed to create blob from canvas'));
          },
          mimeType,
          format === 'jpg' ? quality : undefined
        );
      });

      zip.file(fileName, blob);
    } catch (err: any) {
      console.error(`Failed to render ${fileName}:`, err);
      failedFiles.push(`${fileName}: ${err.message || 'Render failure'}`);
    }
  }

  if (onProgress) {
    onProgress({
      total,
      current: total,
      currentFileName: 'Packaging ZIP archive...',
      status: 'zipping',
    });
  }

  const zipBlob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => {
      // ZIP packing progress
    }
  );

  const sanitized = (projectName || 'litdom-batch')
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '_');
  downloadBlob(zipBlob, `${sanitized}-batch-${format}.zip`);

  if (onProgress) {
    onProgress({
      total,
      current: total,
      currentFileName: 'Download complete',
      status: failedFiles.length > 0 ? 'error' : 'completed',
      failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
    });
  }
}
