/**
 * Litdom Batch Studio - Stage 7: Download & Export Hub
 * High-res PNG, JPG (quality slider), Multi-page PDF, and sequential ZIP downloads with progress bar.
 */
import React, { useState } from 'react';
import {
  DownloadCloud,
  FileImage,
  FileText,
  Archive,
  CheckCircle2,
  AlertTriangle,
  Settings2,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { Project, PageDesign, ExportProgress } from '../types';
import {
  exportSinglePagePNG,
  exportSinglePageJPG,
  exportProjectPDF,
  exportProjectZIP,
} from '../utils/export';

interface DownloadViewProps {
  project: Project;
  activePageIndex: number;
}

export const DownloadView: React.FC<DownloadViewProps> = ({
  project,
  activePageIndex,
}) => {
  const activePage = project.pages[activePageIndex] || project.pages[0];

  const [jpgQuality, setJpgQuality] = useState(0.92);
  const [zipFormat, setZipFormat] = useState<'png' | 'jpg'>('png');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null);

  if (project.pages.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-3">
        <h3 className="text-base font-semibold text-[#FFF8E7]">No designs to export</h3>
        <p className="text-xs text-[#FFF8E7]/60">
          Upload backgrounds and configure designs before exporting artwork.
        </p>
      </div>
    );
  }

  // Handle Single PNG
  const handleExportPNG = async () => {
    try {
      setIsExporting(true);
      setExportErrorMessage(null);
      setExportSuccessMessage(null);
      await exportSinglePagePNG(activePage);
      setExportSuccessMessage(`Page ${activePage.pageNumber} exported as PNG.`);
    } catch (err: any) {
      setExportErrorMessage(`PNG export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Single JPG
  const handleExportJPG = async () => {
    try {
      setIsExporting(true);
      setExportErrorMessage(null);
      setExportSuccessMessage(null);
      await exportSinglePageJPG(activePage, jpgQuality);
      setExportSuccessMessage(
        `Page ${activePage.pageNumber} exported as JPG (${Math.round(jpgQuality * 100)}% quality).`
      );
    } catch (err: any) {
      setExportErrorMessage(`JPG export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Multi-Page PDF
  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      setExportErrorMessage(null);
      setExportSuccessMessage(null);
      setExportProgress({
        total: project.pages.length,
        current: 0,
        currentFileName: 'Initializing PDF document...',
        status: 'pdf',
      });

      await exportProjectPDF(project.pages, project.name, (progress) => {
        setExportProgress(progress);
      });

      setExportSuccessMessage(
        `Successfully generated multi-page PDF with all ${project.pages.length} pages!`
      );
    } catch (err: any) {
      setExportErrorMessage(`PDF export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  // Handle ZIP Archive
  const handleExportZIP = async () => {
    try {
      setIsExporting(true);
      setExportErrorMessage(null);
      setExportSuccessMessage(null);
      setExportProgress({
        total: project.pages.length,
        current: 0,
        currentFileName: 'Starting batch export...',
        status: 'rendering',
      });

      await exportProjectZIP(
        project.pages,
        project.name,
        zipFormat,
        jpgQuality,
        (progress) => {
          setExportProgress(progress);
        }
      );

      setExportSuccessMessage(
        `Successfully downloaded ZIP archive containing all ${project.pages.length} sequential files!`
      );
    } catch (err: any) {
      setExportErrorMessage(`ZIP export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Top Banner */}
      <div className="pb-4 border-b border-[#212128]">
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#FFF8E7]">
          Export & Download Hub
        </h2>
        <p className="text-xs text-[#F4D58D]/70 mt-0.5">
          Generate individual high-resolution PNGs/JPGs, unified multi-page PDFs, or sequential ZIP archives.
        </p>
      </div>

      {/* Progress Bar (During active export) */}
      {isExporting && exportProgress && (
        <div className="p-4 bg-[#17171C] border border-[#D4AF37] rounded-2xl shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#FFF8E7] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] animate-ping" />
              {exportProgress.status === 'pdf'
                ? 'Compiling Multi-Page PDF...'
                : exportProgress.status === 'zipping'
                ? 'Compressing ZIP Archive...'
                : 'Rendering Design Canvas...'}
            </span>
            <span className="font-mono text-[#D4AF37]">
              {exportProgress.current} / {exportProgress.total} Pages
            </span>
          </div>

          <div className="w-full bg-[#0B0B0F] h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] h-full transition-all duration-300"
              style={{
                width: `${Math.round(
                  (exportProgress.current / Math.max(1, exportProgress.total)) * 100
                )}%`,
              }}
            />
          </div>

          <p className="text-[11px] text-[#FFF8E7]/60 truncate font-mono">
            {exportProgress.currentFileName}
          </p>
        </div>
      )}

      {/* Success Notification */}
      {exportSuccessMessage && (
        <div className="p-3.5 bg-emerald-950/40 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-center gap-2 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{exportSuccessMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {exportErrorMessage && (
        <div className="p-3.5 bg-red-950/40 border border-red-800 text-red-200 rounded-xl text-xs flex items-center gap-2 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{exportErrorMessage}</span>
        </div>
      )}

      {/* Export Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Batch ZIP Download */}
        <div className="bg-[#17171C] border border-[#212128] hover:border-[#8C7625] transition-all rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#212128] text-[#D4AF37] flex items-center justify-center">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#FFF8E7]">
                Batch ZIP Archive ({project.pages.length} Files)
              </h3>
              <p className="text-xs text-[#FFF8E7]/60 mt-1">
                Downloads a single compressed ZIP archive containing all pages saved with sequential filenames (<span className="text-[#F4D58D] font-mono">litdom-001.png</span>, <span className="text-[#F4D58D] font-mono">litdom-002.png</span>, ...).
              </p>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <span className="text-xs text-[#8C7625]">Format:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZipFormat('png')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    zipFormat === 'png'
                      ? 'bg-[#D4AF37] text-[#0B0B0F]'
                      : 'bg-[#0B0B0F] border border-[#212128] text-[#FFF8E7]/70'
                  }`}
                >
                  PNG (Lossless)
                </button>
                <button
                  onClick={() => setZipFormat('jpg')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    zipFormat === 'jpg'
                      ? 'bg-[#D4AF37] text-[#0B0B0F]'
                      : 'bg-[#0B0B0F] border border-[#212128] text-[#FFF8E7]/70'
                  }`}
                >
                  JPG (Compact)
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleExportZIP}
            disabled={isExporting}
            className="w-full py-3 px-4 bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs rounded-xl transition-all shadow-md active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <DownloadCloud className="w-4 h-4" />
            <span>Download All as ZIP Archive</span>
          </button>
        </div>

        {/* Card 2: Multi-Page PDF Document */}
        <div className="bg-[#17171C] border border-[#212128] hover:border-[#8C7625] transition-all rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#212128] text-[#D4AF37] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#FFF8E7]">
                Multi-Page PDF Document
              </h3>
              <p className="text-xs text-[#FFF8E7]/60 mt-1">
                Compiles all {project.pages.length} design pages into a single high-fidelity PDF presentation, preserving individual page aspect ratios and font alignments.
              </p>
            </div>

            <div className="text-[11px] text-[#F4D58D]/70 bg-[#0B0B0F] p-2.5 rounded-lg border border-[#212128]">
              Includes {project.pages.length} pages rendered with embedded background imagery and vector-calibrated font layout.
            </div>
          </div>

          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="w-full py-3 px-4 bg-[#212128] hover:bg-[#2a2a35] border border-[#D4AF37]/60 hover:border-[#D4AF37] text-[#F4D58D] font-bold text-xs rounded-xl transition-all shadow-md active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4 text-[#D4AF37]" />
            <span>Generate Multi-Page PDF</span>
          </button>
        </div>

        {/* Card 3: Single Page PNG */}
        <div className="bg-[#17171C] border border-[#212128] rounded-2xl p-5 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#FFF8E7] flex items-center gap-2">
                <FileImage className="w-4 h-4 text-[#D4AF37]" />
                <span>Single Page PNG (Page {activePage.pageNumber})</span>
              </span>
              <span className="text-[10px] text-[#8C7625] font-mono">
                {activePage.originalWidth} × {activePage.originalHeight} px
              </span>
            </div>
            <p className="text-[11px] text-[#FFF8E7]/50">
              Lossless PNG format with crisp text rendering and transparent background support where applicable.
            </p>
          </div>

          <button
            onClick={handleExportPNG}
            disabled={isExporting}
            className="w-full py-2 px-3 bg-[#0B0B0F] hover:bg-[#212128] border border-[#212128] hover:border-[#8C7625] text-[#FFF8E7] text-xs font-semibold rounded-lg transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <DownloadCloud className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Download Page {activePage.pageNumber} as PNG</span>
          </button>
        </div>

        {/* Card 4: Single Page JPG with Quality Slider */}
        <div className="bg-[#17171C] border border-[#212128] rounded-2xl p-5 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#FFF8E7] flex items-center gap-2">
                <FileImage className="w-4 h-4 text-[#D4AF37]" />
                <span>Single Page JPG (Page {activePage.pageNumber})</span>
              </span>
              <span className="text-[10px] text-[#D4AF37] font-mono">
                {Math.round(jpgQuality * 100)}% Quality
              </span>
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-[#FFF8E7]/60 mb-0.5">
                <span>Compression Quality</span>
                <span>{jpgQuality >= 0.9 ? 'Ultra High' : 'Standard'}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.05"
                value={jpgQuality}
                onChange={(e) => setJpgQuality(parseFloat(e.target.value))}
                className="w-full accent-[#D4AF37] h-1.5 bg-[#0B0B0F] rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={handleExportJPG}
            disabled={isExporting}
            className="w-full py-2 px-3 bg-[#0B0B0F] hover:bg-[#212128] border border-[#212128] hover:border-[#8C7625] text-[#FFF8E7] text-xs font-semibold rounded-lg transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <DownloadCloud className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Download Page {activePage.pageNumber} as JPG</span>
          </button>
        </div>
      </div>
    </div>
  );
};
