/**
 * Litdom Batch Studio - Download Bottom Sheet
 * Phone Gallery saving via Web Share API with 2-step user gesture activation,
 * 10-design batch sharing, press-and-hold fallback grid, and secondary ZIP download.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileArchive,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Share2,
  Sparkles,
  Smartphone,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Project } from '../types';
import {
  exportSingleDesign,
  exportAllDesignsZip,
  exportDesignsToFiles,
  triggerDownload,
  generateFilename,
  ExportFormat,
  ExportProgress,
  RenderedDesignItem,
} from '../utils/downloadEngine';

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
  const [format, setFormat] = useState<ExportFormat>('png');
  const [jpegQuality] = useState(0.92);
  const [scope, setScope] = useState<'all' | 'single'>('all');

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Rendered items for Gallery flow
  const [renderedItems, setRenderedItems] = useState<RenderedDesignItem[] | null>(null);

  // Revoke preview URLs on unmount or reset
  useEffect(() => {
    return () => {
      if (renderedItems) {
        renderedItems.forEach((item) => {
          try {
            URL.revokeObjectURL(item.previewUrl);
          } catch {
            // safe fallback
          }
        });
      }
    };
  }, [renderedItems]);

  if (!isOpen) return null;

  const totalPages = project.pages.length;
  const activePage = project.pages[activePageIndex];

  // Test Web Share API file-sharing support
  const checkCanShareFiles = (files: File[]): boolean => {
    if (typeof navigator === 'undefined') return false;
    if (typeof navigator.share !== 'function') return false;
    if (typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare({ files });
    } catch {
      return false;
    }
  };

  const handleStartGalleryRender = async () => {
    if (totalPages === 0) return;
    setIsExporting(true);
    setErrorMessage(null);
    setShareFeedback(null);
    setRenderedItems(null);

    const indexesToRender =
      scope === 'single'
        ? [activePageIndex]
        : Array.from({ length: totalPages }, (_, i) => i);

    setProgress({
      current: 0,
      total: indexesToRender.length,
      statusText: `Preparing to render ${indexesToRender.length} design${
        indexesToRender.length > 1 ? 's' : ''
      } at full resolution…`,
    });

    try {
      const items = await exportDesignsToFiles(
        project,
        indexesToRender,
        format,
        jpegQuality,
        (p) => setProgress(p)
      );
      setRenderedItems(items);
      setProgress(null);
    } catch (err: any) {
      console.error('Gallery render error:', err);
      setErrorMessage(err.message || 'Failed to render designs for gallery.');
    } finally {
      setIsExporting(false);
    }
  };

  // Step 2 tap handler: triggers navigator.share strictly within the user tap event
  const handleShareBatch = async (files: File[], label: string) => {
    setErrorMessage(null);
    setShareFeedback(null);

    if (!checkCanShareFiles(files)) {
      setErrorMessage(
        'Direct file sharing is not supported on this browser. Use the press-and-hold options or ZIP download below.'
      );
      return;
    }

    try {
      await navigator.share({
        files,
        title: project.name,
        text: `Litdom Batch Studio - ${files.length} design${files.length > 1 ? 's' : ''}`,
      });
      setShareFeedback(`Shared ${files.length} design${files.length > 1 ? 's' : ''} successfully!`);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('navigator.share failed:', err);
        setErrorMessage(
          err.message ||
            'Could not complete gallery save. Use the press-and-hold option or download button below.'
        );
      }
    }
  };

  // Secondary Option: Direct ZIP export (saved in Downloads, not Gallery)
  const handleExportZip = async () => {
    if (totalPages === 0) return;
    setIsExporting(true);
    setErrorMessage(null);
    setProgress({ current: 0, total: totalPages, statusText: 'Initializing export…' });

    try {
      const zipBlob = await exportAllDesignsZip(
        project,
        format,
        jpegQuality,
        (p) => setProgress(p)
      );
      const zipName = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-batch.zip`;
      triggerDownload(zipBlob, zipName);
      setProgress(null);
    } catch (err: any) {
      console.error('ZIP Export error:', err);
      setErrorMessage(err.message || 'Failed to export designs to ZIP.');
    } finally {
      setIsExporting(false);
    }
  };

  // Split items into groups of 10 for Web Share API limits
  const createGroupsOfTen = (items: RenderedDesignItem[]) => {
    const groups: { label: string; items: RenderedDesignItem[]; startIndex: number; endIndex: number }[] = [];
    const chunkSize = 10;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const start = i + 1;
      const end = i + chunk.length;
      groups.push({
        label: items.length > 10 ? `Designs ${start}–${end}` : 'All Designs',
        items: chunk,
        startIndex: start,
        endIndex: end,
      });
    }
    return groups;
  };

  const itemGroups = renderedItems ? createGroupsOfTen(renderedItems) : [];
  const canShareAny =
    renderedItems && renderedItems.length > 0 && checkCanShareFiles([renderedItems[0].file]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#17171C] border border-[#2D2D38] w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#262632] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base text-[#FFF8E7]">
                Save to Phone Gallery
              </h3>
              <p className="text-[11px] text-[#FFF8E7]/60">
                100% original resolution with exact typography & layout
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 rounded-lg text-[#FFF8E7]/50 hover:text-white hover:bg-[#212128] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {shareFeedback && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{shareFeedback}</span>
            </div>
          )}

          {/* STEP 1: OPTIONS & INITIAL RENDER TRIGGER */}
          {!renderedItems && (
            <>
              {/* Target Scope: All Designs vs Current Design */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
                  Designs to Save
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    disabled={isExporting}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all min-h-[44px] ${
                      scope === 'all'
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#FFF8E7]'
                        : 'border-[#262632] bg-[#121217] text-[#FFF8E7]/60 hover:text-[#FFF8E7]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">All Designs</span>
                      {scope === 'all' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                      )}
                    </div>
                    <span className="text-[10px] text-[#FFF8E7]/50">
                      Entire batch ({totalPages} {totalPages === 1 ? 'design' : 'designs'})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('single')}
                    disabled={isExporting}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all min-h-[44px] ${
                      scope === 'single'
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#FFF8E7]'
                        : 'border-[#262632] bg-[#121217] text-[#FFF8E7]/60 hover:text-[#FFF8E7]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs truncate max-w-[120px]">
                        Design #{activePageIndex + 1}
                      </span>
                      {scope === 'single' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                      )}
                    </div>
                    <span className="text-[10px] text-[#FFF8E7]/50 truncate">
                      {activePage ? activePage.name : 'Current'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Format Selector: PNG vs JPG */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
                  Image Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat('png')}
                    disabled={isExporting}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all min-h-[44px] ${
                      format === 'png'
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#FFF8E7]'
                        : 'border-[#262632] bg-[#121217] text-[#FFF8E7]/60 hover:text-[#FFF8E7]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">PNG (Recommended)</span>
                      {format === 'png' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                      )}
                    </div>
                    <span className="text-[10px] text-[#FFF8E7]/50">
                      Lossless & crispest typography
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormat('jpeg')}
                    disabled={isExporting}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all min-h-[44px] ${
                      format === 'jpeg'
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#FFF8E7]'
                        : 'border-[#262632] bg-[#121217] text-[#FFF8E7]/60 hover:text-[#FFF8E7]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">JPG</span>
                      {format === 'jpeg' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                      )}
                    </div>
                    <span className="text-[10px] text-[#FFF8E7]/50">Smaller file size</span>
                  </button>
                </div>
              </div>

              {/* Progress Indicator */}
              {progress && (
                <div className="bg-[#121217] border border-[#2D2D3A] rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#D4AF37] flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {progress.statusText}
                    </span>
                    <span className="font-mono text-[#FFF8E7]/70">
                      {Math.round((progress.current / progress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#21212A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] transition-all duration-200"
                      style={{
                        width: `${Math.round((progress.current / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Primary Action Button: "Save to gallery" */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleStartGalleryRender}
                  disabled={isExporting || totalPages === 0}
                  className="w-full bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] hover:from-[#F4D58D] hover:to-[#D4AF37] text-[#0B0B0F] font-bold text-sm py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/20 transition-all min-h-[50px] active:scale-[0.99] disabled:opacity-50"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>
                    Save to gallery ({scope === 'all' ? `${totalPages} designs` : '1 design'})
                  </span>
                </button>
                <p className="text-[10px] text-center text-[#FFF8E7]/50 leading-relaxed">
                  Renders first at exact native resolution ({activePage?.width || 1000}×
                  {activePage?.height || 1000}px), then prompts you to tap and save directly to your
                  phone's photo gallery.
                </p>

                {/* Secondary Option: ZIP (saved in Downloads, not Gallery) */}
                <div className="pt-3 border-t border-[#262632]/80">
                  <button
                    type="button"
                    onClick={handleExportZip}
                    disabled={isExporting || totalPages === 0}
                    className="w-full bg-[#1C1C24] hover:bg-[#262632] border border-[#333342] text-[#FFF8E7]/80 hover:text-white text-xs font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all min-h-[44px] disabled:opacity-50"
                  >
                    <FileArchive className="w-4 h-4 text-[#D4AF37]" />
                    <span>ZIP (saved in Downloads, not Gallery)</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* STEP 2: FINISHED RENDERING - TAP TO SAVE TO GALLERY */}
          {renderedItems && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#FFF8E7]">
                    {renderedItems.length} {renderedItems.length > 1 ? 'Designs' : 'Design'} Rendered at Full Resolution
                  </div>
                  <div className="text-[10px] text-emerald-300/80">
                    Exact resolution ({renderedItems[0].page.width}×{renderedItems[0].page.height}px)
                  </div>
                </div>
              </div>

              {/* Tap to save button(s) - split in groups of 10 if large batch */}
              {canShareAny ? (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
                    Step 2: Tap to Save to Gallery
                  </div>

                  {itemGroups.map((group, gIdx) => (
                    <button
                      key={gIdx}
                      type="button"
                      onClick={() =>
                        handleShareBatch(
                          group.items.map((i) => i.file),
                          group.label
                        )
                      }
                      className="w-full bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] hover:from-[#F4D58D] hover:to-[#D4AF37] text-[#0B0B0F] font-bold text-sm py-3.5 px-4 rounded-xl flex items-center justify-between shadow-lg shadow-[#D4AF37]/20 transition-all min-h-[50px] active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4" />
                        <span>Tap to save {group.label} to Gallery</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ))}

                  <p className="text-[10px] text-[#FFF8E7]/50 text-center leading-relaxed">
                    💡 When prompted, select <strong>Save to Photos</strong>, <strong>Save Image</strong>, or your device gallery.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-[#1C1C24] border border-[#333342] rounded-xl text-xs text-[#FFF8E7]/70 space-y-1">
                  <span className="font-bold text-[#D4AF37] block">
                    Direct Gallery Sharing Note
                  </span>
                  <span>
                    Your current browser session doesn't allow one-tap gallery sharing. Use the
                    press-and-hold instructions or direct download buttons below.
                  </span>
                </div>
              )}

              {/* Fallback Grid: Press and hold an image, then Save image */}
              <div className="space-y-2 pt-2 border-t border-[#262632]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
                    Gallery Fallback: Press & Hold
                  </span>
                  <span className="text-[10px] text-[#FFF8E7]/40">
                    Works on all phones
                  </span>
                </div>

                <div className="p-2.5 bg-[#121217] rounded-xl border border-[#262632] text-[11px] text-[#FFF8E7]/70 leading-relaxed">
                  📱 <strong>Tip for mobile:</strong> Press and hold any image below, then tap{' '}
                  <span className="text-[#D4AF37] font-semibold">"Save image"</span> or{' '}
                  <span className="text-[#D4AF37] font-semibold">"Add to Photos"</span> to save it
                  directly to your gallery.
                </div>

                <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1">
                  {renderedItems.map((item) => (
                    <div
                      key={item.pageIndex}
                      className="bg-[#121217] border border-[#2D2D38] rounded-xl p-2 flex flex-col items-center gap-2 text-center"
                    >
                      <img
                        src={item.previewUrl}
                        alt={item.page.name}
                        className="w-full h-28 object-contain rounded-lg bg-[#0B0B0F]"
                      />
                      <div className="w-full min-w-0">
                        <div className="text-[10px] font-mono text-[#D4AF37] font-bold truncate">
                          #{item.pageIndex + 1} {item.page.name}
                        </div>
                        <div className="text-[9px] text-[#FFF8E7]/40 font-mono">
                          {item.page.width}×{item.page.height}px
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => triggerDownload(item.blob, item.filename)}
                        className="w-full py-1.5 px-2 bg-[#21212A] hover:bg-[#2B2B38] text-[10px] font-semibold text-[#FFF8E7] rounded-lg border border-[#333342] flex items-center justify-center gap-1 transition-colors min-h-[32px]"
                      >
                        <Download className="w-3 h-3 text-[#D4AF37]" />
                        <span>Download</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reset / Render Again & Secondary ZIP */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRenderedItems(null);
                    setShareFeedback(null);
                  }}
                  className="flex-1 py-2.5 px-3 bg-[#1C1C24] hover:bg-[#262632] border border-[#333342] text-xs font-semibold text-[#FFF8E7]/80 hover:text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors min-h-[40px]"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Render Again</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportZip}
                  className="flex-1 py-2.5 px-3 bg-[#1C1C24] hover:bg-[#262632] border border-[#333342] text-xs font-semibold text-[#FFF8E7]/80 hover:text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors min-h-[40px]"
                >
                  <FileArchive className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>ZIP (in Downloads)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#262632] flex items-center justify-end">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-xs text-[#FFF8E7]/60 hover:text-[#FFF8E7] px-4 py-2 min-h-[36px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
