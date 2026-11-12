/**
 * Litdom Batch Studio - Document Workflow Modal (27-Style DOCX Engine)
 * Handles: DOCX Upload -> 27-Style Structural Scan -> Initial Spreadsheet Download
 * -> Template Images Upload -> Revised Spreadsheet Upload -> Validation -> Placeholder Preparation
 * -> User Approval -> Auto-Population -> Open in Universal Editor.
 */

import React, { useState, useRef } from 'react';
import {
  FileText,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  X,
  Layers,
  Sparkles,
  RefreshCw,
  Eye,
} from 'lucide-react';
import {
  parseDocxFile,
  downloadDocxSpreadsheet,
} from '../utils/docxParser';
import { DocxScanResult, Project, TextBoxTemplate, DesignPage } from '../types';
import { storeImageFile, isImageFile, saveProject, createDefaultTemplate } from '../utils/db';
import { trimTrailingBlankRows } from '../utils/spreadsheetEngine';
import { autoStackBoxes } from '../utils/autoStack';
import { preloadTemplateFonts } from '../utils/canvasEngine';
import * as XLSX from 'xlsx';

interface DocxWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (projectId: string) => void;
}

export const DocxWorkflowModal: React.FC<DocxWorkflowModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const [stage, setStage] = useState<
    'upload_docx' | 'scanning' | 'scanned' | 'upload_templates' | 'upload_revised' | 'ready_to_approve'
  >('upload_docx');

  const [scanResult, setScanResult] = useState<DocxScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadedTemplates, setUploadedTemplates] = useState<{
    imageId: string;
    width: number;
    height: number;
    name: string;
  }[]>([]);

  const [revisedSpreadsheet, setRevisedSpreadsheet] = useState<{
    headers: string[];
    rows: Record<string, string>[];
  } | null>(null);

  const docxInputRef = useRef<HTMLInputElement>(null);
  const templatesInputRef = useRef<HTMLInputElement>(null);
  const revisedXlsxInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDocxSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setStage('scanning');

    try {
      const result = await parseDocxFile(file, file.name);
      setScanResult(result);
      setStage('scanned');
    } catch (err: any) {
      console.error('Failed to parse DOCX:', err);
      setErrorMsg(err.message || 'Failed to parse Microsoft Word DOCX document.');
      setStage('upload_docx');
    }
  };

  const handleDownloadInitialSpreadsheet = () => {
    if (!scanResult) return;
    downloadDocxSpreadsheet(scanResult);
  };

  const handleTemplatesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMsg(null);
    const storedList: {
      imageId: string;
      width: number;
      height: number;
      name: string;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!isImageFile(file)) continue;
      try {
        const stored = await storeImageFile(file);
        storedList.push({
          imageId: stored.imageId,
          width: stored.width,
          height: stored.height,
          name: file.name.replace(/\.[^/.]+$/, ''),
        });
      } catch (err) {
        console.error('Failed to store template:', err);
      }
    }

    if (storedList.length === 0) {
      setErrorMsg('No valid images selected.');
      return;
    }

    setUploadedTemplates(storedList);
    setStage('upload_revised');
  };

  const handleRevisedXlsxSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', blankrows: true });

      if (json.length === 0) {
        setErrorMsg('The uploaded spreadsheet contains no data rows.');
        return;
      }

      const headers = Object.keys(json[0] || {});
      const cleanRows = json.map((row) => {
        const r: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          r[k] = v !== undefined && v !== null ? String(v) : '';
        }
        return r;
      });

      setRevisedSpreadsheet({ headers, rows: trimTrailingBlankRows(cleanRows) });
      setStage('ready_to_approve');
    } catch (err: any) {
      console.error('Failed to read revised spreadsheet:', err);
      setErrorMsg('Invalid Excel or CSV spreadsheet file.');
    }
  };

  const handleApproveAndPopulate = async () => {
    if (!scanResult) return;

    // Use revised spreadsheet if provided, otherwise default to initial extracted spreadsheet
    const finalHeaders = revisedSpreadsheet ? revisedSpreadsheet.headers : scanResult.generatedColumns;
    const finalRows = revisedSpreadsheet ? revisedSpreadsheet.rows : scanResult.spreadsheetData;

    const pageCount = finalRows.length;
    const projectTitle = scanResult.filename.replace(/\.[^/.]+$/, '');

    // Validate or generate background pages
    const finalPages: DesignPage[] = [];

    // Create baseline template text boxes based on columns detected
    const templateBoxes: TextBoxTemplate[] = [];
    finalHeaders.forEach((colName, idx) => {
      let fontSize = 24;
      let fontWeight: '400' | '500' | '600' | '700' | '800' = '400';
      let y = Math.min(85, 15 + idx * 14);

      if (colName.includes('Title') || colName.includes('Heading 1')) {
        fontSize = 44;
        fontWeight = '700';
      } else if (colName.includes('Subtitle') || colName.includes('Heading 2')) {
        fontSize = 32;
        fontWeight = '600';
      } else if (colName.includes('Quote')) {
        fontSize = 26;
        fontWeight = '500';
      }

      templateBoxes.push({
        id: `tpl_box_${idx}_${Date.now()}`,
        fieldLabel: colName,
        x: 10,
        y,
        width: 80,
        fontFamily: colName.includes('Title') ? 'Cinzel' : 'Plus Jakarta Sans',
        fontSize,
        fontWeight,
        fontStyle: colName.includes('Quote') ? 'italic' : 'normal',
        textAlign: colName.includes('Title') ? 'center' : 'left',
        color: colName.includes('Title') ? '#D4AF37' : '#FFF8E7',
        lineHeight: 1.5,
        letterSpacing: 0,
      });
    });

    // Fonts must be loaded before text is measured for stacking
    await preloadTemplateFonts(templateBoxes);
    let measureCtx: CanvasRenderingContext2D | null = null;
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {}

    for (let i = 0; i < pageCount; i++) {
      const rowData = finalRows[i] || {};
      const tplImage = uploadedTemplates[i] || uploadedTemplates[0];

      // Build text values and non-empty placeholder boxes for this specific page
      const pageValues: Record<string, string> = {};
      const pageTextBoxes: TextBoxTemplate[] = [];

      finalHeaders.forEach((col, idx) => {
        const textVal = rowData[col] || '';
        pageValues[col] = textVal;

        // "Empty cells must not produce placeholders" - from Master Brief
        if (textVal.trim()) {
          const baseBox = templateBoxes[idx];
          if (baseBox) {
            pageTextBoxes.push({
              ...JSON.parse(JSON.stringify(baseBox)),
              id: `box_p${i}_${idx}_${Date.now()}`,
            });
          }
        }
      });

      let imageId = tplImage?.imageId;
      let imgW = tplImage?.width || 1080;
      let imgH = tplImage?.height || 1920;

      // If no custom template images were uploaded, create a standard crisp dark background canvas
      if (!imageId) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0B0B0F';
          ctx.fillRect(0, 0, 1080, 1920);
        }
        const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
        const stored = await storeImageFile(blob);
        imageId = stored.imageId;
      }

      finalPages.push({
        id: `page_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        imageId,
        name: `Page ${i + 1}`,
        width: imgW,
        height: imgH,
        values: pageValues,
        textBoxes: pageTextBoxes.length > 0
          ? autoStackBoxes(
              pageTextBoxes,
              { id: 'tmp', imageId: '', name: '', width: imgW, height: imgH, values: pageValues },
              measureCtx
            ).boxes
          : JSON.parse(JSON.stringify(templateBoxes)),
      });
    }

    const newProject: Project = {
      id: `proj_docx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: projectTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      template: templateBoxes,
      pages: finalPages,
      lastSpreadsheet: {
        filename: scanResult.filename,
        headers: finalHeaders,
        rows: finalRows,
        mappings: finalHeaders.reduce((acc, h) => ({ ...acc, [h]: h }), {}),
      },
    };

    await saveProject(newProject);
    onProjectCreated(newProject.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-xl bg-[#121217] border border-[#D4AF37]/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-[#FFF8E7] flex flex-col gap-6 relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#262632] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37] flex items-center justify-center text-[#D4AF37]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-serif text-[#FFF8E7]">
                Document Production Pipeline
              </h2>
              <p className="text-xs text-[#FFF8E7]/60">
                27-Style OpenXML Analysis & Adaptive Spreadsheet Engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#FFF8E7]/50 hover:text-white rounded-xl hover:bg-[#262632] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/50 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step 1: Upload DOCX */}
        {stage === 'upload_docx' && (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#D4AF37]/40 rounded-2xl p-8 gap-4 bg-[#17171C]/60 hover:bg-[#17171C] transition-colors">
            <FileText className="w-12 h-12 text-[#D4AF37]" />
            <div className="text-center">
              <h3 className="font-bold text-sm text-[#FFF8E7]">
                Select Microsoft Word (.docx) File
              </h3>
              <p className="text-xs text-[#FFF8E7]/50 mt-1 max-w-sm">
                Scans 27 standard styles (Title, Subtitle, Headings 1-9, Normal Text, Quotes, Lists)
                and groups occurrences into page-mapped spreadsheets.
              </p>
            </div>
            <input
              type="file"
              ref={docxInputRef}
              accept=".docx"
              onChange={handleDocxSelected}
              className="hidden"
            />
            <button
              onClick={() => docxInputRef.current?.click()}
              className="bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-[#D4AF37]/20 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload DOCX Document
            </button>
          </div>
        )}

        {/* Scanning State */}
        {stage === 'scanning' && (
          <div className="flex flex-col items-center justify-center p-12 gap-4">
            <RefreshCw className="w-10 h-10 text-[#D4AF37] animate-spin" />
            <div className="text-center">
              <h3 className="font-bold text-base text-[#FFF8E7]">
                Analyzing Document OpenXML Structure…
              </h3>
              <p className="text-xs text-[#FFF8E7]/50 mt-1">
                Parsing paragraph styles, grouping occurrences, and generating dynamic columns…
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Scanned successfully -> Download initial sheet & advance */}
        {(stage === 'scanned' || stage === 'upload_templates' || stage === 'upload_revised' || stage === 'ready_to_approve') && scanResult && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-emerald-300">
                  Analysis & Fields detected successfully! Ready to populate!
                </h4>
                <p className="text-xs text-emerald-200/70 mt-1">
                  Detected {scanResult.pages.length} page(s) and {scanResult.generatedColumns.length} dynamic style column(s):{' '}
                  <span className="font-semibold text-emerald-200">{scanResult.detectedStyles.join(', ')}</span>.
                </p>
              </div>
            </div>

            {scanResult.blankPages && scanResult.blankPages.length > 0 && (
              <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl text-xs text-amber-200/90">
                <div className="font-bold text-amber-300 mb-1">
                  {scanResult.blankPages.length} blank page(s) found in your document
                </div>
                Page {scanResult.blankPages.slice(0, 12).join(', ')}
                {scanResult.blankPages.length > 12 ? ', …' : ''} {scanResult.blankPages.length === 1 ? 'has' : 'have'} no
                text. They are kept as empty rows so row N always matches page N. If they are mistakes (a double
                page break), delete them in Word / Docs and upload the document again.
              </div>
            )}

            {/* Initial Spreadsheet Download */}
            <div className="p-4 bg-[#17171C] border border-[#262632] rounded-2xl flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[#FFF8E7]">
                  Initial Generated Spreadsheet
                </div>
                <div className="text-[11px] text-[#FFF8E7]/50">
                  {scanResult.pages.length} data rows with 1:1 page occurrence grouping
                </div>
              </div>
              <button
                onClick={handleDownloadInitialSpreadsheet}
                className="bg-[#262632] hover:bg-[#323242] text-[#FFF8E7] text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 border border-[#3A3A4C]"
              >
                <Download className="w-4 h-4 text-[#D4AF37]" />
                Download Spreadsheet (.xlsx)
              </button>
            </div>

            {/* Template Images Upload */}
            <div className="p-4 bg-[#17171C] border border-[#262632] rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-[#FFF8E7]">
                    Upload Design Background Templates
                  </div>
                  <div className="text-[11px] text-[#FFF8E7]/50">
                    Upload template images matching your {scanResult.pages.length} page(s), or proceed with plain canvas.
                  </div>
                </div>
                <input
                  type="file"
                  ref={templatesInputRef}
                  multiple
                  accept="image/*"
                  onChange={handleTemplatesSelected}
                  className="hidden"
                />
                <button
                  onClick={() => templatesInputRef.current?.click()}
                  className="bg-[#262632] hover:bg-[#323242] text-[#FFF8E7] text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 border border-[#3A3A4C]"
                >
                  <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                  Upload Templates
                </button>
              </div>
              {uploadedTemplates.length > 0 && (
                <div className="text-[11px] text-[#D4AF37] font-semibold">
                  ✓ {uploadedTemplates.length} template image(s) loaded
                </div>
              )}
            </div>

            {/* Revised Spreadsheet Upload */}
            <div className="p-4 bg-[#17171C] border border-[#262632] rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-[#FFF8E7]">
                    Upload Revised Spreadsheet (Optional)
                  </div>
                  <div className="text-[11px] text-[#FFF8E7]/50">
                    If you edited the spreadsheet in Google Sheets or Excel, upload it here.
                  </div>
                </div>
                <input
                  type="file"
                  ref={revisedXlsxInputRef}
                  accept=".xlsx,.csv"
                  onChange={handleRevisedXlsxSelected}
                  className="hidden"
                />
                <button
                  onClick={() => revisedXlsxInputRef.current?.click()}
                  className="bg-[#262632] hover:bg-[#323242] text-[#FFF8E7] text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 border border-[#3A3A4C]"
                >
                  <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                  Upload Revised Sheet
                </button>
              </div>
              {revisedSpreadsheet && (
                <div className="text-[11px] text-emerald-400 font-semibold">
                  ✓ Revised sheet validated ({revisedSpreadsheet.rows.length} rows, {revisedSpreadsheet.headers.length} columns)
                </div>
              )}
            </div>

            {(() => {
              const rowCount = revisedSpreadsheet ? revisedSpreadsheet.rows.length : scanResult.pages.length;
              const tplCount = uploadedTemplates.length;
              if (tplCount > 0 && tplCount !== rowCount) {
                return (
                  <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-2xl text-xs text-red-200">
                    Count mismatch: {rowCount} row(s)/page(s) but {tplCount} template image(s). Pages and templates are
                    matched in order, so everything after the first difference can end up with the wrong design.
                    Make the numbers equal before you continue.
                  </div>
                );
              }
              if (tplCount > 0) {
                return (
                  <div className="text-[11px] text-emerald-400 font-semibold">
                    ✓ {rowCount} pages = {rowCount} rows = {tplCount} templates
                  </div>
                );
              }
              return null;
            })()}

            {/* Approval & Population Action */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#262632]">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#FFF8E7]/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveAndPopulate}
                className="bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-[#D4AF37]/20 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Approve & Match & Populate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
