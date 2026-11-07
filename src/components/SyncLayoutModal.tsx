/**
 * Litdom Batch Studio - Sync Layout Modal
 * Exact visual match to IMG_1495 (2).pdf Page 14:
 * - "Sync this Design's Layout with" [This Page] [All] [Custom v]
 * - "Sync Text Field's Layout" [Select field v] [Sync with v]
 */

import React, { useState } from 'react';
import { X, RefreshCw, Check, CheckSquare, Square, ChevronDown } from 'lucide-react';
import { Project, TextBoxTemplate } from '../types';

interface SyncLayoutModalProps {
  project: Project;
  activePageIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onSyncAll: () => void;
  onSyncCustomPages: (pageIndices: number[]) => void;
  onSyncFieldToPages: (fieldLabel: string, targetPageIndices: number[]) => void;
}

export const SyncLayoutModal: React.FC<SyncLayoutModalProps> = ({
  project,
  activePageIndex,
  isOpen,
  onClose,
  onSyncAll,
  onSyncCustomPages,
  onSyncFieldToPages,
}) => {
  const [selectedField, setSelectedField] = useState<string>('');
  const [fieldSyncTarget, setFieldSyncTarget] = useState<'all' | 'custom'>('all');
  const [customPages, setCustomPages] = useState<Set<number>>(new Set());
  const [isCustomPagesOpen, setIsCustomPagesOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const activePage = project.pages[activePageIndex];
  const fields = activePage?.textBoxes?.map((b) => b.fieldLabel) || project.template.map((b) => b.fieldLabel);

  const handleApplySyncAll = () => {
    onSyncAll();
    setFeedback('Full layout synced to all pages!');
    setTimeout(() => {
      setFeedback(null);
      onClose();
    }, 1200);
  };

  const handleApplySyncCustom = () => {
    if (customPages.size === 0) {
      setFeedback('Select at least one page to sync.');
      return;
    }
    onSyncCustomPages(Array.from(customPages));
    setFeedback(`Layout synced to ${customPages.size} page(s)!`);
    setTimeout(() => {
      setFeedback(null);
      onClose();
    }, 1200);
  };

  const handleApplyFieldSync = () => {
    if (!selectedField) {
      setFeedback('Please select a text field to sync.');
      return;
    }
    const targets =
      fieldSyncTarget === 'all'
        ? Array.from({ length: project.pages.length }, (_, i) => i)
        : Array.from(customPages);

    onSyncFieldToPages(selectedField, targets);
    setFeedback(`"${selectedField}" layout synced!`);
    setTimeout(() => {
      setFeedback(null);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-sm sm:max-w-md bg-[#F4D58D] text-black rounded-3xl p-6 shadow-2xl flex flex-col gap-4 relative border-2 border-[#D4AF37]">
        {/* Cancel button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-black/60 hover:text-black p-1 rounded-full hover:bg-black/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {feedback && (
          <div className="p-2 bg-black text-white text-xs font-semibold rounded-xl text-center flex items-center justify-center gap-1.5 animate-pulse">
            <Check className="w-4 h-4 text-amber-400" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Section 1: Sync this Design's Layout with */}
        <div className="flex flex-col gap-2 pt-2">
          <h3 className="text-xs sm:text-sm font-bold text-black text-center">
            Sync this Design’s Layout with
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="bg-black/20 hover:bg-black/30 text-black font-bold text-xs py-3 rounded-2xl transition-all"
            >
              This Page
            </button>
            <button
              onClick={handleApplySyncAll}
              className="bg-black hover:bg-black/85 text-white font-bold text-base py-3 rounded-2xl shadow-lg transition-all active:scale-95"
            >
              All
            </button>
          </div>

          <button
            onClick={() => setIsCustomPagesOpen(!isCustomPagesOpen)}
            className="w-full bg-black text-white font-bold text-xs py-3 px-4 rounded-2xl flex items-center justify-between shadow-md"
          >
            <span>Custom ({customPages.size} selected)</span>
            <ChevronDown className="w-4 h-4" />
          </button>

          {isCustomPagesOpen && (
            <div className="bg-black/10 rounded-2xl p-3 flex flex-col gap-2 max-h-40 overflow-y-auto">
              <span className="text-[11px] font-bold text-black/80">Select target pages:</span>
              <div className="grid grid-cols-3 gap-2">
                {project.pages.map((p, idx) => {
                  if (idx === activePageIndex) return null;
                  const isChecked = customPages.has(idx);
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        const next = new Set(customPages);
                        if (isChecked) next.delete(idx);
                        else next.add(idx);
                        setCustomPages(next);
                      }}
                      className={`text-xs py-1.5 px-2 rounded-xl font-bold flex items-center gap-1 transition-all ${
                        isChecked ? 'bg-black text-white' : 'bg-black/20 text-black'
                      }`}
                    >
                      {isChecked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span>P{idx + 1}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handleApplySyncCustom}
                className="bg-black text-white font-bold text-xs py-2 rounded-xl mt-1"
              >
                Apply Layout to Selected Pages
              </button>
            </div>
          )}
        </div>

        {/* Section 2: Sync Text Field's Layout */}
        <div className="flex flex-col gap-2 border-t border-black/20 pt-4">
          <h3 className="text-xs sm:text-sm font-bold text-black text-center">
            Sync Text Field’s Layout
          </h3>

          <div className="relative">
            <select
              value={selectedField}
              onChange={(e) => setSelectedField(e.target.value)}
              className="w-full bg-black text-white font-bold text-xs px-4 py-2.5 rounded-2xl appearance-none pr-8 cursor-pointer focus:outline-none"
            >
              <option value="">Select field…</option>
              {fields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-white absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={fieldSyncTarget}
              onChange={(e) => setFieldSyncTarget(e.target.value as any)}
              className="w-full bg-black text-white font-bold text-xs px-4 py-2.5 rounded-2xl appearance-none pr-8 cursor-pointer focus:outline-none"
            >
              <option value="all">Sync with All Pages</option>
              <option value="custom">Sync with Selected Custom Pages</option>
            </select>
            <ChevronDown className="w-4 h-4 text-white absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={handleApplyFieldSync}
            disabled={!selectedField}
            className="w-full bg-black hover:bg-black/85 text-white font-bold text-xs py-2.5 rounded-2xl transition-all disabled:opacity-40 shadow-md active:scale-95"
          >
            Sync Selected Field Layout
          </button>
        </div>
      </div>
    </div>
  );
};
