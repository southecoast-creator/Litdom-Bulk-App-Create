/**
 * Litdom Batch Studio - Stage 5: Import Spreadsheet & Population
 * CSV / XLSX upload, header confirmation, row selector, live canvas preview,
 * immediate preview redraw upon applying, and empty-cell preservation.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Check,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Eye,
  Table,
  Sparkles,
  Info,
  Layers,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Project, PageDesign, SpreadsheetRow } from '../types';
import {
  parseSpreadsheetFile,
  generateMappingSuggestions,
  populatePagesWithSpreadsheetData,
  SpreadsheetParseResult,
} from '../utils/spreadsheet';
import {
  SAMPLE_CSV_MATCHED,
  SAMPLE_CSV_EDGE_CASES,
  createOneRowExcelWorkbookBlob,
} from '../utils/sampleData';
import { renderPageToCanvas } from '../utils/canvasRenderer';

interface ImportSpreadsheetViewProps {
  project: Project;
  activePageIndex: number;
  onSelectPageIndex: (index: number) => void;
  onUpdateProject: (updated: Project) => void;
  onNavigateToPreview: () => void;
  onNavigateToEdit: () => void;
}

export const ImportSpreadsheetView: React.FC<ImportSpreadsheetViewProps> = ({
  project,
  activePageIndex,
  onSelectPageIndex,
  onUpdateProject,
  onNavigateToPreview,
  onNavigateToEdit,
}) => {
  const activePage = project.pages[activePageIndex] || project.pages[0];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parseResult, setParseResult] = useState<SpreadsheetParseResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);
  const [populationMode, setPopulationMode] = useState<'singlePage' | 'batch'>('singlePage');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  // Live Canvas Preview URL on this stage
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);

  // Extract unique field labels on the active page and across project
  const activePageFieldLabels = activePage
    ? activePage.textBoxes.map((b) => b.fieldLabel)
    : [];

  const allProjectFieldLabels = Array.from(
    new Set(project.pages.flatMap((p) => p.textBoxes.map((b) => b.fieldLabel)))
  );

  // Redraw the live preview canvas whenever activePage changes
  const redrawLivePreview = async (pageToRender: PageDesign) => {
    if (!pageToRender) return;
    setIsRenderingPreview(true);
    try {
      const { canvas } = await renderPageToCanvas(pageToRender, {
        showBoundingBoxes: false,
      });
      setLivePreviewUrl(canvas.toDataURL('image/jpeg', 0.95));
    } catch (err) {
      console.error('Error rendering live preview canvas:', err);
    } finally {
      setIsRenderingPreview(false);
    }
  };

  useEffect(() => {
    if (activePage) {
      redrawLivePreview(activePage);
    }
  }, [activePage]);

  // Keep column mapping updated when new field labels are created or detected
  useEffect(() => {
    if (parseResult && parseResult.headers.length > 0) {
      const suggestions = generateMappingSuggestions(allProjectFieldLabels, parseResult.headers);
      setColumnMapping((prev) => {
        const next = { ...suggestions, ...prev };
        return next;
      });
    }
  }, [project.pages, parseResult]);

  // Parse uploaded spreadsheet file
  const handleFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setAppliedNotice(null);

      const result = await parseSpreadsheetFile(file);
      setParseResult(result);
      setSelectedRowIndex(0);

      // Auto-set population mode based on row and page counts
      if (project.pages.length > 1 && result.rows.length > 1) {
        setPopulationMode('batch');
      } else {
        setPopulationMode('singlePage');
      }

      // Generate matching for all labels
      const initialMapping = generateMappingSuggestions(allProjectFieldLabels, result.headers);
      setColumnMapping(initialMapping);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to parse spreadsheet file.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // One-click load 1-row Excel workbook
  const handleLoadOneRowExcel = () => {
    const blob = createOneRowExcelWorkbookBlob();
    const file = new File([blob], 'litdom-catalog-1row.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    handleFileUpload(file);
  };

  // Helper to load test CSV strings
  const handleLoadSampleCSV = (csvContent: string, fileName: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], fileName, { type: 'text/csv' });
    handleFileUpload(file);
  };

  // Execute population action
  const handleApplyPopulation = async () => {
    if (!parseResult || parseResult.rows.length === 0) {
      setErrorMessage('Please import a spreadsheet first.');
      return;
    }

    // Save snapshot of current pages for undo
    const backupSnapshot: PageDesign[] = JSON.parse(JSON.stringify(project.pages));

    const { updatedPages, populatedCount, unpopulatedPageNumbers, excessRowCount } =
      populatePagesWithSpreadsheetData(project.pages, parseResult.rows, columnMapping, {
        mode: populationMode,
        selectedRowIndex,
        targetPageIndex: activePageIndex,
      });

    const updatedProject: Project = {
      ...project,
      pages: updatedPages,
      lastSpreadsheetName: parseResult.fileName,
      updatedAt: Date.now(),
      spreadsheetHistory: {
        populatedAt: Date.now(),
        rowCount: parseResult.rows.length,
        columnHeaders: parseResult.headers,
        backupPagesSnapshot: backupSnapshot,
      },
    };

    // Update parent project state
    onUpdateProject(updatedProject);

    // Immediately redraw the live preview on this screen
    const targetPage = updatedPages[activePageIndex] || updatedPages[0];
    await redrawLivePreview(targetPage);

    // Build clear success message
    if (populationMode === 'singlePage') {
      const rowNum = selectedRowIndex + 1;
      const pageNum = targetPage.pageNumber;
      setAppliedNotice(
        `✓ Populated Page ${pageNum} with Spreadsheet Row ${rowNum}. Background image and styling preserved.`
      );
    } else {
      let notice = `✓ Populated ${populatedCount} page(s) sequentially from ${parseResult.fileName}.`;
      if (unpopulatedPageNumbers.length > 0) {
        notice += ` (Pages ${unpopulatedPageNumbers.join(', ')} remain unpopulated due to fewer rows).`;
      }
      if (excessRowCount > 0) {
        notice += ` (${excessRowCount} excess row(s) were not applied).`;
      }
      setAppliedNotice(notice);
    }
  };

  // Revert / Undo population
  const handleUndoPopulation = async () => {
    if (!project.spreadsheetHistory?.backupPagesSnapshot) return;

    if (
      window.confirm(
        'Revert spreadsheet population? This will restore the previous text while keeping all text-box positions, dimensions, fonts, and styles intact.'
      )
    ) {
      const restoredPages = project.spreadsheetHistory.backupPagesSnapshot;
      const restoredProject: Project = {
        ...project,
        pages: restoredPages,
        spreadsheetHistory: undefined,
        updatedAt: Date.now(),
      };
      onUpdateProject(restoredProject);
      await redrawLivePreview(restoredPages[activePageIndex] || restoredPages[0]);
      setAppliedNotice('Spreadsheet population reverted to previous template text.');
    }
  };

  const selectedRowData = parseResult?.rows[selectedRowIndex] || null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#212128]">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#FFF8E7]">
            Spreadsheet Import & Population
          </h2>
          <p className="text-xs text-[#F4D58D]/70 mt-0.5">
            Import CSV or Excel XLSX workbooks. Confirm column mapping, select rows, and immediately redraw design previews.
          </p>
        </div>

        {/* Undo Button */}
        {project.spreadsheetHistory?.backupPagesSnapshot && (
          <button
            onClick={handleUndoPopulation}
            className="px-3.5 py-2 rounded-lg bg-[#212128] hover:bg-[#2a2a35] border border-[#8C7625]/50 text-[#F4D58D] text-xs font-semibold flex items-center gap-2 transition-all self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Revert to Pre-Spreadsheet Text</span>
          </button>
        )}
      </div>

      {/* Flat Screenshot Notice Callout */}
      <div className="p-3.5 bg-[#17171C] border border-[#212128] rounded-xl text-xs flex items-start gap-3">
        <Info className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
        <div className="text-[#FFF8E7]/80 text-[11px] leading-relaxed">
          <strong className="text-[#FFF8E7]">Design Note:</strong> An uploaded screenshot is a flat raster background. Existing text inside the image cannot be modified directly. Litdom Batch Studio renders crisp, scalable text boxes positioned over your background. If your screenshot already has baked-in text, you can set a background color on text boxes to cover it or use a clean template image.
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3.5 bg-red-950/40 border border-red-800 text-red-200 rounded-xl text-xs flex items-center gap-2 shadow-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {appliedNotice && (
        <div className="p-3.5 bg-emerald-950/40 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{appliedNotice}</span>
          </div>
          <button
            onClick={onNavigateToPreview}
            className="px-3 py-1.5 bg-[#D4AF37] text-[#0B0B0F] rounded-lg text-xs font-bold hover:bg-[#F4D58D] flex items-center gap-1.5 shrink-0 transition-all shadow-sm active:scale-95"
          >
            <span>Stage 6: Preview & Export</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Upload & Quick-Test Card Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Upload File Card */}
        <div className="md:col-span-2 bg-[#17171C] border border-[#212128] rounded-2xl p-6 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-[#212128] text-[#D4AF37] flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#FFF8E7]">
              Select Spreadsheet File (CSV or XLSX)
            </h4>
            <p className="text-xs text-[#FFF8E7]/50 mt-1 max-w-md mx-auto">
              100% processed client-side in your browser. Compatible with Microsoft Excel, Google Sheets, and standard CSV.
            </p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs rounded-lg transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            {isProcessing ? 'Reading Spreadsheet...' : 'Choose CSV or XLSX File'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            className="hidden"
          />
        </div>

        {/* Quick Test Datasets */}
        <div className="bg-[#17171C] border border-[#212128] rounded-2xl p-5 space-y-3 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-[#F4D58D] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>One-Click Test Datasets</span>
            </h4>
            <p className="text-[11px] text-[#FFF8E7]/60 mt-1">
              Verify Excel and CSV population without leaving the browser:
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleLoadOneRowExcel}
              className="w-full text-left p-2.5 rounded-lg bg-[#212128] hover:bg-[#2a2a35] border border-[#D4AF37]/40 hover:border-[#D4AF37] text-xs text-[#FFF8E7] transition-all"
            >
              <div className="font-semibold text-[#D4AF37]">1. One-Row Excel (.xlsx)</div>
              <div className="text-[10px] text-[#FFF8E7]/60">
                1 row: TITLE, SUBTITLE, PARAGRAPH 1, CTA
              </div>
            </button>

            <button
              onClick={() => handleLoadSampleCSV(SAMPLE_CSV_MATCHED, 'litdom-standard-benchmark.csv')}
              className="w-full text-left p-2.5 rounded-lg bg-[#212128] hover:bg-[#2a2a35] border border-[#212128] hover:border-[#8C7625] text-xs text-[#FFF8E7] transition-all"
            >
              <div className="font-semibold text-[#F4D58D]">2. Standard 2-Row CSV</div>
              <div className="text-[10px] text-[#FFF8E7]/60">Matches Page 1 & Page 2</div>
            </button>

            <button
              onClick={() => handleLoadSampleCSV(SAMPLE_CSV_EDGE_CASES, 'litdom-edge-cases.csv')}
              className="w-full text-left p-2.5 rounded-lg bg-[#212128] hover:bg-[#2a2a35] border border-red-900/40 hover:border-red-600 text-xs text-[#FFF8E7] transition-all"
            >
              <div className="font-semibold text-red-300">3. Edge-Case CSV</div>
              <div className="text-[10px] text-red-200/60">
                Empty cell, unmapped SKU, excess 3rd row, overflow
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Population & Live Preview Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Mapping, Row Selector & Apply Action (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {parseResult ? (
            <div className="bg-[#17171C] border border-[#212128] rounded-2xl p-5 space-y-5">
              {/* File Info & Row Selector */}
              <div className="pb-4 border-b border-[#212128] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-[#D4AF37]" />
                    <h3 className="text-sm font-bold text-[#FFF8E7]">
                      {parseResult.fileName}
                    </h3>
                  </div>
                  <span className="text-xs text-[#F4D58D] font-mono">
                    {parseResult.totalRows} {parseResult.totalRows === 1 ? 'Data Row' : 'Data Rows'} · {parseResult.headers.length} Columns
                  </span>
                </div>

                {/* Population Mode & Row Chooser */}
                <div className="p-3 bg-[#0B0B0F] border border-[#212128] rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#8C7625]">Population Target:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPopulationMode('singlePage')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                          populationMode === 'singlePage'
                            ? 'bg-[#D4AF37] text-[#0B0B0F]'
                            : 'bg-[#212128] text-[#FFF8E7]/70'
                        }`}
                      >
                        Active Page Only (P{activePage.pageNumber})
                      </button>
                      <button
                        onClick={() => setPopulationMode('batch')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                          populationMode === 'batch'
                            ? 'bg-[#D4AF37] text-[#0B0B0F]'
                            : 'bg-[#212128] text-[#FFF8E7]/70'
                        }`}
                      >
                        All Pages in Batch
                      </button>
                    </div>
                  </div>

                  {populationMode === 'singlePage' && (
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#212128] text-xs">
                      <span className="text-[#FFF8E7]/70">Select Row to Apply:</span>
                      <select
                        value={selectedRowIndex}
                        onChange={(e) => setSelectedRowIndex(parseInt(e.target.value, 10))}
                        className="bg-[#17171C] border border-[#212128] focus:border-[#D4AF37] text-xs font-mono text-[#FFF8E7] rounded-lg px-2.5 py-1.5 max-w-[240px]"
                      >
                        {parseResult.rows.map((row, rIdx) => {
                          const firstVal = Object.values(row).find((v) => v.trim() !== '') || 'Row ' + (rIdx + 1);
                          return (
                            <option key={rIdx} value={rIdx}>
                              Row {rIdx + 1}: {firstVal.slice(0, 24)}...
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Column-to-Label Mapping Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#8C7625] uppercase tracking-wider">
                    Confirm Column Mapping ({activePageFieldLabels.length} boxes on Page {activePage.pageNumber})
                  </h4>
                  <span className="text-[10px] text-[#FFF8E7]/50">
                    Empty cells in row will remain blank
                  </span>
                </div>

                <div className="space-y-2.5">
                  {activePage.textBoxes.map((box) => {
                    const currentMappedHeader = columnMapping[box.fieldLabel] || '';
                    const sampleVal =
                      selectedRowData && currentMappedHeader
                        ? selectedRowData[currentMappedHeader]
                        : null;

                    return (
                      <div
                        key={box.id}
                        className="p-3 bg-[#0B0B0F] border border-[#212128] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono text-[#D4AF37]">
                              {box.fieldLabel}
                            </span>
                            <span className="text-[10px] text-[#8C7625]">
                              ({box.fontFamily}, {box.fontSize}px)
                            </span>
                          </div>

                          {currentMappedHeader && selectedRowData ? (
                            <div className="text-[11px] text-[#FFF8E7]/70 mt-0.5 truncate">
                              Value: <span className="font-semibold text-[#FFF8E7]">
                                {sampleVal === '' ? (
                                  <span className="text-[#8C7625] italic">[Empty Cell: Box will be blank]</span>
                                ) : (
                                  `"${sampleVal}"`
                                )}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-400 mt-0.5">
                              Unmapped: Will keep original template text
                            </div>
                          )}
                        </div>

                        <select
                          value={currentMappedHeader}
                          onChange={(e) =>
                            setColumnMapping({
                              ...columnMapping,
                              [box.fieldLabel]: e.target.value ? e.target.value : null,
                            })
                          }
                          className="bg-[#17171C] border border-[#212128] focus:border-[#D4AF37] text-xs font-mono text-[#FFF8E7] rounded-lg px-2.5 py-1.5 shrink-0 max-w-[200px]"
                        >
                          <option value="">-- Do Not Map --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PRIMARY ACTION BUTTON: APPLY SPREADSHEET */}
              <div className="pt-4 border-t border-[#212128] flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#FFF8E7]/60">
                  Updates design text immediately & redraws visible preview
                </span>

                <button
                  onClick={handleApplyPopulation}
                  className="px-6 py-3 bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs rounded-xl transition-all shadow-lg shadow-[#D4AF37]/20 active:scale-95 flex items-center gap-2 shrink-0"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply Spreadsheet to Design</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 bg-[#17171C] border border-[#212128] rounded-2xl text-center space-y-3">
              <FileSpreadsheet className="w-8 h-8 text-[#8C7625] mx-auto" />
              <h4 className="text-sm font-semibold text-[#FFF8E7]">No Spreadsheet Loaded Yet</h4>
              <p className="text-xs text-[#FFF8E7]/50 max-w-sm mx-auto">
                Upload your CSV or Excel file above, or click "One-Row Excel (.xlsx)" to immediately populate the design.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Live Embedded Preview (5 Cols) */}
        <div className="lg:col-span-5 bg-[#17171C] border border-[#212128] rounded-2xl p-4 sm:p-5 space-y-4 sticky top-[120px]">
          <div className="flex items-center justify-between pb-3 border-b border-[#212128]">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[#D4AF37]" />
              <h4 className="text-xs font-bold text-[#FFF8E7]">
                Live Design Preview (Page {activePage.pageNumber})
              </h4>
            </div>

            {project.pages.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onSelectPageIndex(Math.max(0, activePageIndex - 1))}
                  disabled={activePageIndex === 0}
                  className="p-1 rounded text-[#FFF8E7]/60 hover:text-[#D4AF37] disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono text-[#D4AF37] px-1">
                  {activePage.pageNumber}/{project.pages.length}
                </span>
                <button
                  onClick={() =>
                    onSelectPageIndex(
                      Math.min(project.pages.length - 1, activePageIndex + 1)
                    )
                  }
                  disabled={activePageIndex === project.pages.length - 1}
                  className="p-1 rounded text-[#FFF8E7]/60 hover:text-[#D4AF37] disabled:opacity-30"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Preview Image Container */}
          <div className="bg-[#0B0B0F] border border-[#212128] rounded-xl p-2 flex items-center justify-center min-h-[340px] relative overflow-hidden">
            {isRenderingPreview ? (
              <div className="text-center py-12 space-y-2">
                <RefreshCw className="w-6 h-6 text-[#D4AF37] animate-spin mx-auto" />
                <span className="text-[11px] text-[#FFF8E7]/60">Redrawing artwork...</span>
              </div>
            ) : livePreviewUrl ? (
              <div className="relative shadow-xl rounded overflow-hidden max-h-[460px]">
                <img
                  src={livePreviewUrl}
                  alt={`Preview of Page ${activePage.pageNumber}`}
                  className="w-full h-auto object-contain max-h-[460px]"
                />
              </div>
            ) : (
              <div className="text-xs text-[#FFF8E7]/40">No preview available</div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 text-[11px] text-[#FFF8E7]/60">
            <span>Dimensions: {activePage.originalWidth} × {activePage.originalHeight} px</span>
            <button
              onClick={onNavigateToEdit}
              className="text-[#D4AF37] hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Edit Layout / Boxes</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
