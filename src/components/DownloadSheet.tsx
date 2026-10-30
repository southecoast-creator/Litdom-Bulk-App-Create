/**
 * Litdom Batch Studio - Download Bottom Sheet
 * High-resolution PNG/JPG export for individual designs or sequential ZIP archive.
 */

import React, { useState } from 'react';
import {
  X,
  Download,
  FileArchive,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Project } from '../types';
import {
  exportSingleDesign,
  exportAllDesignsZip,
  triggerDownload,
  generateFilename,
  ExportFormat,
  ExportProgress,
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
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalPages = project.pages.length;
  const activePage = project.pages[activePageIndex];

  const handleExportSingle = async () => {
    if (!activePage) return;
    setIsExporting(true);
    setErrorMessage(null);

    try {
      const blob = await exportSingleDesign(
        project,
        activePageIndex,
        format,
        jpegQuality
      );
      const filename = generateFilename(activePage, activePageIndex, format);
      triggerDownload(blob, filename);
    } catch (err: any) {
      console.error('Export error:', err);
      setErrorMessage(err.message || 'Failed to export design.');
    } finally {
      setIsExporting(false);
    }
  };

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

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#17171C] border border-[#2D2D38] w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#262632] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
              <Download className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base text-[#FFF8E7]">
                Download Designs
              </h3>
              <p className="text-[11px] text-[#FFF8E7]/60">
                Full-resolution export with exact typography and styling
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
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Format Selector: PNG vs JPG */}
          <div className="space-y-2">
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
                  <span className="font-bold text-xs">PNG</span>
                  {format === 'png' && <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37]" />}
                </div>
                <span className="text-[10px] text-[#FFF8E7]/50">Lossless & sharpest text</span>
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
                  {format === 'jpeg' && <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37]" />}
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

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              onClick={handleExportSingle}
              disabled={isExporting || !activePage}
              className="w-full bg-[#1C1C24] hover:bg-[#262632] border border-[#333342] text-[#FFF8E7] font-semibold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all min-h-[44px] disabled:opacity-50"
            >
              <ImageIcon className="w-4 h-4 text-[#D4AF37]" />
              <span>Download Current Design ({activePage ? activePage.name : 'None'})</span>
            </button>

            <button
              onClick={handleExportZip}
              disabled={isExporting || totalPages === 0}
              className="w-full bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] hover:from-[#F4D58D] hover:to-[#D4AF37] text-[#0B0B0F] font-bold text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/20 transition-all min-h-[48px] active:scale-[0.99] disabled:opacity-50"
            >
              <FileArchive className="w-4 h-4" />
              <span>Download All {totalPages} Designs (ZIP)</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#262632] flex items-center justify-end">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-xs text-[#FFF8E7]/60 hover:text-[#FFF8E7] px-4 py-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
