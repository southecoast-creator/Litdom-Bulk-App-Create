/**
 * Litdom Batch Studio - Spreadsheet Population Bottom Sheet
 * Instant bulk population on file upload, auto-mapping with aliases & order fallback,
 * live mapping dropdowns, mismatch reconciliation, and unused column chips.
 */

import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Project, TextBoxTemplate } from '../types';
import {
  parseSpreadsheetFile,
  calculateAutoMappings,
  populateDesignsFromSpreadsheet,
  ParsedSpreadsheet,
} from '../utils/spreadsheetEngine';

interface SpreadsheetSheetProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProject: (updated: Project) => void;
}

export const SpreadsheetSheet: React.FC<SpreadsheetSheetProps> = ({
  project,
  isOpen,
  onClose,
  onUpdateProject,
}) => {
  const [isParsing, setIsParsing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentSheet = project.lastSpreadsheet;
  const mappings = currentSheet?.mappings || {};
  const headers = currentSheet?.headers || [];
  const rows = currentSheet?.rows || [];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setErrorMessage(null);

    try {
      const parsed: ParsedSpreadsheet = await parseSpreadsheetFile(file);
      const autoMap = calculateAutoMappings(project.template, parsed.headers);

      // Immediately fill designs: Row 1 -> Design 1, Row 2 -> Design 2, etc.
      const population = populateDesignsFromSpreadsheet(
        project.pages,
        parsed.rows,
        autoMap.mappings
      );

      const updatedProject: Project = {
        ...project,
        pages: population.pages,
        lastSpreadsheet: {
          filename: parsed.filename,
          headers: parsed.headers,
          rows: parsed.rows,
          mappings: autoMap.mappings,
        },
        updatedAt: Date.now(),
      };

      onUpdateProject(updatedProject);
    } catch (err: any) {
      console.error('Spreadsheet parse error:', err);
      setErrorMessage(err.message || 'Failed to read spreadsheet file.');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleMappingChange = (fieldLabel: string, colName: string) => {
    if (!currentSheet) return;

    const newMappings = { ...mappings, [fieldLabel]: colName };
    const population = populateDesignsFromSpreadsheet(
      project.pages,
      currentSheet.rows,
      newMappings
    );

    const updatedProject: Project = {
      ...project,
      pages: population.pages,
      lastSpreadsheet: {
        ...currentSheet,
        mappings: newMappings,
      },
      updatedAt: Date.now(),
    };

    onUpdateProject(updatedProject);
  };

  const handleAddBoxForUnusedColumn = (colName: string) => {
    // Add new text box to shared template
    const newBox: TextBoxTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fieldLabel: colName,
      x: 15,
      y: Math.min(85, 20 + project.template.length * 10),
      width: 70,
      height: 10,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 22,
      fontWeight: '500',
      fontStyle: 'normal',
      textAlign: 'center',
      color: '#FFF8E7',
      lineHeight: 1.3,
      letterSpacing: 0,
    };

    const newTemplate = [...project.template, newBox];
    const newMappings = { ...mappings, [colName]: colName };

    const population = populateDesignsFromSpreadsheet(
      project.pages,
      rows,
      newMappings
    );

    const updatedProject: Project = {
      ...project,
      template: newTemplate,
      pages: population.pages,
      lastSpreadsheet: currentSheet
        ? {
            ...currentSheet,
            mappings: newMappings,
          }
        : undefined,
      updatedAt: Date.now(),
    };

    onUpdateProject(updatedProject);
  };

  const handleAddDesignsForExcessRows = () => {
    if (!currentSheet || project.pages.length === 0) return;
    const lastPage = project.pages[project.pages.length - 1];
    const needed = currentSheet.rows.length - project.pages.length;
    if (needed <= 0) return;

    const newPages = [...project.pages];
    for (let i = 0; i < needed; i++) {
      const idx = project.pages.length + i;
      newPages.push({
        id: `page_${Date.now()}_${idx}`,
        imageId: lastPage.imageId,
        name: `Design ${idx + 1}`,
        width: lastPage.width,
        height: lastPage.height,
        values: {},
      });
    }

    const population = populateDesignsFromSpreadsheet(
      newPages,
      currentSheet.rows,
      mappings
    );

    onUpdateProject({
      ...project,
      pages: population.pages,
      updatedAt: Date.now(),
    });
  };

  // Status computation
  const totalDesigns = project.pages.length;
  const totalRows = rows.length;
  const hasSpreadsheet = !!currentSheet;

  // Unused columns
  const mappedCols = new Set(Object.values(mappings).filter(Boolean));
  const unusedHeaders = headers.filter((h) => !mappedCols.has(h));

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#17171C] border border-[#2D2D38] w-full max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#262632] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base text-[#FFF8E7]">
                Spreadsheet Population
              </h3>
              <p className="text-[11px] text-[#FFF8E7]/60">
                Upload CSV or Excel to automatically populate all design pages
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#FFF8E7]/50 hover:text-white hover:bg-[#212128] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* File Upload Box */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
              className="w-full border-2 border-dashed border-[#3A3A4A] hover:border-[#D4AF37] rounded-2xl p-5 text-center transition-all bg-[#121217]/50 hover:bg-[#121217] group flex flex-col items-center justify-center gap-2 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-[#21212A] group-hover:bg-[#D4AF37]/20 flex items-center justify-center transition-colors">
                <Upload className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div className="text-sm font-semibold text-[#FFF8E7]">
                {hasSpreadsheet ? 'Upload New Spreadsheet (Replace)' : 'Choose CSV or Excel Spreadsheet'}
              </div>
              <p className="text-xs text-[#FFF8E7]/50">
                Supports UTF-8 CSV, .xlsx, .xls · Emojis, accents & punctuation preserved
              </p>
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Active Spreadsheet Status */}
          {hasSpreadsheet && (
            <div className="space-y-4">
              {/* Row Mismatch or Exact Notice */}
              <div className="bg-[#121217] border border-[#2A2A38] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#D4AF37] font-bold">
                    {currentSheet.filename}
                  </span>
                  <span className="text-[#FFF8E7]/70">
                    {totalDesigns} designs · {totalRows} rows
                  </span>
                </div>

                {totalRows === totalDesigns && totalDesigns > 0 && (
                  <div className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Every design page is 1:1 matched to a spreadsheet row.</span>
                  </div>
                )}

                {totalRows < totalDesigns && (
                  <div className="text-xs text-amber-400/90 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Designs {totalRows + 1}–{totalDesigns} have no row and were left unchanged.
                    </span>
                  </div>
                )}

                {totalRows > totalDesigns && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 border-t border-[#262632]">
                    <span className="text-xs text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{totalRows - totalDesigns} rows have no design page.</span>
                    </span>
                    <button
                      onClick={handleAddDesignsForExcessRows}
                      className="text-xs bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold px-3 py-1.5 rounded-lg transition-all min-h-[36px]"
                    >
                      Add {totalRows - totalDesigns} designs (copy of last)
                    </button>
                  </div>
                )}
              </div>

              {/* Column Mapping Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
                  Field Column Mappings
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {project.template.map((box) => (
                    <div
                      key={box.id}
                      className="flex items-center justify-between gap-3 bg-[#121217] border border-[#21212A] px-3 py-2 rounded-xl text-xs"
                    >
                      <span className="font-mono font-semibold text-[#FFF8E7] truncate max-w-[160px]">
                        {box.fieldLabel}
                      </span>
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-3.5 h-3.5 text-[#FFF8E7]/40 shrink-0" />
                        <select
                          value={mappings[box.fieldLabel] || ''}
                          onChange={(e) =>
                            handleMappingChange(box.fieldLabel, e.target.value)
                          }
                          className="bg-[#1C1C24] border border-[#333342] text-[#D4AF37] font-semibold text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#D4AF37]"
                        >
                          <option value="">(Not filled)</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unused Columns Chips */}
              {unusedHeaders.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#262632]">
                  <div className="text-xs text-[#FFF8E7]/70 font-medium">
                    Unused spreadsheet columns (tap to add a text box):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {unusedHeaders.map((col) => (
                      <button
                        key={col}
                        onClick={() => handleAddBoxForUnusedColumn(col)}
                        className="bg-[#1E1E28] hover:bg-[#D4AF37]/20 border border-[#333344] hover:border-[#D4AF37] text-xs text-[#FFF8E7] px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors min-h-[32px]"
                      >
                        <Plus className="w-3 h-3 text-[#D4AF37]" />
                        <span>{col}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#262632] flex items-center justify-end">
          <button
            onClick={onClose}
            className="bg-[#21212A] hover:bg-[#D4AF37] hover:text-[#0B0B0F] text-[#FFF8E7] font-bold text-xs px-5 py-2.5 rounded-xl transition-all min-h-[44px]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
