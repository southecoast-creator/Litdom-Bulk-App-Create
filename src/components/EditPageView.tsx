/**
 * Litdom Batch Studio - Stage 3: Canva / Adobe Style Design Studio
 * Real-time on-canvas dragging, 8-way resize handles (width/height),
 * floating Canva-style property bar with font size steppers, dimensions, typography, and colors.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Move,
  Sliders,
  Type,
  AlertTriangle,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Palette,
  Minus,
  Sparkles,
  Check,
  Layers,
} from 'lucide-react';
import { Project, PageDesign, TextBox } from '../types';
import { renderPageToCanvas, BUILTIN_FONTS } from '../utils/canvasRenderer';

interface EditPageViewProps {
  project: Project;
  activePageIndex: number;
  onSelectPageIndex: (index: number) => void;
  onUpdateProject: (updated: Project) => void;
  onNavigateToTypography: (boxId: string) => void;
}

type HandleType =
  | 'move'
  | 'resize-e'
  | 'resize-w'
  | 'resize-s'
  | 'resize-n'
  | 'resize-se'
  | 'resize-sw'
  | 'resize-ne'
  | 'resize-nw';

const LITDOM_QUICK_COLORS = [
  '#0B0B0F',
  '#17171C',
  '#D4AF37',
  '#F4D58D',
  '#FFF8E7',
  '#8C7625',
  '#FFFFFF',
  '#000000',
  '#EF4444',
  '#10B981',
];

const STANDARD_FIELD_LABELS = [
  'TITLE',
  'SUBTITLE',
  'PARAGRAPH 1',
  'PARAGRAPH 2',
  'PARAGRAPH 3',
  'CTA',
  'FOOTER',
  'HEADLINE',
];

export const EditPageView: React.FC<EditPageViewProps> = ({
  project,
  activePageIndex,
  onSelectPageIndex,
  onUpdateProject,
  onNavigateToTypography,
}) => {
  const activePage = project.pages[activePageIndex] || project.pages[0];
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<'fit' | 0.5 | 0.75 | 1>('fit');
  const [overflowingBoxes, setOverflowingBoxes] = useState<string[]>([]);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  // Drag & Resize state
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
  const [dragStart, setDragStart] = useState<{
    mouseX: number;
    mouseY: number;
    boxX: number;
    boxY: number;
    boxW: number;
    boxH: number;
  } | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const selectedBox = activePage?.textBoxes.find((b) => b.id === selectedBoxId);

  // Auto-select first box if available
  useEffect(() => {
    if (activePage?.textBoxes.length && !selectedBoxId) {
      setSelectedBoxId(activePage.textBoxes[0].id);
    }
  }, [activePage, selectedBoxId]);

  // Check text overflow on render
  useEffect(() => {
    if (!activePage) return;
    let isCancelled = false;

    renderPageToCanvas(activePage, { showBoundingBoxes: false }).then(
      ({ overflowingBoxIds }) => {
        if (!isCancelled) {
          setOverflowingBoxes(overflowingBoxIds);
        }
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [activePage]);

  if (!activePage) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h3 className="text-base font-semibold text-[#FFF8E7]">No pages available to edit</h3>
        <p className="text-xs text-[#FFF8E7]/60">
          Upload at least one background design in the Upload stage to start positioning text boxes.
        </p>
      </div>
    );
  }

  const handleUpdateBox = (boxId: string, updates: Partial<TextBox>) => {
    const updatedPages = project.pages.map((p, idx) => {
      if (idx !== activePageIndex) return p;
      return {
        ...p,
        textBoxes: p.textBoxes.map((b) => (b.id === boxId ? { ...b, ...updates } : b)),
      };
    });
    onUpdateProject({ ...project, pages: updatedPages, updatedAt: Date.now() });
  };

  const handleAddTextBox = () => {
    const newId = `box_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const pageW = activePage.originalWidth;
    const newBox: TextBox = {
      id: newId,
      fieldLabel: `FIELD ${activePage.textBoxes.length + 1}`,
      content: 'New Text Content',
      x: 20,
      y: 20 + (activePage.textBoxes.length % 5) * 10,
      width: 60,
      height: 12,
      fontFamily: project.defaultFontFamily || 'Plus Jakarta Sans',
      fontSize: Math.round(pageW * 0.035),
      fontWeight: '600',
      fontStyle: 'normal',
      textAlign: 'center',
      color: project.defaultColor || '#FFF8E7',
      lineHeight: 1.3,
      letterSpacing: 0,
    };

    const updatedPages = project.pages.map((p, idx) => {
      if (idx !== activePageIndex) return p;
      return {
        ...p,
        textBoxes: [...p.textBoxes, newBox],
      };
    });
    onUpdateProject({ ...project, pages: updatedPages, updatedAt: Date.now() });
    setSelectedBoxId(newId);
  };

  // Add 4 Standard Boxes (TITLE, SUBTITLE, PARAGRAPH 1, CTA)
  const handleAddFourStandardBoxes = () => {
    const pageW = activePage.originalWidth;
    const stdBoxes: TextBox[] = [
      {
        id: `box_${Date.now()}_title`,
        fieldLabel: 'TITLE',
        content: 'APEX SOVEREIGN EDITION',
        x: 10,
        y: 20,
        width: 80,
        height: 14,
        fontFamily: 'Cinzel',
        fontSize: Math.round(pageW * 0.046),
        fontWeight: '700',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#D4AF37',
        lineHeight: 1.25,
        letterSpacing: 2,
        shadow: { color: 'rgba(0,0,0,0.8)', blur: 8, offsetX: 0, offsetY: 3 },
      },
      {
        id: `box_${Date.now()}_subtitle`,
        fieldLabel: 'SUBTITLE',
        content: 'Precision Engineered Mechanical Distinction',
        x: 15,
        y: 38,
        width: 70,
        height: 10,
        fontFamily: project.defaultFontFamily || 'Plus Jakarta Sans',
        fontSize: Math.round(pageW * 0.024),
        fontWeight: '500',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#FFF8E7',
        lineHeight: 1.4,
        letterSpacing: 0,
      },
      {
        id: `box_${Date.now()}_p1`,
        fieldLabel: 'PARAGRAPH 1',
        content:
          'Hand-finished titanium chassis calibrated to micron tolerances with sapphire crystal.',
        x: 15,
        y: 52,
        width: 70,
        height: 18,
        fontFamily: project.defaultFontFamily || 'Plus Jakarta Sans',
        fontSize: Math.round(pageW * 0.02),
        fontWeight: '400',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#F4D58D',
        lineHeight: 1.5,
        letterSpacing: 0,
      },
      {
        id: `box_${Date.now()}_cta`,
        fieldLabel: 'CTA',
        content: 'ACQUIRE ALLOCATION',
        x: 25,
        y: 76,
        width: 50,
        height: 8,
        fontFamily: 'Montserrat',
        fontSize: Math.round(pageW * 0.018),
        fontWeight: '700',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#0B0B0F',
        lineHeight: 1.2,
        letterSpacing: 2,
        backgroundColor: '#D4AF37',
        padding: 10,
      },
    ];

    const updatedPages = project.pages.map((p, idx) => {
      if (idx !== activePageIndex) return p;
      return {
        ...p,
        textBoxes: [...p.textBoxes, ...stdBoxes],
      };
    });
    onUpdateProject({ ...project, pages: updatedPages, updatedAt: Date.now() });
    setSelectedBoxId(stdBoxes[0].id);
  };

  const handleDuplicateBox = (box: TextBox) => {
    const newId = `box_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const duplicated: TextBox = {
      ...box,
      id: newId,
      fieldLabel: `${box.fieldLabel} COPY`,
      x: Math.min(80, box.x + 4),
      y: Math.min(80, box.y + 4),
    };

    const updatedPages = project.pages.map((p, idx) => {
      if (idx !== activePageIndex) return p;
      return {
        ...p,
        textBoxes: [...p.textBoxes, duplicated],
      };
    });
    onUpdateProject({ ...project, pages: updatedPages, updatedAt: Date.now() });
    setSelectedBoxId(newId);
  };

  const handleDeleteBox = (boxId: string) => {
    const updatedPages = project.pages.map((p, idx) => {
      if (idx !== activePageIndex) return p;
      return {
        ...p,
        textBoxes: p.textBoxes.filter((b) => b.id !== boxId),
      };
    });
    onUpdateProject({ ...project, pages: updatedPages, updatedAt: Date.now() });
    if (selectedBoxId === boxId) {
      setSelectedBoxId(activePage.textBoxes.find((b) => b.id !== boxId)?.id || null);
    }
  };

  // Drag & 8-Way Resize Pointer Handlers
  const handlePointerDown = (
    e: React.PointerEvent,
    box: TextBox,
    handleType: HandleType
  ) => {
    e.stopPropagation();
    setSelectedBoxId(box.id);
    setActiveHandle(handleType);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: box.x,
      boxY: box.y,
      boxW: box.width,
      boxH: box.height,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeHandle || !dragStart || !selectedBoxId || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const deltaX = ((e.clientX - dragStart.mouseX) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStart.mouseY) / rect.height) * 100;

    let newX = dragStart.boxX;
    let newY = dragStart.boxY;
    let newW = dragStart.boxW;
    let newH = dragStart.boxH;

    switch (activeHandle) {
      case 'move':
        newX = Math.max(0, Math.min(95, Math.round(dragStart.boxX + deltaX)));
        newY = Math.max(0, Math.min(95, Math.round(dragStart.boxY + deltaY)));
        break;

      case 'resize-e': // Right Edge (Width)
        newW = Math.max(8, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxW + deltaX)));
        break;

      case 'resize-w': // Left Edge (Width + X)
        newW = Math.max(8, Math.round(dragStart.boxW - deltaX));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 8, Math.round(dragStart.boxX + deltaX)));
        break;

      case 'resize-s': // Bottom Edge (Height)
        newH = Math.max(4, Math.min(100 - dragStart.boxY, Math.round(dragStart.boxH + deltaY)));
        break;

      case 'resize-n': // Top Edge (Height + Y)
        newH = Math.max(4, Math.round(dragStart.boxH - deltaY));
        newY = Math.max(0, Math.min(dragStart.boxY + dragStart.boxH - 4, Math.round(dragStart.boxY + deltaY)));
        break;

      case 'resize-se': // Bottom-Right Corner
        newW = Math.max(8, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxW + deltaX)));
        newH = Math.max(4, Math.min(100 - dragStart.boxY, Math.round(dragStart.boxH + deltaY)));
        break;

      case 'resize-sw': // Bottom-Left Corner
        newW = Math.max(8, Math.round(dragStart.boxW - deltaX));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 8, Math.round(dragStart.boxX + deltaX)));
        newH = Math.max(4, Math.min(100 - dragStart.boxY, Math.round(dragStart.boxH + deltaY)));
        break;

      case 'resize-ne': // Top-Right Corner
        newW = Math.max(8, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxW + deltaX)));
        newH = Math.max(4, Math.round(dragStart.boxH - deltaY));
        newY = Math.max(0, Math.min(dragStart.boxY + dragStart.boxH - 4, Math.round(dragStart.boxY + deltaY)));
        break;

      case 'resize-nw': // Top-Left Corner
        newW = Math.max(8, Math.round(dragStart.boxW - deltaX));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 8, Math.round(dragStart.boxX + deltaX)));
        newH = Math.max(4, Math.round(dragStart.boxH - deltaY));
        newY = Math.max(0, Math.min(dragStart.boxY + dragStart.boxH - 4, Math.round(dragStart.boxY + deltaY)));
        break;
    }

    handleUpdateBox(selectedBoxId, { x: newX, y: newY, width: newW, height: newH });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeHandle) {
      setActiveHandle(null);
      setDragStart(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
    }
  };

  const aspectRatio = activePage.originalWidth / activePage.originalHeight;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 space-y-3">
      {/* CANVA-STYLE TOP FLOATING PROPERTY BAR */}
      <div className="bg-[#17171C] border border-[#212128] rounded-2xl p-2 sm:p-2.5 shadow-xl flex flex-wrap items-center justify-between gap-2 sticky top-[105px] z-40">
        {selectedBox ? (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* 1. Field Label Pill Selector */}
            <div className="flex items-center gap-1 bg-[#0B0B0F] px-2 py-1 rounded-lg border border-[#212128]">
              <span className="text-[10px] text-[#8C7625] font-semibold">LABEL:</span>
              <select
                value={selectedBox.fieldLabel}
                onChange={(e) =>
                  handleUpdateBox(selectedBox.id, {
                    fieldLabel: e.target.value.toUpperCase(),
                  })
                }
                className="bg-transparent text-xs font-mono font-bold text-[#D4AF37] focus:outline-none"
              >
                {STANDARD_FIELD_LABELS.map((lbl) => (
                  <option key={lbl} value={lbl} className="bg-[#17171C] text-[#FFF8E7]">
                    {lbl}
                  </option>
                ))}
                {!STANDARD_FIELD_LABELS.includes(selectedBox.fieldLabel) && (
                  <option
                    value={selectedBox.fieldLabel}
                    className="bg-[#17171C] text-[#FFF8E7]"
                  >
                    {selectedBox.fieldLabel}
                  </option>
                )}
              </select>
            </div>

            {/* 2. Font Family Picker */}
            <select
              value={selectedBox.fontFamily}
              onChange={(e) => handleUpdateBox(selectedBox.id, { fontFamily: e.target.value })}
              className="bg-[#0B0B0F] border border-[#212128] hover:border-[#8C7625] text-xs font-semibold text-[#FFF8E7] rounded-lg px-2.5 py-1.5 focus:border-[#D4AF37] max-w-[140px] sm:max-w-[160px]"
            >
              {BUILTIN_FONTS.map((f) => (
                <option key={f.name} value={f.name} className="bg-[#17171C]">
                  {f.name}
                </option>
              ))}
              {project.customFonts?.map((cf) => (
                <option key={cf.id} value={cf.familyName} className="bg-[#17171C]">
                  ★ {cf.familyName}
                </option>
              ))}
            </select>

            {/* 3. Font Size Stepper (Canva-style: [-] [48px] [+]) */}
            <div className="flex items-center bg-[#0B0B0F] border border-[#212128] rounded-lg overflow-hidden">
              <button
                onClick={() =>
                  handleUpdateBox(selectedBox.id, {
                    fontSize: Math.max(10, selectedBox.fontSize - 2),
                  })
                }
                className="px-2 py-1 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] active:scale-95 transition-all"
                title="Decrease font size"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <input
                type="number"
                value={selectedBox.fontSize}
                onChange={(e) =>
                  handleUpdateBox(selectedBox.id, {
                    fontSize: Math.max(8, parseInt(e.target.value, 10) || 8),
                  })
                }
                className="w-12 text-center text-xs font-mono font-bold text-[#FFF8E7] bg-transparent focus:outline-none"
              />

              <button
                onClick={() =>
                  handleUpdateBox(selectedBox.id, {
                    fontSize: Math.min(180, selectedBox.fontSize + 2),
                  })
                }
                className="px-2 py-1 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] active:scale-95 transition-all"
                title="Increase font size"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 4. Box Width (Length) Stepper: W: [-] 75% [+] */}
            <div className="flex items-center bg-[#0B0B0F] border border-[#212128] rounded-lg overflow-hidden text-xs">
              <span className="px-2 text-[10px] font-mono text-[#8C7625] font-semibold">W</span>
              <button
                onClick={() =>
                  handleUpdateBox(selectedBox.id, {
                    width: Math.max(10, selectedBox.width - 5),
                  })
                }
                className="px-1.5 py-1 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] active:scale-95"
                title="Narrow box length"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-9 text-center font-mono font-bold text-[#D4AF37]">
                {selectedBox.width}%
              </span>
              <button
                onClick={() =>
                  handleUpdateBox(selectedBox.id, {
                    width: Math.min(100 - selectedBox.x, selectedBox.width + 5),
                  })
                }
                className="px-1.5 py-1 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] active:scale-95"
                title="Widen box length"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* 5. Box Height Stepper: H: [-] 14% [+] */}
            <div className="flex items-center bg-[#0B0B0F] border border-[#212128] rounded-lg overflow-hidden text-xs">
              <span className="px-2 text-[10px] font-mono text-[#8C7625] font-semibold">H</span>
              <button
                onClick={() =>
                  handleUpdateBox(selectedBox.id, {
                    height: Math.max(4, selectedBox.height - 2),
                  })
                }
                className="px-1.5 py-1 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] active:scale-95"
                title="Reduce box height"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-8 text-center font-mono font-bold text-[#D4AF37]">
                {selectedBox.height}%
              </span>
              <button
                onClick={() =>
                  handleUpdateBox(selectedBox.id, {
                    height: Math.min(100 - selectedBox.y, selectedBox.height + 2),
                  })
                }
                className="px-1.5 py-1 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] active:scale-95"
                title="Expand box height"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* 6. Formatting Buttons: Bold, Italic, Alignment */}
            <div className="flex items-center gap-0.5 bg-[#0B0B0F] p-0.5 rounded-lg border border-[#212128]">
              <button
                onClick={() =>
                  handleUpdateBox(selectedBox.id, {
                    fontWeight: selectedBox.fontWeight === '700' ? '400' : '700',
                  })
                }
                className={`p-1.5 rounded text-xs font-bold transition-all ${
                  selectedBox.fontWeight === '700'
                    ? 'bg-[#D4AF37] text-[#0B0B0F]'
                    : 'text-[#FFF8E7]/70 hover:text-white'
                }`}
                title="Toggle Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() =>
                  handleUpdateBox(selectedBox.id, {
                    fontStyle: selectedBox.fontStyle === 'italic' ? 'normal' : 'italic',
                  })
                }
                className={`p-1.5 rounded text-xs italic transition-all ${
                  selectedBox.fontStyle === 'italic'
                    ? 'bg-[#D4AF37] text-[#0B0B0F]'
                    : 'text-[#FFF8E7]/70 hover:text-white'
                }`}
                title="Toggle Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() =>
                  handleUpdateBox(selectedBox.id, {
                    textAlign:
                      selectedBox.textAlign === 'left'
                        ? 'center'
                        : selectedBox.textAlign === 'center'
                        ? 'right'
                        : 'left',
                  })
                }
                className="p-1.5 rounded text-[#FFF8E7]/70 hover:text-white"
                title={`Alignment: ${selectedBox.textAlign}`}
              >
                {selectedBox.textAlign === 'left' ? (
                  <AlignLeft className="w-3.5 h-3.5" />
                ) : selectedBox.textAlign === 'right' ? (
                  <AlignRight className="w-3.5 h-3.5" />
                ) : (
                  <AlignCenter className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* 7. Color Swatch & Palette Picker */}
            <div className="relative">
              <button
                onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
                className="w-7 h-7 rounded-lg border-2 border-white/40 flex items-center justify-center shadow-md active:scale-95"
                style={{ backgroundColor: selectedBox.color }}
                title="Change color"
              />

              {isColorPickerOpen && (
                <div className="absolute top-9 left-0 z-50 bg-[#17171C] border border-[#212128] rounded-xl p-3 shadow-2xl w-56 space-y-2">
                  <span className="text-[10px] font-semibold text-[#8C7625] block">
                    Litdom Brand Palette
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {LITDOM_QUICK_COLORS.map((col) => (
                      <button
                        key={col}
                        onClick={() => {
                          handleUpdateBox(selectedBox.id, { color: col });
                          setIsColorPickerOpen(false);
                        }}
                        className="w-7 h-7 rounded-lg border border-white/20 active:scale-95 transition-all"
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>

                  <div className="pt-2 border-t border-[#212128] flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedBox.color}
                      onChange={(e) => handleUpdateBox(selectedBox.id, { color: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={selectedBox.color}
                      onChange={(e) => handleUpdateBox(selectedBox.id, { color: e.target.value })}
                      className="bg-[#0B0B0F] border border-[#212128] text-xs font-mono text-[#FFF8E7] px-2 py-1 rounded w-full uppercase"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Duplicate & Delete Buttons */}
            <button
              onClick={() => handleDuplicateBox(selectedBox)}
              className="p-1.5 rounded-lg bg-[#0B0B0F] hover:bg-[#212128] text-[#FFF8E7]/70 hover:text-[#D4AF37]"
              title="Duplicate box"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteBox(selectedBox.id)}
              className="p-1.5 rounded-lg bg-[#0B0B0F] hover:bg-red-950/40 text-[#FFF8E7]/70 hover:text-red-400"
              title="Delete box"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-[#FFF8E7]/50 py-1">
            Select or click any text box on the canvas to edit typography, size, and layout.
          </div>
        )}

        {/* Global Toolbar Buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={handleAddFourStandardBoxes}
            className="px-2.5 py-1.5 bg-[#212128] hover:bg-[#2a2a35] border border-[#D4AF37]/50 text-[#D4AF37] text-xs font-bold rounded-lg flex items-center gap-1 active:scale-95"
            title="Add standard 4 boxes (TITLE, SUBTITLE, PARAGRAPH 1, CTA)"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="hidden md:inline">Standard 4 Boxes</span>
            <span className="md:hidden">4 Boxes</span>
          </button>

          <button
            onClick={handleAddTextBox}
            className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Box</span>
          </button>
        </div>
      </div>

      {/* WORKSPACE: CANVAS (CANVA/ADOBE EXPERIENCE) + SIDE PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Canvas Area (8 cols on lg) */}
        <div className="lg:col-span-8 bg-[#121216] border border-[#212128] rounded-2xl p-3 sm:p-6 flex flex-col items-center justify-center min-h-[500px] overflow-hidden relative">
          <div
            ref={canvasContainerRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative select-none shadow-2xl rounded-lg overflow-hidden border border-[#212128]"
            style={{
              width:
                zoomLevel === 'fit'
                  ? 'min(100%, 540px)'
                  : `${Math.round(activePage.originalWidth * (zoomLevel as number))}px`,
              aspectRatio: `${aspectRatio}`,
              maxHeight: zoomLevel === 'fit' ? '680px' : 'none',
              touchAction: 'none',
            }}
          >
            {/* Background Image */}
            <img
              src={activePage.imageUrl}
              alt={activePage.name}
              className="w-full h-full object-cover pointer-events-none"
            />

            {/* INTERACTIVE TEXT BOX OVERLAYS WITH CANVA/ADOBE HANDLES */}
            {activePage.textBoxes.map((box) => {
              const isSelected = selectedBoxId === box.id;
              const hasOverflow = overflowingBoxes.includes(box.id);

              return (
                <div
                  key={box.id}
                  onPointerDown={(e) => handlePointerDown(e, box, 'move')}
                  className={`absolute transition-shadow ${
                    isSelected
                      ? 'border-2 border-[#D4AF37] ring-2 ring-[#D4AF37]/30 z-30 shadow-2xl cursor-move'
                      : 'border border-dashed border-[#D4AF37]/50 hover:border-[#D4AF37] z-10 cursor-pointer'
                  }`}
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                    backgroundColor: box.backgroundColor || 'transparent',
                  }}
                >
                  {/* Field Label Badge */}
                  <div
                    className={`absolute -top-5 left-0 px-2 py-0.5 text-[9px] font-bold rounded-t flex items-center gap-1 whitespace-nowrap pointer-events-none ${
                      isSelected
                        ? 'bg-[#D4AF37] text-[#0B0B0F]'
                        : 'bg-[#17171C]/90 text-[#F4D58D] border border-b-0 border-[#212128]'
                    }`}
                  >
                    <span>{box.fieldLabel}</span>
                    {hasOverflow && (
                      <span className="text-red-500 font-extrabold" title="Text exceeds box bounds!">
                        ! OVERFLOW
                      </span>
                    )}
                  </div>

                  {/* Text Content */}
                  <div
                    className="w-full h-full overflow-hidden p-1 flex flex-col justify-start pointer-events-none"
                    style={{
                      fontFamily: box.fontFamily,
                      fontSize: `clamp(9px, ${box.fontSize * 0.28}px, 32px)`,
                      fontWeight: box.fontWeight,
                      fontStyle: box.fontStyle,
                      color: box.color,
                      textAlign: box.textAlign,
                      lineHeight: box.lineHeight,
                    }}
                  >
                    {box.content !== '' ? (
                      <span className="break-words whitespace-pre-wrap">{box.content}</span>
                    ) : (
                      <span className="text-white/20 italic text-[10px] select-none">
                        [Empty text box: {box.fieldLabel}]
                      </span>
                    )}
                  </div>

                  {/* CANVA-STYLE 8-WAY RESIZE HANDLES (CORNER CIRCLES & EDGE PILLS) */}
                  {isSelected && (
                    <>
                      {/* Top-Left Corner */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, box, 'resize-nw')}
                        className="absolute -top-2 -left-2 w-4 h-4 bg-[#D4AF37] rounded-full border-2 border-[#0B0B0F] shadow cursor-nwse-resize z-40 active:scale-125"
                      />
                      {/* Top-Right Corner */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, box, 'resize-ne')}
                        className="absolute -top-2 -right-2 w-4 h-4 bg-[#D4AF37] rounded-full border-2 border-[#0B0B0F] shadow cursor-nesw-resize z-40 active:scale-125"
                      />
                      {/* Bottom-Left Corner */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, box, 'resize-sw')}
                        className="absolute -bottom-2 -left-2 w-4 h-4 bg-[#D4AF37] rounded-full border-2 border-[#0B0B0F] shadow cursor-nesw-resize z-40 active:scale-125"
                      />
                      {/* Bottom-Right Corner */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, box, 'resize-se')}
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-[#D4AF37] rounded-full border-2 border-[#0B0B0F] shadow cursor-nwse-resize z-40 active:scale-125"
                      />

                      {/* Right Edge (Width / Length Handle) */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, box, 'resize-e')}
                        className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-6 bg-[#D4AF37] rounded-full border border-[#0B0B0F] shadow cursor-ew-resize z-40 active:scale-125 flex items-center justify-center"
                        title="Drag to resize box width / length"
                      />

                      {/* Bottom Edge (Height Handle) */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, box, 'resize-s')}
                        className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-6 h-3 bg-[#D4AF37] rounded-full border border-[#0B0B0F] shadow cursor-ns-resize z-40 active:scale-125 flex items-center justify-center"
                        title="Drag to resize box height"
                      />

                      {/* Left Edge (Width Handle) */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, box, 'resize-w')}
                        className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-6 bg-[#D4AF37] rounded-full border border-[#0B0B0F] shadow cursor-ew-resize z-40 active:scale-125"
                      />

                      {/* Top Edge (Height Handle) */}
                      <div
                        onPointerDown={(e) => handlePointerDown(e, box, 'resize-n')}
                        className="absolute top-[-6px] left-1/2 -translate-x-1/2 w-6 h-3 bg-[#D4AF37] rounded-full border border-[#0B0B0F] shadow cursor-ns-resize z-40 active:scale-125"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-[11px] text-[#FFF8E7]/50 mt-3 flex items-center gap-2">
            <Move className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>
              <strong>Canva-Style Gestures:</strong> Drag center to move · Drag gold handles to resize width & height · Use top bar for font size
            </span>
          </div>
        </div>

        {/* Side Panel: Quick Text Input & Box List (4 cols on lg) */}
        <div className="lg:col-span-4 bg-[#17171C] border border-[#212128] rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#212128]">
            <h4 className="text-xs font-bold text-[#FFF8E7] flex items-center gap-1.5">
              <Type className="w-4 h-4 text-[#D4AF37]" />
              <span>Direct Text Editor</span>
            </h4>
            {selectedBox && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#212128] text-[#D4AF37] font-mono">
                {selectedBox.fieldLabel}
              </span>
            )}
          </div>

          {selectedBox ? (
            <div className="space-y-3">
              {/* Text Area */}
              <div>
                <label className="block text-[11px] font-semibold text-[#FFF8E7] mb-1">
                  Artwork Text Content
                </label>
                <textarea
                  value={selectedBox.content}
                  onChange={(e) => handleUpdateBox(selectedBox.id, { content: e.target.value })}
                  rows={4}
                  placeholder="Type or paste artwork text here..."
                  className="w-full bg-[#0B0B0F] border border-[#212128] focus:border-[#D4AF37] text-xs text-[#FFF8E7] p-3 rounded-xl resize-none"
                />
              </div>

              {/* Overflow Notice if detected */}
              {overflowingBoxes.includes(selectedBox.id) && (
                <div className="p-3 bg-red-950/40 border border-red-800 text-red-200 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <div>
                    <span className="font-semibold">Text Exceeds Box Height</span>
                    <p className="text-[10px] text-red-300 mt-0.5">
                      Increase box height using the bottom handle or reduce font size.
                    </p>
                  </div>
                </div>
              )}

              {/* Box Dimension & Coordinate Quick Sliders */}
              <div className="p-3 bg-[#0B0B0F] border border-[#212128] rounded-xl space-y-2.5">
                <span className="text-[11px] font-semibold text-[#8C7625] block">
                  Fine-Tune Dimensions & Position
                </span>

                <div>
                  <div className="flex justify-between text-[10px] text-[#FFF8E7]/70 mb-0.5">
                    <span>Width (Length)</span>
                    <span className="font-mono text-[#D4AF37]">{selectedBox.width}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={selectedBox.width}
                    onChange={(e) =>
                      handleUpdateBox(selectedBox.id, { width: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-[#D4AF37] h-1.5 bg-[#17171C] rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-[#FFF8E7]/70 mb-0.5">
                    <span>Height</span>
                    <span className="font-mono text-[#D4AF37]">{selectedBox.height}%</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="90"
                    value={selectedBox.height}
                    onChange={(e) =>
                      handleUpdateBox(selectedBox.id, { height: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-[#D4AF37] h-1.5 bg-[#17171C] rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={() => onNavigateToTypography(selectedBox.id)}
                  className="flex-1 py-2 px-3 bg-[#212128] hover:bg-[#2a2a35] text-[#D4AF37] border border-[#8C7625]/40 hover:border-[#D4AF37] text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Advanced Effects & Fonts</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 space-y-3">
              <p className="text-xs text-[#FFF8E7]/50">No text box selected.</p>
              <button
                onClick={handleAddTextBox}
                className="px-4 py-2 bg-[#D4AF37] text-[#0B0B0F] font-bold text-xs rounded-lg hover:bg-[#F4D58D]"
              >
                Add Text Box
              </button>
            </div>
          )}

          {/* List of All Text Boxes on this Page */}
          <div className="pt-3 border-t border-[#212128] space-y-2">
            <span className="text-[11px] font-semibold text-[#8C7625] block">
              Layers on Page {activePage.pageNumber} ({activePage.textBoxes.length})
            </span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {activePage.textBoxes.map((box) => (
                <button
                  key={box.id}
                  onClick={() => setSelectedBoxId(box.id)}
                  className={`w-full p-2 rounded-lg text-left text-xs transition-all flex items-center justify-between gap-2 ${
                    box.id === selectedBoxId
                      ? 'bg-[#D4AF37] text-[#0B0B0F] font-bold'
                      : 'bg-[#0B0B0F] hover:bg-[#212128] text-[#FFF8E7]/80'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/30 shrink-0"
                      style={{ backgroundColor: box.color }}
                    />
                    <span className="font-mono text-[11px] truncate">{box.fieldLabel}</span>
                  </div>
                  <span className="text-[10px] opacity-75 truncate max-w-[120px]">
                    {box.content ? `"${box.content.slice(0, 16)}..."` : '[Empty]'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
