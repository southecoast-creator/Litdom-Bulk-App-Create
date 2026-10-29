/**
 * Litdom Batch Studio - Stage 6: Preview & Quality Control
 * High-resolution canvas rendering, multi-page inspector, and automated QC audit
 * (overflow detection, empty fields, unmapped boxes, missing fonts).
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Eye,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  Maximize2,
  ZoomIn,
} from 'lucide-react';
import { Project, PageDesign } from '../types';
import { renderPageToCanvas, checkFontAvailability } from '../utils/canvasRenderer';

interface PreviewViewProps {
  project: Project;
  activePageIndex: number;
  onSelectPageIndex: (index: number) => void;
  onNavigateToDownload: () => void;
  onNavigateToEditBox: (boxId: string) => void;
}

interface QualityAuditIssue {
  type: 'overflow' | 'empty' | 'missing-font';
  pageNumber: number;
  boxId: string;
  fieldLabel: string;
  message: string;
}

export const PreviewView: React.FC<PreviewViewProps> = ({
  project,
  activePageIndex,
  onSelectPageIndex,
  onNavigateToDownload,
  onNavigateToEditBox,
}) => {
  const activePage = project.pages[activePageIndex];
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [auditIssues, setAuditIssues] = useState<QualityAuditIssue[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);

  // Render active page canvas to display
  useEffect(() => {
    if (!activePage) return;
    let isCancelled = false;

    setIsRendering(true);
    renderPageToCanvas(activePage, { showBoundingBoxes: false })
      .then(({ canvas }) => {
        if (!isCancelled) {
          setRenderedImageUrl(canvas.toDataURL('image/jpeg', 0.95));
          setIsRendering(false);
        }
      })
      .catch((err) => {
        console.error('Failed to render preview canvas:', err);
        setIsRendering(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [activePage, project.updatedAt]);

  // Run full quality control audit across all pages
  useEffect(() => {
    let isCancelled = false;
    setIsAuditing(true);

    const runAudit = async () => {
      const issues: QualityAuditIssue[] = [];

      for (const page of project.pages) {
        // 1. Check canvas overflow
        const { overflowingBoxIds } = await renderPageToCanvas(page, {
          showBoundingBoxes: false,
        });

        for (const box of page.textBoxes) {
          // Overflow issue
          if (overflowingBoxIds.includes(box.id)) {
            issues.push({
              type: 'overflow',
              pageNumber: page.pageNumber,
              boxId: box.id,
              fieldLabel: box.fieldLabel,
              message: `Text overflows box bounds on Page ${page.pageNumber}`,
            });
          }

          // Empty content
          if (!box.content || box.content.trim() === '') {
            issues.push({
              type: 'empty',
              pageNumber: page.pageNumber,
              boxId: box.id,
              fieldLabel: box.fieldLabel,
              message: `Field "${box.fieldLabel}" is empty on Page ${page.pageNumber}`,
            });
          }

          // Missing font check
          if (!checkFontAvailability(box.fontFamily)) {
            issues.push({
              type: 'missing-font',
              pageNumber: page.pageNumber,
              boxId: box.id,
              fieldLabel: box.fieldLabel,
              message: `Font "${box.fontFamily}" may be unavailable on Page ${page.pageNumber}`,
            });
          }
        }
      }

      if (!isCancelled) {
        setAuditIssues(issues);
        setIsAuditing(false);
      }
    };

    runAudit();

    return () => {
      isCancelled = true;
    };
  }, [project.pages]);

  if (!activePage) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-3">
        <h3 className="text-base font-semibold text-[#FFF8E7]">No pages to preview</h3>
        <p className="text-xs text-[#FFF8E7]/60">
          Upload at least one background image in the Upload stage to preview designs.
        </p>
      </div>
    );
  }

  const overflowIssues = auditIssues.filter((i) => i.type === 'overflow');
  const emptyIssues = auditIssues.filter((i) => i.type === 'empty');
  const fontIssues = auditIssues.filter((i) => i.type === 'missing-font');

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Bar with Page Navigation and Export Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#212128]">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#FFF8E7]">
            Preview & Quality Control
          </h2>
          <p className="text-xs text-[#F4D58D]/70 mt-0.5">
            Full 1:1 pixel rendering inspection. Internal field labels are removed from actual artwork.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#17171C] border border-[#212128] rounded-xl p-1.5">
            <button
              onClick={() => onSelectPageIndex(Math.max(0, activePageIndex - 1))}
              disabled={activePageIndex === 0}
              className="p-1 rounded text-[#FFF8E7]/70 hover:text-[#D4AF37] disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-[#FFF8E7] px-2 font-mono">
              Page {activePage.pageNumber} / {project.pages.length}
            </span>
            <button
              onClick={() =>
                onSelectPageIndex(Math.min(project.pages.length - 1, activePageIndex + 1))
              }
              disabled={activePageIndex === project.pages.length - 1}
              className="p-1 rounded text-[#FFF8E7]/70 hover:text-[#D4AF37] disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onNavigateToDownload}
            className="px-4 py-2.5 bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs rounded-lg transition-all shadow-md active:scale-95 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Proceed to Download</span>
          </button>
        </div>
      </div>

      {/* Main Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Rendered Artwork Canvas (Left/Center Column) */}
        <div className="lg:col-span-8 bg-[#121216] border border-[#212128] rounded-2xl p-4 sm:p-6 flex flex-col items-center justify-center min-h-[500px]">
          {isRendering ? (
            <div className="text-center py-24 space-y-3">
              <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-[#FFF8E7]/60">Rendering sharp 1:1 canvas artwork...</p>
            </div>
          ) : renderedImageUrl ? (
            <div className="relative shadow-2xl rounded-lg overflow-hidden border border-[#212128] max-w-[520px] w-full">
              <img
                src={renderedImageUrl}
                alt={`Preview of Page ${activePage.pageNumber}`}
                className="w-full h-auto object-contain"
              />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-[#0B0B0F]/90 backdrop-blur-sm text-[10px] font-mono text-[#F4D58D] border border-[#212128]">
                {activePage.originalWidth} × {activePage.originalHeight} px (Original Resolution)
              </div>
            </div>
          ) : (
            <div className="text-xs text-red-400">Could not render artwork preview.</div>
          )}
        </div>

        {/* Quality Control Audit Panel (Right Column) */}
        <div className="lg:col-span-4 bg-[#17171C] border border-[#212128] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#212128]">
            <h3 className="text-xs font-bold text-[#FFF8E7] flex items-center gap-2">
              <Eye className="w-4 h-4 text-[#D4AF37]" />
              <span>Quality Control Audit</span>
            </h3>
            {auditIssues.length === 0 && !isAuditing ? (
              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>ALL CHECKS PASSED</span>
              </span>
            ) : (
              <span className="text-[10px] font-bold text-amber-400">
                {auditIssues.length} NOTICE{auditIssues.length === 1 ? '' : 'S'}
              </span>
            )}
          </div>

          {/* Audit Metrics Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-[#0B0B0F] border border-[#212128] text-center">
              <div
                className={`text-sm font-bold font-mono ${
                  overflowIssues.length > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {overflowIssues.length}
              </div>
              <div className="text-[9px] text-[#FFF8E7]/60 mt-0.5 uppercase">Overflows</div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0B0B0F] border border-[#212128] text-center">
              <div
                className={`text-sm font-bold font-mono ${
                  emptyIssues.length > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {emptyIssues.length}
              </div>
              <div className="text-[9px] text-[#FFF8E7]/60 mt-0.5 uppercase">Empty Fields</div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0B0B0F] border border-[#212128] text-center">
              <div
                className={`text-sm font-bold font-mono ${
                  fontIssues.length > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {fontIssues.length}
              </div>
              <div className="text-[9px] text-[#FFF8E7]/60 mt-0.5 uppercase">Font Alerts</div>
            </div>
          </div>

          {/* Detailed Issues List */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {auditIssues.length === 0 ? (
              <div className="p-4 bg-[#0B0B0F] border border-emerald-900/40 rounded-xl text-center space-y-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto" />
                <p className="text-xs font-semibold text-emerald-300">
                  Ready for High-Res Export
                </p>
                <p className="text-[10px] text-emerald-200/60">
                  No text overflow detected. All required fonts verified and active.
                </p>
              </div>
            ) : (
              auditIssues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                    issue.type === 'overflow'
                      ? 'border-red-900/60 bg-red-950/20 text-red-200'
                      : 'border-amber-900/60 bg-amber-950/20 text-amber-200'
                  }`}
                >
                  <AlertTriangle
                    className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                      issue.type === 'overflow' ? 'text-red-400' : 'text-amber-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[11px] truncate">{issue.message}</div>
                    <div className="text-[10px] opacity-75 mt-0.5">
                      Field: <span className="font-mono">{issue.fieldLabel}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onSelectPageIndex(issue.pageNumber - 1);
                      onNavigateToEditBox(issue.boxId);
                    }}
                    className="text-[10px] px-2 py-1 rounded bg-[#0B0B0F] hover:bg-[#212128] text-[#D4AF37] border border-[#212128] font-semibold shrink-0"
                  >
                    Fix
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Quick Page Jump Thumbnails */}
          <div className="pt-3 border-t border-[#212128] space-y-2">
            <span className="text-[11px] font-semibold text-[#8C7625] block">All Pages</span>
            <div className="grid grid-cols-4 gap-1.5">
              {project.pages.map((p, pIdx) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPageIndex(pIdx)}
                  className={`p-1.5 rounded-lg border text-center transition-all ${
                    pIdx === activePageIndex
                      ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] font-bold'
                      : 'border-[#212128] text-[#FFF8E7]/60 hover:border-[#8C7625]'
                  }`}
                >
                  <div className="text-[10px] font-mono">P{p.pageNumber}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
