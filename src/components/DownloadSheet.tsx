/**
 * Litdom Batch Studio - Download Modal & Sheet
 * Exact visual match to IMG_1495 (2).pdf Pages 6, 7, 8, 9:
 * - File Type dropdown: .png, .jpg, .jpeg, .webp, .pdf
 * - Size row with "Edit" opening "Enter Width / Enter Height" popup (Page 8)
 * - PDF Settings row with "Edit" opening Digital, RGB, CMYK, Flatten, Crop Marks & Bleed toggles (Page 9)
 * - Quality options: Low, Medium, High, Limit
 * - Page selection: Page + Page number, All, Select (with visual thumbnail picker)
 * - True CMYK / High-res download execution
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  ChevronDown,
  Check,
  AlertTriangle,
  RefreshCw,
  Sliders,
  CheckSquare,
  Square,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';
import { Project, PdfExportSettings } from '../types';
import {
  exportSingleDesign,
  exportAllDesignsZip,
  exportDesignsToPdf,
  exportDesignsToFiles,
  triggerDownload,
  ExportFormat,
  ExportProgress,
} from '../utils/downloadEngine';
import { getThumbnailBlob, createManagedObjectUrl } from '../utils/db';

interface DownloadSheetProps {
  project: Project;
  activePageIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadSheet: React.FC<DownloadSheetProps> = ({
  project,
  activePageIndex,
  isOpen,
  onClose,
}) => {
  // File format: .png | .jpg | .jpeg | .webp | .pdf
  const [fileType, setFileType] = useState<'.png' | '.jpg' | '.jpeg' | '.webp' | '.pdf'>('.png');

  // Quality: Low (0.6) | Medium (0.85) | High (1.0) | Limit (custom target)
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'limit'>('high');

  // Page selection mode: 'current' | 'all' | 'custom'
  const [pageMode, setPageMode] = useState<'current' | 'all' | 'custom'>('all');
  const [selectedPageIndices, setSelectedPageIndices] = useState<Set<number>>(
    new Set(Array.from({ length: project.pages.length }, (_, i) => i))
  );

  // Size editing popup (Page 8)
  const activePage = project.pages[activePageIndex];
  const [customWidth, setCustomWidth] = useState<number>(activePage?.width || 1080);
  const [customHeight, setCustomHeight] = useState<number>(activePage?.height || 1920);
  const [isSizeEditOpen, setIsSizeEditOpen] = useState(false);
  const [sharp2x, setSharp2x] = useState(false);

  // PDF Settings popup (Page 9)
  const [isPdfSettingsOpen, setIsPdfSettingsOpen] = useState(false);
  const [pdfSettings, setPdfSettings] = useState<PdfExportSettings>({
    colorMode: 'digital',
    flatten: false,
    cropMarksAndBleed: false,
  });

  // Export State & Progress
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Thumbnail URLs for custom page selection modal
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [isThumbnailPickerOpen, setIsThumbnailPickerOpen] = useState(false);

  useEffect(() => {
    if (activePage) {
      setCustomWidth(activePage.width || 1080);
      setCustomHeight(activePage.height || 1920);
    }
  }, [activePageIndex, activePage]);

  // Load thumbnails when custom picker opens
  useEffect(() => {
    if (isThumbnailPickerOpen) {
      const loadThumbs = async () => {
        const map: Record<string, string> = {};
        for (const p of project.pages) {
          if (p.imageId) {
            const blob = await getThumbnailBlob(p.imageId);
            if (blob) {
              map[p.id] = createManagedObjectUrl(blob);
            }
          }
        }
        setThumbUrls(map);
      };
      loadThumbs();
    }
  }, [isThumbnailPickerOpen, project.pages]);

  if (!isOpen) return null;

  const getQualityNumeric = () => {
    switch (quality) {
      case 'low': return 0.6;
      case 'medium': return 0.85;
      case 'high': return 1.0;
      case 'limit': return 0.75;
    }
  };

  const getFormatInternal = (): ExportFormat => {
    if (fileType === '.pdf') return 'pdf';
    if (fileType === '.jpg' || fileType === '.jpeg') return 'jpeg';
    if (fileType === '.webp') return 'webp';
    return 'png';
  };

  const handleExecuteDownload = async () => {
    setIsExporting(true);
    setErrorMessage(null);

    const pagesToExport: number[] =
      pageMode === 'current'
        ? [activePageIndex]
        : pageMode === 'all'
        ? Array.from({ length: project.pages.length }, (_, i) => i)
        : Array.from(selectedPageIndices).sort((a, b) => a - b);

    if (pagesToExport.length === 0) {
      setErrorMessage('Please select at least one page to export.');
      setIsExporting(false);
      return;
    }

    try {
      const cleanProjectName = project.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'litdom_export';

      if (fileType === '.pdf') {
        // Multi-page or single-page PDF with settings
        const pdfBlob = await exportDesignsToPdf(
          project,
          pagesToExport,
          pdfSettings,
          (p) => setProgress(p)
        );
        triggerDownload(pdfBlob, `${cleanProjectName}.pdf`);
      } else {
        const fmt = getFormatInternal();
        const qual = getQualityNumeric();
        // Only force a size when the person changed it; otherwise every page keeps its own native size
        const sizeChanged =
          !!activePage && (customWidth !== activePage.width || customHeight !== activePage.height);
        const customDim = sizeChanged
          ? { width: customWidth, height: customHeight }
          : sharp2x
          ? { scale: 2 }
          : undefined;

        if (pagesToExport.length === 1) {
          // Single Image download
          const blob = await exportSingleDesign(
            project,
            pagesToExport[0],
            fmt,
            qual,
            customDim
          );
          const ext = fileType === '.jpg' ? 'jpg' : fileType === '.jpeg' ? 'jpeg' : fileType === '.webp' ? 'webp' : 'png';
          triggerDownload(blob, `${cleanProjectName}_page_${pagesToExport[0] + 1}.${ext}`);
        } else {
          // Multiple Images -> ZIP
          const zipBlob = await exportAllDesignsZip(
            project,
            fmt,
            qual,
            customDim,
            (p) => setProgress(p)
          );
          triggerDownload(zipBlob, `${cleanProjectName}_batch.zip`);
        }
      }

      setProgress(null);
      setIsExporting(false);
      onClose();
    } catch (err: any) {
      console.error('Export error:', err);
      setErrorMessage(err.message || 'Failed to complete export.');
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      {/* Download Card Container: matches IMG_1495 (2).pdf Page 6 & 7 */}
      <div className="w-full max-w-sm sm:max-w-md bg-[#F4D58D] text-black rounded-3xl p-6 shadow-2xl flex flex-col gap-4 relative border-2 border-[#D4AF37]">
        {/* Cancel Button at top */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-black/60 hover:text-black p-1 rounded-full hover:bg-black/10 transition-colors"
          title="Cancel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. File Type Selector Dropdown (Page 6 & 7) */}
        <div className="flex flex-col gap-1.5 pt-2">
          <label className="text-xs font-semibold text-black/80">File Type</label>
          <div className="relative flex items-center">
            <div className="absolute left-3.5 z-10 pointer-events-none text-[#D4AF37]">
              {fileType === '.pdf' ? (
                <FileText className="w-4 h-4" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
            </div>
            <select
              value={fileType}
              onChange={(e) => {
                setFileType(e.target.value as any);
                setIsSizeEditOpen(false);
                setIsPdfSettingsOpen(false);
              }}
              className="w-full bg-black text-white font-bold text-sm pl-10 pr-10 py-3 rounded-2xl appearance-none focus:outline-none cursor-pointer shadow-md"
            >
              <option value=".png">PNG Image (.png)</option>
              <option value=".jpg">JPG Image (.jpg)</option>
              <option value=".jpeg">JPEG Image (.jpeg)</option>
              <option value=".webp">WebP Image (.webp)</option>
              <option value=".pdf">PDF Document (.pdf)</option>
            </select>
            <ChevronDown className="w-5 h-5 text-white absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {fileType !== '.pdf' && (
          <button
            onClick={() => setSharp2x(!sharp2x)}
            className={`w-full flex items-center justify-between text-xs font-bold rounded-xl px-3 py-2 border-2 border-black ${sharp2x ? 'bg-black text-[#F4D58D]' : 'bg-transparent text-black'}`}
          >
            <span>Extra sharp (2&times; size)</span>
            <span>{sharp2x ? 'ON' : 'OFF'}</span>
          </button>
        )}

        {/* 2. Size or Setting Row */}
        {fileType !== '.pdf' ? (
          /* Image Size Row with Edit (Page 6) */
          <div className="relative flex items-center justify-between text-xs font-medium text-black pt-1">
            <span>
              Size <span className="font-mono font-bold">.{customWidth}px by {customHeight}px</span>
            </span>
            <button
              onClick={() => setIsSizeEditOpen(!isSizeEditOpen)}
              className="font-bold underline text-black hover:text-amber-900"
            >
              Edit
            </button>

            {/* Popup on Page 8: Size Editing */}
            {isSizeEditOpen && (
              <div className="absolute right-0 top-6 z-20 w-52 bg-[#F4D58D] border-2 border-black rounded-2xl p-3 shadow-xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>Custom Size</span>
                  <button onClick={() => setIsSizeEditOpen(false)} className="text-black/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(100, parseInt(e.target.value) || 100))}
                    className="w-full bg-black text-white text-xs px-2 py-1.5 rounded-xl font-mono text-center"
                    placeholder="Width"
                  />
                  <input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(100, parseInt(e.target.value) || 100))}
                    className="w-full bg-black text-white text-xs px-2 py-1.5 rounded-xl font-mono text-center"
                    placeholder="Height"
                  />
                </div>
                <button
                  onClick={() => setIsSizeEditOpen(false)}
                  className="bg-black text-white font-bold text-xs py-1.5 rounded-xl hover:bg-black/80 transition-colors"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        ) : (
          /* PDF Setting Row with Edit (Page 7) */
          <div className="relative flex items-center justify-between text-xs font-medium text-black pt-1">
            <span>Setting</span>
            <button
              onClick={() => setIsPdfSettingsOpen(!isPdfSettingsOpen)}
              className="font-bold underline text-black hover:text-amber-900"
            >
              Edit
            </button>

            {/* Popup on Page 9: PDF Settings with Toggles */}
            {isPdfSettingsOpen && (
              <div className="absolute right-0 top-6 z-20 w-60 bg-[#D4AF37] border-2 border-black rounded-2xl p-4 shadow-2xl flex flex-col gap-2 text-white">
                <div className="flex items-center justify-between text-xs font-bold text-black border-b border-black/20 pb-1.5">
                  <span>PDF Settings</span>
                  <button onClick={() => setIsPdfSettingsOpen(false)} className="text-black">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Digital / RGB / CMYK (Mutually Exclusive Rules from Brief) */}
                <div className="flex items-center justify-between bg-black px-3 py-1.5 rounded-full text-xs">
                  <span>Digital</span>
                  <input
                    type="checkbox"
                    checked={pdfSettings.colorMode === 'digital'}
                    onChange={() => setPdfSettings({ ...pdfSettings, colorMode: 'digital' })}
                    className="w-4 h-4 accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between bg-black px-3 py-1.5 rounded-full text-xs">
                  <span>RGB</span>
                  <input
                    type="checkbox"
                    checked={pdfSettings.colorMode === 'rgb'}
                    onChange={() => setPdfSettings({ ...pdfSettings, colorMode: 'rgb' })}
                    className="w-4 h-4 accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between bg-black px-3 py-1.5 rounded-full text-xs">
                  <span>CMYK</span>
                  <input
                    type="checkbox"
                    checked={pdfSettings.colorMode === 'cmyk'}
                    onChange={() => setPdfSettings({ ...pdfSettings, colorMode: 'cmyk' })}
                    className="w-4 h-4 accent-amber-400 cursor-pointer"
                  />
                </div>

                {/* Flatten (Independent) */}
                <div className="flex items-center justify-between bg-black px-3 py-1.5 rounded-full text-xs">
                  <span>Flatten</span>
                  <input
                    type="checkbox"
                    checked={pdfSettings.flatten}
                    onChange={(e) => setPdfSettings({ ...pdfSettings, flatten: e.target.checked })}
                    className="w-4 h-4 accent-amber-400 cursor-pointer"
                  />
                </div>

                {/* Crop Marks & Bleed (Independent) */}
                <div className="flex items-center justify-between bg-black px-3 py-2 rounded-2xl text-xs">
                  <span className="leading-tight">Crop Marks & Bleed</span>
                  <input
                    type="checkbox"
                    checked={pdfSettings.cropMarksAndBleed}
                    onChange={(e) => setPdfSettings({ ...pdfSettings, cropMarksAndBleed: e.target.checked })}
                    className="w-4 h-4 accent-amber-400 cursor-pointer shrink-0 ml-2"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Quality Row (Page 6: Low, Medium, High, Limit) */}
        {fileType !== '.pdf' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-black/80">Quality</span>
            <div className="grid grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'limit'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`py-2 rounded-full text-xs font-bold capitalize transition-all ${
                    quality === q
                      ? 'bg-black text-white shadow-md'
                      : 'bg-black/20 text-black hover:bg-black/30'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 4. Select Page Row (Page 6 & 7: Page + Page number, All, Select) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-black/80">Select Page:</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setPageMode('current')}
              className={`py-2 px-2 rounded-2xl text-[11px] font-bold leading-tight transition-all text-center ${
                pageMode === 'current'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-black/20 text-black hover:bg-black/30'
              }`}
            >
              Page {activePageIndex + 1}
            </button>
            <button
              onClick={() => setPageMode('all')}
              className={`py-2 px-2 rounded-2xl text-xs font-bold transition-all text-center ${
                pageMode === 'all'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-black/20 text-black hover:bg-black/30'
              }`}
            >
              All
            </button>
            <button
              onClick={() => {
                setPageMode('custom');
                setIsThumbnailPickerOpen(true);
              }}
              className={`py-2 px-2 rounded-2xl text-xs font-bold transition-all text-center ${
                pageMode === 'custom'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-black/20 text-black hover:bg-black/30'
              }`}
            >
              Select
            </button>
          </div>
          {pageMode === 'custom' && (
            <span className="text-[10px] text-black/70 font-semibold text-center">
              {selectedPageIndices.size} page(s) selected for download
            </span>
          )}
        </div>

        {errorMessage && (
          <div className="p-2.5 bg-red-900 text-white rounded-xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-300" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Progress Bar when exporting */}
        {isExporting && progress && (
          <div className="space-y-1 bg-black/10 p-3 rounded-2xl">
            <div className="flex items-center justify-between text-[11px] font-bold text-black">
              <span>{progress.statusText}</span>
              <span>
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="w-full h-2 bg-black/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-black rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 5. Big Download Button (Pages 6 & 7) */}
        <button
          onClick={handleExecuteDownload}
          disabled={isExporting}
          className="w-full bg-black hover:bg-black/85 text-white font-bold text-sm py-3.5 rounded-full transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
        >
          {isExporting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Generating Export…</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 text-amber-400" />
              <span>Download</span>
            </>
          )}
        </button>
      </div>

      {/* Custom Page Thumbnail Selector Modal */}
      {isThumbnailPickerOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#16161D] text-[#FFF8E7] rounded-3xl p-5 border border-[#D4AF37] shadow-2xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-[#FFF8E7]">Select Pages to Export</h3>
              <button onClick={() => setIsThumbnailPickerOpen(false)} className="text-white/60 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 overflow-y-auto p-1">
              {project.pages.map((p, idx) => {
                const isSelected = selectedPageIndices.has(idx);
                const thumb = thumbUrls[p.id];

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      const next = new Set(selectedPageIndices);
                      if (isSelected) next.delete(idx);
                      else next.add(idx);
                      setSelectedPageIndices(next);
                    }}
                    className={`cursor-pointer rounded-2xl overflow-hidden border-2 transition-all p-1.5 flex flex-col items-center gap-1.5 ${
                      isSelected ? 'border-[#D4AF37] bg-[#D4AF37]/20 shadow-lg' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="aspect-[3/4] w-full bg-black/40 rounded-xl overflow-hidden flex items-center justify-center">
                      {thumb ? (
                        <img src={thumb} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-white/40">Page {idx + 1}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-semibold">
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[#D4AF37]" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-white/40" />
                      )}
                      <span>Page {idx + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setIsThumbnailPickerOpen(false)}
              className="w-full bg-[#D4AF37] text-black font-bold text-xs py-2.5 rounded-xl hover:bg-[#F4D58D]"
            >
              Done ({selectedPageIndices.size} Selected)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
