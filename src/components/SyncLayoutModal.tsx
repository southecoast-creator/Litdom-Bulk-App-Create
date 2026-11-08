/**
 * Litdom Batch Studio - Sync Layout Modal (BUG-009)
 * Strict separation into two independent sections:
 * Section 1: "SYNC THIS DESIGN'S LAYOUT"
 *   - Destination: This Page [default], All, Custom (visual thumbnail picker with checkboxes)
 *   - Action Button: "SYNC DESIGNS LAYOUT"
 * Section 2: "SYNC TEXT FIELDS LAYOUT"
 *   - Field selector: multiselect checkboxes of available fields
 *   - Destination: This Page, All, Custom (visual thumbnail picker with checkboxes)
 *   - Action Button: "SYNC TEXT FIELD"
 * 100% preservation of destination text wording/content—only copies layout, styling, and geometry.
 */

import React, { useState, useEffect } from 'react';
import { X, Check, CheckSquare, Square, ChevronDown } from 'lucide-react';
import { Project, TextBoxTemplate } from '../types';
import { getThumbnailBlob, createManagedObjectUrl } from '../utils/db';

interface SyncLayoutModalProps {
  project: Project;
  activePageIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onSyncAll: () => void;
  onSyncCustomPages: (pageIndices: number[]) => void;
  onSyncFieldsToPages: (fieldLabels: string[], targetPageIndices: number[]) => void;
}

export const SyncLayoutModal: React.FC<SyncLayoutModalProps> = ({
  project,
  activePageIndex,
  isOpen,
  onClose,
  onSyncAll,
  onSyncCustomPages,
  onSyncFieldsToPages,
}) => {
  // Section 1: Sync This Design's Layout
  const [designDestination, setDesignDestination] = useState<'this' | 'all' | 'custom'>('this');
  const [customDesignPages, setCustomDesignPages] = useState<Set<number>>(new Set());

  // Section 2: Sync Text Fields Layout
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [fieldsDestination, setFieldsDestination] = useState<'this' | 'all' | 'custom'>('all');
  const [customFieldPages, setCustomFieldPages] = useState<Set<number>>(new Set());

  // Thumbnail URLs for visual picker
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const activePage = project.pages[activePageIndex];
  const availableBoxes =
    activePage?.textBoxes && activePage.textBoxes.length > 0
      ? activePage.textBoxes
      : project.template;
  const fields = availableBoxes.map((b) => b.fieldLabel);

  // Load thumbnail Blobs on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const load = async () => {
      const map: Record<string, string> = {};
      for (const p of project.pages) {
        if (p.imageId) {
          const blob = await getThumbnailBlob(p.imageId);
          if (blob && !cancelled) {
            map[p.id] = createManagedObjectUrl(blob);
          }
        }
      }
      if (!cancelled) setThumbnails(map);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, project.pages]);

  if (!isOpen) return null;

  // Toggle field selection
  const handleToggleField = (field: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const handleSelectAllFields = () => {
    if (selectedFields.size === fields.length) {
      setSelectedFields(new Set());
    } else {
      setSelectedFields(new Set(fields));
    }
  };

  // Section 1 Action: SYNC DESIGNS LAYOUT
  const handleExecuteDesignSync = () => {
    if (designDestination === 'this') {
      onClose();
      return;
    }
    if (designDestination === 'all') {
      onSyncAll();
      setFeedback('Layout synced to all designs!');
    } else {
      if (customDesignPages.size === 0) {
        setFeedback('Select at least one target design.');
        return;
      }
      onSyncCustomPages(Array.from(customDesignPages));
      setFeedback(`Layout synced to ${customDesignPages.size} design(s)!`);
    }

    setTimeout(() => {
      setFeedback(null);
      onClose();
    }, 1200);
  };

  // Section 2 Action: SYNC TEXT FIELD
  const handleExecuteFieldSync = () => {
    if (selectedFields.size === 0) {
      setFeedback('Please select at least one field to sync.');
      return;
    }

    let targetIndices: number[] = [];
    if (fieldsDestination === 'this') {
      targetIndices = [activePageIndex];
    } else if (fieldsDestination === 'all') {
      targetIndices = Array.from({ length: project.pages.length }, (_, i) => i);
    } else {
      if (customFieldPages.size === 0) {
        setFeedback('Select at least one target design for field sync.');
        return;
      }
      targetIndices = Array.from(customFieldPages);
    }

    onSyncFieldsToPages(Array.from(selectedFields), targetIndices);
    setFeedback(`${selectedFields.size} field(s) layout synced!`);

    setTimeout(() => {
      setFeedback(null);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#F4D58D] text-black rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 relative border-2 border-[#D4AF37] max-h-[90vh] overflow-y-auto">
        {/* Cancel button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-black/60 hover:text-black p-1.5 rounded-full hover:bg-black/10 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {feedback && (
          <div className="p-2.5 bg-black text-[#D4AF37] text-xs font-bold rounded-2xl text-center flex items-center justify-center gap-2 animate-bounce shadow-lg">
            <Check className="w-4 h-4 text-[#D4AF37]" />
            <span>{feedback}</span>
          </div>
        )}

        {/* ========================================================
            SECTION 1: SYNC THIS DESIGN'S LAYOUT
           ======================================================== */}
        <div className="flex flex-col gap-3 pt-1">
          <div className="text-center">
            <h3 className="font-extrabold text-sm sm:text-base text-black tracking-wide uppercase">
              SYNC THIS DESIGN’S LAYOUT
            </h3>
            <p className="text-[11px] text-black/70 mt-0.5">
              Syncs positioning, size, fonts, and styles from Design #{activePageIndex + 1}
            </p>
          </div>

          {/* Destination Selector: This Page, All, Custom */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setDesignDestination('this')}
              className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all text-center ${
                designDestination === 'this'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-black/15 text-black hover:bg-black/25'
              }`}
            >
              This Page
            </button>
            <button
              type="button"
              onClick={() => setDesignDestination('all')}
              className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all text-center ${
                designDestination === 'all'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-black/15 text-black hover:bg-black/25'
              }`}
            >
              All Designs
            </button>
            <button
              type="button"
              onClick={() => setDesignDestination('custom')}
              className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all text-center ${
                designDestination === 'custom'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-black/15 text-black hover:bg-black/25'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Visual Thumbnails Picker if Custom */}
          {designDestination === 'custom' && (
            <div className="bg-black/10 rounded-2xl p-2.5 flex flex-col gap-2 max-h-48 overflow-y-auto border border-black/15">
              <span className="text-[11px] font-bold text-black/80">Select target designs:</span>
              <div className="grid grid-cols-3 gap-2">
                {project.pages.map((p, idx) => {
                  if (idx === activePageIndex) return null;
                  const isChecked = customDesignPages.has(idx);
                  const thumb = thumbnails[p.id];
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        const next = new Set(customDesignPages);
                        if (isChecked) next.delete(idx);
                        else next.add(idx);
                        setCustomDesignPages(next);
                      }}
                      className={`cursor-pointer rounded-xl p-1 border-2 flex flex-col items-center gap-1 transition-all ${
                        isChecked ? 'border-black bg-black text-white' : 'border-black/20 bg-white/40 text-black'
                      }`}
                    >
                      <div className="w-full aspect-[3/4] bg-black/20 rounded-lg overflow-hidden flex items-center justify-center">
                        {thumb ? (
                          <img src={thumb} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px]">#{idx + 1}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold">
                        {isChecked ? <CheckSquare className="w-3 h-3 text-[#D4AF37]" /> : <Square className="w-3 h-3 text-black/40" />}
                        <span>Design {idx + 1}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Final Action Button 1 */}
          <button
            type="button"
            onClick={handleExecuteDesignSync}
            className="w-full bg-black hover:bg-black/85 text-white font-extrabold text-xs py-3 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>SYNC DESIGNS LAYOUT</span>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-black/20 my-1" />

        {/* ========================================================
            SECTION 2: SYNC TEXT FIELDS LAYOUT
           ======================================================== */}
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <h3 className="font-extrabold text-sm sm:text-base text-black tracking-wide uppercase">
              SYNC TEXT FIELDS LAYOUT
            </h3>
            <p className="text-[11px] text-black/70 mt-0.5">
              Select specific fields and apply their styles without changing destination text
            </p>
          </div>

          {/* Field Multiselect Checkbox List */}
          <div className="bg-black/10 rounded-2xl p-2.5 flex flex-col gap-1.5 border border-black/15">
            <div className="flex items-center justify-between pb-1 border-b border-black/15">
              <span className="text-[11px] font-bold text-black/80">Choose field(s) to sync:</span>
              <button
                type="button"
                onClick={handleSelectAllFields}
                className="text-[10px] font-bold text-black underline hover:text-[#B88E18]"
              >
                {selectedFields.size === fields.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {fields.map((f) => {
                const isSelected = selectedFields.has(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleToggleField(f)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isSelected
                        ? 'bg-black text-white shadow-sm'
                        : 'bg-black/15 text-black hover:bg-black/25'
                    }`}
                  >
                    {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-[#D4AF37]" /> : <Square className="w-3.5 h-3.5 text-black/50" />}
                    <span>{f}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Destination Selector for Fields */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setFieldsDestination('this')}
              className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all text-center ${
                fieldsDestination === 'this'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-black/15 text-black hover:bg-black/25'
              }`}
            >
              This Page
            </button>
            <button
              type="button"
              onClick={() => setFieldsDestination('all')}
              className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all text-center ${
                fieldsDestination === 'all'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-black/15 text-black hover:bg-black/25'
              }`}
            >
              All Designs
            </button>
            <button
              type="button"
              onClick={() => setFieldsDestination('custom')}
              className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all text-center ${
                fieldsDestination === 'custom'
                  ? 'bg-black text-white shadow-md'
                  : 'bg-black/15 text-black hover:bg-black/25'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Visual Thumbnails Picker if Custom for Fields */}
          {fieldsDestination === 'custom' && (
            <div className="bg-black/10 rounded-2xl p-2.5 flex flex-col gap-2 max-h-48 overflow-y-auto border border-black/15">
              <span className="text-[11px] font-bold text-black/80">Select target designs:</span>
              <div className="grid grid-cols-3 gap-2">
                {project.pages.map((p, idx) => {
                  if (idx === activePageIndex) return null;
                  const isChecked = customFieldPages.has(idx);
                  const thumb = thumbnails[p.id];
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        const next = new Set(customFieldPages);
                        if (isChecked) next.delete(idx);
                        else next.add(idx);
                        setCustomFieldPages(next);
                      }}
                      className={`cursor-pointer rounded-xl p-1 border-2 flex flex-col items-center gap-1 transition-all ${
                        isChecked ? 'border-black bg-black text-white' : 'border-black/20 bg-white/40 text-black'
                      }`}
                    >
                      <div className="w-full aspect-[3/4] bg-black/20 rounded-lg overflow-hidden flex items-center justify-center">
                        {thumb ? (
                          <img src={thumb} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px]">#{idx + 1}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold">
                        {isChecked ? <CheckSquare className="w-3 h-3 text-[#D4AF37]" /> : <Square className="w-3 h-3 text-black/40" />}
                        <span>Design {idx + 1}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Final Action Button 2 */}
          <button
            type="button"
            onClick={handleExecuteFieldSync}
            disabled={selectedFields.size === 0}
            className="w-full bg-black hover:bg-black/85 disabled:opacity-40 text-white font-extrabold text-xs py-3 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>SYNC TEXT FIELD</span>
          </button>
        </div>
      </div>
    </div>
  );
};
