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

import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, CheckSquare, Square, ChevronDown } from 'lucide-react';
import { Project, TextBoxTemplate } from '../types';
import { getThumbnailBlob, createManagedObjectUrl } from '../utils/db';
import { groupPagesByLayout, pagesWithFields } from '../utils/layoutGroups';

interface SyncLayoutModalProps {
  project: Project;
  activePageIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onSyncAll: (arrange?: boolean) => void;
  onSyncCustomPages: (pageIndices: number[], arrange?: boolean) => void;
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
  const [designDestination, setDesignDestination] = useState<'group' | 'this' | 'all' | 'custom'>('group');
  const [customDesignPages, setCustomDesignPages] = useState<Set<number>>(new Set());
  const [groupPages, setGroupPages] = useState<Set<number>>(new Set());
  const [arrangeText, setArrangeText] = useState(false);

  // Section 2: Sync Text Fields Layout
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [fieldsDestination, setFieldsDestination] = useState<'tagged' | 'this' | 'all' | 'custom'>('tagged');
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

  // Pages that share a layout (same field types in the same order)
  const layoutGroups = useMemo(
    () => groupPagesByLayout(project.pages, project.template),
    [project.pages, project.template]
  );
  const activeGroup = layoutGroups.find((g) => g.pages.includes(activePageIndex));

  // Pages that have the chosen field tag(s)
  const taggedPages = useMemo(
    () =>
      pagesWithFields(project.pages, project.template, Array.from(selectedFields)).filter(
        (i) => i !== activePageIndex
      ),
    [project.pages, project.template, selectedFields, activePageIndex]
  );

  // Pre-tick the pages that share this page's layout whenever the window opens
  useEffect(() => {
    if (!isOpen) return;
    setGroupPages(new Set((activeGroup?.pages || []).filter((i) => i !== activePageIndex)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activePageIndex, layoutGroups]);

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
      onSyncAll(arrangeText);
      setFeedback('Layout synced to all designs!');
    } else if (designDestination === 'group') {
      if (groupPages.size === 0) {
        setFeedback('No other page shares this layout. Tick pages or pick Custom.');
        return;
      }
      onSyncCustomPages(Array.from(groupPages), arrangeText);
      setFeedback(`Layout synced to ${groupPages.size} page(s) with the same layout!`);
    } else {
      if (customDesignPages.size === 0) {
        setFeedback('Select at least one target design.');
        return;
      }
      onSyncCustomPages(Array.from(customDesignPages), arrangeText);
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
    } else if (fieldsDestination === 'tagged') {
      if (taggedPages.length === 0) {
        setFeedback('No other page has this field.');
        return;
      }
      targetIndices = taggedPages;
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

          {/* Destination Selector: Same Layout, This Page, All, Custom */}
          <div className="grid grid-cols-4 gap-1.5">
            {([
              ['group', 'Same Layout'],
              ['this', 'This Page'],
              ['all', 'All'],
              ['custom', 'Custom'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDesignDestination(key)}
                className={`py-2 px-1 rounded-2xl text-[11px] font-bold transition-all text-center leading-tight ${
                  designDestination === key
                    ? 'bg-black text-white shadow-md'
                    : 'bg-black/15 text-black hover:bg-black/25'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Pages grouped by shared layout */}
          {designDestination === 'group' && (
            <div className="bg-black/10 rounded-2xl p-2.5 flex flex-col gap-2 max-h-56 overflow-y-auto border border-black/15">
              <span className="text-[11px] font-bold text-black/80">
                Pages that share a layout. Tick the pages to sync:
              </span>
              {layoutGroups.map((g) => {
                const isMine = g.pages.includes(activePageIndex);
                const targets = g.pages.filter((i) => i !== activePageIndex);
                const allOn = targets.length > 0 && targets.every((i) => groupPages.has(i));
                return (
                  <div
                    key={g.id}
                    className={`rounded-xl p-2 border-2 ${isMine ? 'border-black bg-white/60' : 'border-black/15 bg-white/30'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-extrabold">
                        Layout {g.id}
                        {isMine ? ' (this page)' : ''}
                      </div>
                      {targets.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(groupPages);
                            targets.forEach((i) => (allOn ? next.delete(i) : next.add(i)));
                            setGroupPages(next);
                          }}
                          className="text-[10px] font-bold underline"
                        >
                          {allOn ? 'Untick all' : 'Tick all'}
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-black/70 mb-1.5">{g.summary}</div>
                    <div className="flex flex-wrap gap-1">
                      {g.pages.map((i) =>
                        i === activePageIndex ? (
                          <span key={i} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-black/20 text-black">
                            Page {i + 1} (source)
                          </span>
                        ) : (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              const next = new Set(groupPages);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              setGroupPages(next);
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                              groupPages.has(i) ? 'bg-black text-white' : 'bg-black/15 text-black'
                            }`}
                          >
                            {groupPages.has(i) ? <CheckSquare className="w-3 h-3 text-[#D4AF37]" /> : <Square className="w-3 h-3 text-black/50" />}
                            Page {i + 1}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {designDestination !== 'this' && (
            <label className="flex items-start gap-2 text-[11px] font-semibold text-black/80 cursor-pointer">
              <input
                type="checkbox"
                checked={arrangeText}
                onChange={(e) => setArrangeText(e.target.checked)}
                className="mt-0.5"
              />
              <span>Also stack the text neatly (in order, equal spacing) on those pages. Fonts and styles are kept.</span>
            </label>
          )}

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
          <div className="grid grid-cols-4 gap-1.5">
            {([
              ['tagged', 'Pages with Field'],
              ['this', 'This Page'],
              ['all', 'All'],
              ['custom', 'Custom'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFieldsDestination(key)}
                className={`py-2 px-1 rounded-2xl text-[11px] font-bold transition-all text-center leading-tight ${
                  fieldsDestination === key
                    ? 'bg-black text-white shadow-md'
                    : 'bg-black/15 text-black hover:bg-black/25'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {fieldsDestination === 'tagged' && (
            <div className="text-[11px] font-semibold text-black/75 text-center">
              {selectedFields.size === 0
                ? 'Choose a field above.'
                : taggedPages.length === 0
                ? 'No other page has this field.'
                : `${taggedPages.length} other page(s) have this field: ${taggedPages
                    .slice(0, 10)
                    .map((i) => i + 1)
                    .join(', ')}${taggedPages.length > 10 ? '…' : ''}`}
            </div>
          )}

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
