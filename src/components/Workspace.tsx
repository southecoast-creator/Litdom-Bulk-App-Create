/**
 * Litdom Batch Studio - Screen 2: Unified Workspace (Single Screen, Zero Tabs)
 * Top bar, responsive cached canvas, touch-drag on canvas, active page text editors,
 * shared template style panel, bottom sheets triggers, and always-visible thumbnail strip.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  FileSpreadsheet,
  Download,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Copy,
  Upload,
  Type,
  Palette,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Minus,
  Check,
  HardDrive,
  Sliders,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Project, TextBoxTemplate, DesignPage, CustomFont, StoredFontRecord } from '../types';
import {
  saveProject,
  storeImageFile,
  getThumbnailBlob,
  getOriginalImageBlob,
  createManagedObjectUrl,
  revokeManagedObjectUrl,
  revokeAllManagedObjectUrls,
} from '../utils/db';
import {
  renderDesignToCanvas,
  preloadTemplateFonts,
  BUILTIN_FONTS,
  clearDecodedImageCache,
} from '../utils/canvasEngine';
import { populateDesignsFromSpreadsheet } from '../utils/spreadsheetEngine';
import { loadAllStoredFonts } from '../utils/fontManager';
import { SpreadsheetSheet } from './SpreadsheetSheet';
import { DownloadSheet } from './DownloadSheet';
import { FontManagerModal } from './FontManagerModal';

type CanvasHandleType = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

interface WorkspaceProps {
  project: Project;
  onBackToDashboard: () => void;
  onUpdateProject: (updated: Project) => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  project,
  onBackToDashboard,
  onUpdateProject,
}) => {
  const [activePageIndex, setActivePageIndex] = useState<number>(0);

  // Active page & its per-design text boxes (or fallback to project template)
  const activePage: DesignPage | undefined = project.pages[activePageIndex];
  const activeBoxes: TextBoxTemplate[] =
    activePage?.textBoxes && activePage.textBoxes.length > 0
      ? activePage.textBoxes
      : project.template;

  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(
    activeBoxes[0]?.id || null
  );

  // Style Scope Switch: 'this' (current design only) | 'all' (all designs)
  const [styleScope, setStyleScope] = useState<'this' | 'all'>('this');

  // Bottom Sheets & Modals
  const [isSpreadsheetOpen, setIsSpreadsheetOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isFontManagerOpen, setIsFontManagerOpen] = useState(false);

  // Installed Custom Fonts from IndexedDB
  const [installedFonts, setInstalledFonts] = useState<StoredFontRecord[]>([]);

  // Save Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mobile Bottom Panel Tab
  const [mobilePanelTab, setMobilePanelTab] = useState<'text' | 'style'>('text');

  // Thumbnail Object URLs cache: pageId -> objectUrl
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  // Background Image strictly bound to activePage.imageId: { imageId, blob }
  const [currentImageData, setCurrentImageData] = useState<{
    imageId: string;
    blob: Blob;
  } | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState<boolean>(false);

  // Canvas Refs & Dimensions
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // File Input Refs for Uploads
  const batchUploadRef = useRef<HTMLInputElement>(null);
  const singleUploadRef = useRef<HTMLInputElement>(null);

  // 4-Corner & 8-Way Drag & Resize State
  const [activeHandle, setActiveHandle] = useState<CanvasHandleType | null>(null);
  const [dragStart, setDragStart] = useState<{
    mouseX: number;
    mouseY: number;
    boxX: number;
    boxY: number;
    boxW: number;
    boxH: number;
  } | null>(null);

  const selectedBox: TextBoxTemplate | undefined =
    activeBoxes.find((b) => b.id === selectedBoxId) || activeBoxes[0];

  // Keep selectedBoxId valid when active page changes
  useEffect(() => {
    if (!selectedBox && activeBoxes.length > 0) {
      setSelectedBoxId(activeBoxes[0].id);
    }
  }, [activeBoxes, selectedBox]);

  // Page Switch Handler: Immediately clears current image to avoid showing stale background
  const handleSelectPage = useCallback((newIndex: number) => {
    if (newIndex === activePageIndex) return;
    setCurrentImageData(null);
    setActivePageIndex(newIndex);
  }, [activePageIndex]);

  // Load custom fonts on mount
  useEffect(() => {
    loadAllStoredFonts().then((fonts) => {
      setInstalledFonts(fonts);
    });
  }, [isFontManagerOpen]);

  // Clean activePageIndex if pages change
  useEffect(() => {
    if (activePageIndex >= project.pages.length && project.pages.length > 0) {
      setActivePageIndex(project.pages.length - 1);
    }
  }, [project.pages.length, activePageIndex]);

  // Load Active Page's Original Image Blob with cancel token and strict ID matching
  useEffect(() => {
    if (!activePage) {
      setCurrentImageData(null);
      setIsLoadingImage(false);
      return;
    }

    const targetImageId = activePage.imageId;
    // Clear immediately if imageId doesn't match
    setCurrentImageData((prev) => (prev?.imageId === targetImageId ? prev : null));
    setIsLoadingImage(true);

    let isCancelled = false;

    getOriginalImageBlob(targetImageId)
      .then((blob) => {
        if (!isCancelled && blob) {
          setCurrentImageData({ imageId: targetImageId, blob });
        }
      })
      .catch((err) => {
        console.error('Failed to load image blob for design:', err);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingImage(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activePage?.id, activePage?.imageId]);

  // Load Thumbnail URLs for all pages
  useEffect(() => {
    let isCancelled = false;
    const loadThumbnails = async () => {
      const urls: Record<string, string> = {};
      for (const page of project.pages) {
        if (!thumbnailUrls[page.id]) {
          const thumbBlob = await getThumbnailBlob(page.imageId);
          if (thumbBlob) {
            urls[page.id] = createManagedObjectUrl(thumbBlob);
          }
        } else {
          urls[page.id] = thumbnailUrls[page.id];
        }
      }
      if (!isCancelled) {
        setThumbnailUrls(urls);
      }
    };

    loadThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [project.pages]);

  // Clean up object URLs on component unmount
  useEffect(() => {
    return () => {
      revokeAllManagedObjectUrls();
      clearDecodedImageCache();
    };
  }, []);

  // Debounced Auto-Save to IndexedDB (~600ms)
  const triggerAutoSave = useCallback(
    (updatedProj: Project) => {
      setSaveStatus('saving');
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveProject(updatedProj);
          setSaveStatus('saved');
        } catch (err) {
          console.error('Failed to auto-save:', err);
          setSaveStatus('error');
        }
      }, 600);
    },
    []
  );

  // Save on tab hide / pagehide
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveProject(project).catch(console.error);
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleVisibilityChange);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
    };
  }, [project]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Render Canvas: Only draw when currentImageData.imageId === activePage.imageId
  const redrawCanvas = useCallback(() => {
    if (
      !canvasRef.current ||
      !activePage ||
      !currentImageData ||
      currentImageData.imageId !== activePage.imageId ||
      !canvasContainerRef.current
    ) {
      return;
    }

    const containerWidth = canvasContainerRef.current.clientWidth || 600;
    const aspect = (activePage.width || 1000) / (activePage.height || 1000);
    const targetW = Math.min(containerWidth, activePage.width || 1000);
    const targetH = Math.round(targetW / aspect);

    renderDesignToCanvas(
      canvasRef.current,
      activeBoxes,
      activePage,
      currentImageData.blob,
      {
        showBoundingBoxes: true,
        selectedBoxId,
        targetWidth: targetW,
        targetHeight: targetH,
      }
    );
  }, [activePage, currentImageData, activeBoxes, selectedBoxId]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Handle Updates to Style: This design only vs All designs
  const handleUpdateStyle = (
    boxId: string,
    updates: Partial<TextBoxTemplate>
  ) => {
    if (!activePage) return;
    const targetBox = activeBoxes.find((b) => b.id === boxId);
    const targetLabel = targetBox?.fieldLabel;

    if (styleScope === 'this') {
      // 1. Update ONLY the active design's text boxes
      const updatedBoxes = activeBoxes.map((b) =>
        b.id === boxId ? { ...b, ...updates } : b
      );
      const updatedPages = project.pages.map((p, idx) =>
        idx === activePageIndex ? { ...p, textBoxes: updatedBoxes } : p
      );
      const updatedProj: Project = {
        ...project,
        pages: updatedPages,
        updatedAt: Date.now(),
      };
      onUpdateProject(updatedProj);
      triggerAutoSave(updatedProj);
    } else {
      // 2. Update ALL designs matching this fieldLabel, plus project.template
      const updatedTemplate = project.template.map((b) =>
        b.id === boxId || (targetLabel && b.fieldLabel === targetLabel)
          ? { ...b, ...updates }
          : b
      );
      const updatedPages = project.pages.map((p) => {
        const pBoxes =
          p.textBoxes && p.textBoxes.length > 0 ? p.textBoxes : project.template;
        const updatedPBoxes = pBoxes.map((b) =>
          b.id === boxId || (targetLabel && b.fieldLabel === targetLabel)
            ? { ...b, ...updates }
            : b
        );
        return {
          ...p,
          textBoxes: updatedPBoxes,
        };
      });
      const updatedProj: Project = {
        ...project,
        template: updatedTemplate,
        pages: updatedPages,
        updatedAt: Date.now(),
      };
      onUpdateProject(updatedProj);
      triggerAutoSave(updatedProj);
    }
  };

  // Backward compatible alias for style controls
  const handleUpdateTemplateBox = handleUpdateStyle;

  // Dragging/resizing text affects ONLY the current design
  const handleUpdateCurrentDesignBoxGeometry = (
    boxId: string,
    geometry: { x: number; y: number; width: number; height: number }
  ) => {
    if (!activePage) return;
    const updatedBoxes = activeBoxes.map((b) =>
      b.id === boxId ? { ...b, ...geometry } : b
    );
    const updatedPages = project.pages.map((p, idx) =>
      idx === activePageIndex ? { ...p, textBoxes: updatedBoxes } : p
    );
    const updatedProj: Project = {
      ...project,
      pages: updatedPages,
      updatedAt: Date.now(),
    };
    onUpdateProject(updatedProj);
    triggerAutoSave(updatedProj);
  };

  // Copy this design's layout to all designs
  const handleCopyLayoutToAllDesigns = () => {
    if (!activePage) return;
    const currentBoxes = activeBoxes;

    const updatedPages = project.pages.map((p) => ({
      ...p,
      textBoxes: JSON.parse(JSON.stringify(currentBoxes)),
    }));

    const updatedProj: Project = {
      ...project,
      template: JSON.parse(JSON.stringify(currentBoxes)),
      pages: updatedPages,
      updatedAt: Date.now(),
    };

    onUpdateProject(updatedProj);
    triggerAutoSave(updatedProj);
    showToast('Layout copied to all designs');
  };

  // Handle Updates to Active Page's Text Values
  const handleUpdatePageValue = (fieldLabel: string, newValue: string) => {
    if (!activePage) return;
    const updatedPages = project.pages.map((p, idx) => {
      if (idx !== activePageIndex) return p;
      return {
        ...p,
        values: {
          ...p.values,
          [fieldLabel]: newValue,
        },
      };
    });
    const updatedProj: Project = {
      ...project,
      pages: updatedPages,
      updatedAt: Date.now(),
    };
    onUpdateProject(updatedProj);
    triggerAutoSave(updatedProj);
  };

  // Add New Field
  const handleAddNewField = (fieldName?: string) => {
    const name =
      fieldName ||
      prompt('Enter new field label (e.g., Headline, Paragraph 2, Footer):');
    if (!name || !name.trim()) return;

    const cleanLabel = name.trim();
    const newBox: TextBoxTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fieldLabel: cleanLabel,
      x: 15,
      y: Math.min(80, 20 + activeBoxes.length * 10),
      width: 70,
      height: 10,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 24,
      fontWeight: '500',
      fontStyle: 'normal',
      textAlign: 'center',
      color: '#FFF8E7',
      lineHeight: 1.3,
      letterSpacing: 0,
    };

    const updatedTemplate = [...project.template, newBox];
    const updatedPages = project.pages.map((p) => {
      const pBoxes =
        p.textBoxes && p.textBoxes.length > 0 ? p.textBoxes : project.template;
      return {
        ...p,
        textBoxes: [...pBoxes, JSON.parse(JSON.stringify(newBox))],
      };
    });

    const updatedProj: Project = {
      ...project,
      template: updatedTemplate,
      pages: updatedPages,
      updatedAt: Date.now(),
    };
    onUpdateProject(updatedProj);
    setSelectedBoxId(newBox.id);
    triggerAutoSave(updatedProj);
  };

  // Delete Field
  const handleDeleteField = (boxId: string) => {
    if (activeBoxes.length <= 1) {
      alert('A design must have at least one text field.');
      return;
    }
    const targetBox = activeBoxes.find((b) => b.id === boxId);
    const targetLabel = targetBox?.fieldLabel;

    if (styleScope === 'this') {
      const updatedBoxes = activeBoxes.filter((b) => b.id !== boxId);
      const updatedPages = project.pages.map((p, idx) =>
        idx === activePageIndex ? { ...p, textBoxes: updatedBoxes } : p
      );
      const updatedProj: Project = {
        ...project,
        pages: updatedPages,
        updatedAt: Date.now(),
      };
      onUpdateProject(updatedProj);
      setSelectedBoxId(updatedBoxes[0]?.id || null);
      triggerAutoSave(updatedProj);
    } else {
      const updatedTemplate = project.template.filter(
        (b) => b.id !== boxId && b.fieldLabel !== targetLabel
      );
      const updatedPages = project.pages.map((p) => {
        const pBoxes =
          p.textBoxes && p.textBoxes.length > 0 ? p.textBoxes : project.template;
        return {
          ...p,
          textBoxes: pBoxes.filter(
            (b) => b.id !== boxId && b.fieldLabel !== targetLabel
          ),
        };
      });
      const updatedProj: Project = {
        ...project,
        template: updatedTemplate,
        pages: updatedPages,
        updatedAt: Date.now(),
      };
      onUpdateProject(updatedProj);
      setSelectedBoxId(updatedTemplate[0]?.id || null);
      triggerAutoSave(updatedProj);
    }
  };

  // Upload Designs: New designs start as a copy of the current design's layout
  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const currentLayout = activeBoxes;
    const newPages: DesignPage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      try {
        const stored = await storeImageFile(file);
        const pageIdx = project.pages.length + newPages.length;
        newPages.push({
          id: `page_${Date.now()}_${pageIdx}_${Math.random().toString(36).substring(2, 5)}`,
          imageId: stored.imageId,
          name: file.name.replace(/\.[^/.]+$/, ''),
          width: stored.width,
          height: stored.height,
          values: {},
          textBoxes: JSON.parse(JSON.stringify(currentLayout)),
        });
      } catch (err) {
        console.error('Failed to store uploaded design:', err);
      }
    }

    if (newPages.length === 0) return;

    let combinedPages = [...project.pages, ...newPages];

    // If spreadsheet was previously loaded, re-apply the stored sheet automatically!
    if (project.lastSpreadsheet) {
      const popResult = populateDesignsFromSpreadsheet(
        combinedPages,
        project.lastSpreadsheet.rows,
        project.lastSpreadsheet.mappings
      );
      combinedPages = popResult.pages;
    }

    const updatedProj: Project = {
      ...project,
      pages: combinedPages,
      updatedAt: Date.now(),
    };

    onUpdateProject(updatedProj);
    triggerAutoSave(updatedProj);
    showToast(`${newPages.length} design${newPages.length > 1 ? 's' : ''} added`);
  };

  // Canvas Pointer Events: Touch & 4-Corner / 8-Way Drag & Resize
  const startAction = (
    handle: CanvasHandleType,
    box: TextBoxTemplate,
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    setSelectedBoxId(box.id);
    setActiveHandle(handle);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: box.x,
      boxY: box.y,
      boxW: box.width,
      boxH: box.height,
    });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // safe fallback
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mousePxX = e.clientX - rect.left;
    const mousePxY = e.clientY - rect.top;

    // 1. If a box is selected, test its 4 corners and 4 edges first!
    if (selectedBox) {
      const boxPxX = (selectedBox.x / 100) * rect.width;
      const boxPxY = (selectedBox.y / 100) * rect.height;
      const boxPxW = (selectedBox.width / 100) * rect.width;
      const boxPxH = (selectedBox.height / 100) * rect.height;

      // Generous 24px touch hit tolerance for corners and edges on mobile
      const hitRadius = 24;
      const distSq = (x1: number, y1: number, x2: number, y2: number) =>
        (x1 - x2) ** 2 + (y1 - y2) ** 2;

      // 4 Corners:
      // NW (top-left)
      if (distSq(mousePxX, mousePxY, boxPxX, boxPxY) <= hitRadius ** 2) {
        startAction('nw', selectedBox, e);
        return;
      }
      // NE (top-right)
      if (distSq(mousePxX, mousePxY, boxPxX + boxPxW, boxPxY) <= hitRadius ** 2) {
        startAction('ne', selectedBox, e);
        return;
      }
      // SE (bottom-right)
      if (distSq(mousePxX, mousePxY, boxPxX + boxPxW, boxPxY + boxPxH) <= hitRadius ** 2) {
        startAction('se', selectedBox, e);
        return;
      }
      // SW (bottom-left)
      if (distSq(mousePxX, mousePxY, boxPxX, boxPxY + boxPxH) <= hitRadius ** 2) {
        startAction('sw', selectedBox, e);
        return;
      }

      // 4 Edge Midpoints:
      // E (right edge)
      if (distSq(mousePxX, mousePxY, boxPxX + boxPxW, boxPxY + boxPxH / 2) <= hitRadius ** 2) {
        startAction('e', selectedBox, e);
        return;
      }
      // W (left edge)
      if (distSq(mousePxX, mousePxY, boxPxX, boxPxY + boxPxH / 2) <= hitRadius ** 2) {
        startAction('w', selectedBox, e);
        return;
      }
      // S (bottom edge)
      if (distSq(mousePxX, mousePxY, boxPxX + boxPxW / 2, boxPxY + boxPxH) <= hitRadius ** 2) {
        startAction('s', selectedBox, e);
        return;
      }
      // N (top edge)
      if (distSq(mousePxX, mousePxY, boxPxX + boxPxW / 2, boxPxY) <= hitRadius ** 2) {
        startAction('n', selectedBox, e);
        return;
      }

      // Inside selected box: move
      if (
        mousePxX >= boxPxX &&
        mousePxX <= boxPxX + boxPxW &&
        mousePxY >= boxPxY &&
        mousePxY <= boxPxY + boxPxH
      ) {
        startAction('move', selectedBox, e);
        return;
      }
    }

    // 2. Otherwise hit-test all active boxes for current design (top-most first)
    const clickXPercent = (mousePxX / rect.width) * 100;
    const clickYPercent = (mousePxY / rect.height) * 100;

    for (let i = activeBoxes.length - 1; i >= 0; i--) {
      const b = activeBoxes[i];
      if (
        clickXPercent >= b.x &&
        clickXPercent <= b.x + b.width &&
        clickYPercent >= b.y &&
        clickYPercent <= b.y + b.height
      ) {
        startAction('move', b, e);
        return;
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeHandle || !dragStart || !selectedBoxId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const deltaX = ((e.clientX - dragStart.mouseX) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStart.mouseY) / rect.height) * 100;

    let newX = dragStart.boxX;
    let newY = dragStart.boxY;
    let newW = dragStart.boxW;
    let newH = dragStart.boxH;

    switch (activeHandle) {
      case 'move':
        newX = Math.max(0, Math.min(100 - dragStart.boxW, Math.round(dragStart.boxX + deltaX)));
        newY = Math.max(0, Math.min(100 - dragStart.boxH, Math.round(dragStart.boxY + deltaY)));
        break;

      case 'se': // Bottom-right corner: expand/reduce width and height
        newW = Math.max(10, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxW + deltaX)));
        newH = Math.max(4, Math.min(100 - dragStart.boxY, Math.round(dragStart.boxH + deltaY)));
        break;

      case 'sw': // Bottom-left corner: expand/reduce width and height, adjust X
        newW = Math.max(10, Math.round(dragStart.boxW - deltaX));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 10, Math.round(dragStart.boxX + deltaX)));
        newH = Math.max(4, Math.min(100 - dragStart.boxY, Math.round(dragStart.boxH + deltaY)));
        break;

      case 'ne': // Top-right corner: expand/reduce width and height, adjust Y
        newW = Math.max(10, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxX + deltaX)));
        newH = Math.max(4, Math.round(dragStart.boxH - deltaY));
        newY = Math.max(0, Math.min(dragStart.boxY + dragStart.boxH - 4, Math.round(dragStart.boxY + deltaY)));
        break;

      case 'nw': // Top-left corner: expand/reduce width and height, adjust X and Y
        newW = Math.max(10, Math.round(dragStart.boxW - deltaX));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 10, Math.round(dragStart.boxX + deltaX)));
        newH = Math.max(4, Math.round(dragStart.boxH - deltaY));
        newY = Math.max(0, Math.min(dragStart.boxY + dragStart.boxH - 4, Math.round(dragStart.boxY + deltaY)));
        break;

      case 'e': // Right edge: width
        newW = Math.max(10, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxW + deltaX)));
        break;

      case 'w': // Left edge: x and width
        newW = Math.max(10, Math.round(dragStart.boxW - deltaX));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 10, Math.round(dragStart.boxX + deltaX)));
        break;

      case 's': // Bottom edge: height
        newH = Math.max(4, Math.min(100 - dragStart.boxY, Math.round(dragStart.boxH + deltaY)));
        break;

      case 'n': // Top edge: y and height
        newH = Math.max(4, Math.round(dragStart.boxH - deltaY));
        newY = Math.max(0, Math.min(dragStart.boxY + dragStart.boxH - 4, Math.round(dragStart.boxY + deltaY)));
        break;
    }

    // Dragging/resizing text affects ONLY the current design
    handleUpdateCurrentDesignBoxGeometry(selectedBoxId, { x: newX, y: newY, width: newW, height: newH });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeHandle) {
      setActiveHandle(null);
      setDragStart(null);
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // safe fallback
      }
    }
  };


  return (
    <div className="min-h-screen bg-[#0B0B0F] text-[#FFF8E7] flex flex-col font-sans select-none pb-28">
      {/* 1. TOP APP BAR */}
      <header className="border-b border-[#212128] bg-[#121217]/95 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Back & Project Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onBackToDashboard}
            className="p-2 rounded-xl text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <input
              type="text"
              value={project.name}
              onChange={(e) => {
                const updated = { ...project, name: e.target.value };
                onUpdateProject(updated);
                triggerAutoSave(updated);
              }}
              className="bg-transparent font-serif font-bold text-sm sm:text-base text-[#FFF8E7] focus:outline-none focus:border-b focus:border-[#D4AF37] truncate max-w-[150px] sm:max-w-xs"
            />
            <div className="flex items-center gap-1.5 text-[10px]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  saveStatus === 'saved'
                    ? 'bg-emerald-400'
                    : saveStatus === 'saving'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-red-400'
                }`}
              />
              <span className="text-[#FFF8E7]/50 capitalize">
                {saveStatus === 'saved'
                  ? 'Saved'
                  : saveStatus === 'saving'
                  ? 'Saving…'
                  : 'Not saved – tap to retry'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Spreadsheet & Download Triggers */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsSpreadsheetOpen(true)}
            className="bg-[#1C1C24] hover:bg-[#262632] border border-[#333342] text-[#D4AF37] text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all min-h-[44px]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Spreadsheet</span>
          </button>

          <button
            onClick={() => setIsDownloadOpen(true)}
            className="bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] text-[#0B0B0F] text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/20 transition-all min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#D4AF37] text-[#0B0B0F] text-xs font-bold px-4 py-2 rounded-full shadow-2xl animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* 2. MAIN WORKSPACE BODY */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-2 sm:p-4 gap-4">
        {/* Left / Center Area: Canvas & Pagination */}
        <div className="flex-1 flex flex-col items-center justify-start space-y-3 min-w-0">
          {/* Pagination Controls */}
          {project.pages.length > 0 && (
            <div className="flex items-center justify-between w-full max-w-lg px-2">
              <button
                onClick={() => handleSelectPage(Math.max(0, activePageIndex - 1))}
                disabled={activePageIndex === 0}
                className="p-2 rounded-xl bg-[#17171C] border border-[#262632] text-[#FFF8E7]/70 hover:text-white disabled:opacity-30 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono font-bold text-[#D4AF37]">
                Design {activePageIndex + 1} of {project.pages.length}
              </span>

              <button
                onClick={() =>
                  handleSelectPage(
                    Math.min(project.pages.length - 1, activePageIndex + 1)
                  )
                }
                disabled={activePageIndex === project.pages.length - 1}
                className="p-2 rounded-xl bg-[#17171C] border border-[#262632] text-[#FFF8E7]/70 hover:text-white disabled:opacity-30 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Interactive Canvas Container */}
          <div
            ref={canvasContainerRef}
            className="w-full max-w-lg bg-[#121217] border border-[#262632] rounded-2xl overflow-hidden shadow-2xl relative flex items-center justify-center min-h-[340px]"
          >
            {project.pages.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <Upload className="w-10 h-10 text-[#D4AF37]/40 mx-auto" />
                <div className="text-sm font-semibold text-[#FFF8E7]">
                  No design backgrounds uploaded
                </div>
                <p className="text-xs text-[#FFF8E7]/50 max-w-xs mx-auto">
                  Use the upload buttons at the bottom to add background designs.
                </p>
                <button
                  onClick={() => batchUploadRef.current?.click()}
                  className="bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs px-4 py-2.5 rounded-xl transition-all min-h-[44px]"
                >
                  Batch Upload Designs
                </button>
              </div>
            ) : (
              <div className="relative w-full flex items-center justify-center">
                {(!currentImageData || currentImageData.imageId !== activePage?.imageId) && (
                  <div className="absolute inset-0 bg-[#121217] flex flex-col items-center justify-center gap-2 z-10 rounded-xl">
                    <div className="w-6 h-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
                    <span className="text-[11px] font-mono text-[#D4AF37]">
                      Loading Design {activePageIndex + 1}…
                    </span>
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  style={{ touchAction: 'none' }}
                  className="cursor-move max-w-full h-auto rounded-xl shadow-lg"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Area: Text Field Editors & Shared Template Style Panel */}
        {/* On Desktop: Side by Side; On Mobile: Docked Bottom Drawer */}
        <div className="w-full lg:w-96 flex flex-col gap-3">
          {/* Mobile Tab Switcher */}
          <div className="flex lg:hidden bg-[#17171C] p-1 rounded-xl border border-[#262632]">
            <button
              onClick={() => setMobilePanelTab('text')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all min-h-[40px] ${
                mobilePanelTab === 'text'
                  ? 'bg-[#D4AF37] text-[#0B0B0F]'
                  : 'text-[#FFF8E7]/60'
              }`}
            >
              Text for This Design
            </button>
            <button
              onClick={() => setMobilePanelTab('style')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all min-h-[40px] ${
                mobilePanelTab === 'style'
                  ? 'bg-[#D4AF37] text-[#0B0B0F]'
                  : 'text-[#FFF8E7]/60'
              }`}
            >
              Style & Layout
            </button>
          </div>

          {/* Section 1: Text Field Editors for Active Design */}
          <div
            className={`bg-[#17171C] border border-[#262632] rounded-2xl p-4 space-y-3 ${
              mobilePanelTab !== 'text' ? 'hidden lg:block' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
                Current Design Text
              </h3>
              <button
                onClick={() => handleAddNewField()}
                className="text-[11px] text-[#D4AF37] hover:underline flex items-center gap-1 min-h-[32px]"
              >
                <Plus className="w-3 h-3" />
                <span>Add Field</span>
              </button>
            </div>

            {activeBoxes.map((box) => {
              const val =
                activePage?.values[box.fieldLabel] !== undefined
                  ? activePage.values[box.fieldLabel]
                  : '';
              const isSelected = selectedBoxId === box.id;

              return (
                <div
                  key={box.id}
                  onClick={() => setSelectedBoxId(box.id)}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-[#D4AF37] bg-[#21212A]'
                      : 'border-[#262632] bg-[#121217]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold text-[#D4AF37] uppercase">
                      {box.fieldLabel}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteField(box.id);
                      }}
                      className="text-[#FFF8E7]/30 hover:text-red-400 p-1"
                      title="Delete Field"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <textarea
                    rows={box.height > 12 ? 2 : 1}
                    value={val}
                    placeholder={`Enter ${box.fieldLabel} text…`}
                    onChange={(e) =>
                      handleUpdatePageValue(box.fieldLabel, e.target.value)
                    }
                    className="w-full bg-[#0B0B0F] border border-[#333342] focus:border-[#D4AF37] rounded-lg p-2 text-xs text-[#FFF8E7] focus:outline-none resize-none"
                  />
                </div>
              );
            })}
          </div>

          {/* Section 2: Text Box Style Panel with Scope Switch */}
          {selectedBox && (
            <div
              className={`bg-[#17171C] border border-[#262632] rounded-2xl p-4 space-y-3.5 ${
                mobilePanelTab !== 'style' ? 'hidden lg:block' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
                  Style: {selectedBox.fieldLabel}
                </h3>
                <span className="text-[10px] text-[#FFF8E7]/40 font-mono">
                  Design {activePageIndex + 1} of {project.pages.length}
                </span>
              </div>

              {/* Style Scope Switch (Canva-style: This design only vs All designs) */}
              <div className="bg-[#121217] p-1.5 rounded-xl border border-[#2D2D38] space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold text-[#D4AF37]">Apply Changes To:</span>
                  <span className="text-[10px] text-[#FFF8E7]/50 font-mono">
                    {styleScope === 'this'
                      ? 'This design only'
                      : `All ${project.pages.length} designs`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStyleScope('this')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all min-h-[36px] flex items-center justify-center gap-1.5 ${
                      styleScope === 'this'
                        ? 'bg-[#D4AF37] text-[#0B0B0F] font-bold shadow-sm'
                        : 'text-[#FFF8E7]/70 hover:text-white'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>This design only</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStyleScope('all')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all min-h-[36px] flex items-center justify-center gap-1.5 ${
                      styleScope === 'all'
                        ? 'bg-[#D4AF37] text-[#0B0B0F] font-bold shadow-sm'
                        : 'text-[#FFF8E7]/70 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>All designs</span>
                  </button>
                </div>
              </div>

              {/* Copy this design's layout to all designs button */}
              <button
                type="button"
                onClick={handleCopyLayoutToAllDesigns}
                className="w-full bg-[#1C1C24] hover:bg-[#262632] border border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#D4AF37] text-xs font-semibold py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all min-h-[42px]"
                title="Copy box positions, sizes, and styles from this design to all other designs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy this design's layout to all designs</span>
              </button>

              {/* 1. Font Family & Font Manager Utility */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[#FFF8E7]/70">
                  <span className="font-semibold text-[#D4AF37]">Typography</span>
                  <button
                    onClick={() => setIsFontManagerOpen(true)}
                    className="text-xs text-[#D4AF37] hover:text-[#F4D58D] font-bold flex items-center gap-1 bg-[#21212A] hover:bg-[#2B2B38] px-2.5 py-1 rounded-lg border border-[#333342] transition-colors"
                  >
                    <Type className="w-3 h-3 text-[#D4AF37]" />
                    <span>Manage Fonts (.ttf/.otf)</span>
                  </button>
                </div>
                <select
                  value={selectedBox.fontFamily}
                  onChange={(e) =>
                    handleUpdateTemplateBox(selectedBox.id, { fontFamily: e.target.value })
                  }
                  className="w-full bg-[#121217] border border-[#333342] text-xs font-semibold text-[#FFF8E7] rounded-xl px-3 py-2.5 focus:border-[#D4AF37]"
                >
                  <optgroup label="Curated Fonts" className="bg-[#17171C] text-[#FFF8E7]">
                    {BUILTIN_FONTS.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name} ({f.category})
                      </option>
                    ))}
                  </optgroup>
                  {installedFonts.length > 0 && (
                    <optgroup label="Custom Uploaded Fonts" className="bg-[#17171C] text-[#D4AF37]">
                      {installedFonts.map((cf) => (
                        <option key={cf.id} value={cf.familyName}>
                          ★ {cf.familyName} ({cf.format.toUpperCase()})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>


              {/* 2. Font Size Stepper (Canva-style [-] [48px] [+]) */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#FFF8E7]/70">Font Size (1000px base)</span>
                <div className="flex items-center bg-[#121217] border border-[#333342] rounded-xl overflow-hidden">
                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        fontSize: Math.max(10, selectedBox.fontSize - 2),
                      })
                    }
                    className="px-2.5 py-1.5 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    value={selectedBox.fontSize}
                    onChange={(e) =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        fontSize: Math.max(8, parseInt(e.target.value, 10) || 8),
                      })
                    }
                    className="w-12 text-center text-xs font-mono font-bold text-[#FFF8E7] bg-transparent focus:outline-none"
                  />
                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        fontSize: Math.min(180, selectedBox.fontSize + 2),
                      })
                    }
                    className="px-2.5 py-1.5 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* 3. Weight, Italic & Alignment */}
              <div className="flex items-center justify-between gap-1 bg-[#121217] p-1 rounded-xl border border-[#333342]">
                <button
                  onClick={() =>
                    handleUpdateTemplateBox(selectedBox.id, {
                      fontWeight: selectedBox.fontWeight === '700' ? '400' : '700',
                    })
                  }
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] min-w-[36px] flex items-center justify-center ${
                    selectedBox.fontWeight === '700'
                      ? 'bg-[#D4AF37] text-[#0B0B0F]'
                      : 'text-[#FFF8E7]/60 hover:text-white'
                  }`}
                  title="Bold"
                >
                  <Bold className="w-4 h-4" />
                </button>

                <button
                  onClick={() =>
                    handleUpdateTemplateBox(selectedBox.id, {
                      fontStyle: selectedBox.fontStyle === 'italic' ? 'normal' : 'italic',
                    })
                  }
                  className={`p-1.5 rounded-lg text-xs italic transition-all min-h-[36px] min-w-[36px] flex items-center justify-center ${
                    selectedBox.fontStyle === 'italic'
                      ? 'bg-[#D4AF37] text-[#0B0B0F]'
                      : 'text-[#FFF8E7]/60 hover:text-white'
                  }`}
                  title="Italic"
                >
                  <Italic className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-[#333342]" />

                {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                  <button
                    key={align}
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, { textAlign: align })
                    }
                    className={`p-1.5 rounded-lg text-xs transition-all min-h-[36px] min-w-[36px] flex items-center justify-center ${
                      selectedBox.textAlign === align
                        ? 'bg-[#D4AF37] text-[#0B0B0F]'
                        : 'text-[#FFF8E7]/60 hover:text-white'
                    }`}
                  >
                    {align === 'left' && <AlignLeft className="w-4 h-4" />}
                    {align === 'center' && <AlignCenter className="w-4 h-4" />}
                    {align === 'right' && <AlignRight className="w-4 h-4" />}
                    {align === 'justify' && <AlignJustify className="w-4 h-4" />}
                  </button>
                ))}
              </div>

              {/* 4. Color & Swatches */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#FFF8E7]/70">Color</span>
                <div className="flex items-center gap-1.5">
                  {['#D4AF37', '#FFF8E7', '#F4D58D', '#0B0B0F', '#FFFFFF', '#EF4444'].map(
                    (hex) => (
                      <button
                        key={hex}
                        onClick={() =>
                          handleUpdateTemplateBox(selectedBox.id, { color: hex })
                        }
                        className={`w-6 h-6 rounded-full border transition-all ${
                          selectedBox.color === hex
                            ? 'border-white scale-110 shadow-md'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    )
                  )}
                  <input
                    type="color"
                    value={selectedBox.color}
                    onChange={(e) =>
                      handleUpdateTemplateBox(selectedBox.id, { color: e.target.value })
                    }
                    className="w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer"
                  />
                </div>
              </div>

              {/* 5. Box Dimensions: Easily Manipulatable Width & Height */}
              <div className="space-y-2.5 pt-1 border-t border-[#262632]">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#D4AF37]">Box Width (Length): {selectedBox.width}%</span>
                  <span className="text-[10px] text-[#FFF8E7]/40">4-Corner expandable</span>
                </div>

                {/* Width Slider + Steppers */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        width: Math.max(10, selectedBox.width - 5),
                      })
                    }
                    className="p-1.5 rounded-lg bg-[#121217] border border-[#333342] text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors"
                    title="Narrow width"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="range"
                    min="10"
                    max={100 - selectedBox.x}
                    value={selectedBox.width}
                    onChange={(e) =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        width: parseInt(e.target.value, 10),
                      })
                    }
                    className="flex-1 accent-[#D4AF37] h-1.5 bg-[#121217] rounded-lg cursor-pointer"
                  />

                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        width: Math.min(100 - selectedBox.x, selectedBox.width + 5),
                      })
                    }
                    className="p-1.5 rounded-lg bg-[#121217] border border-[#333342] text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors"
                    title="Widen width"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Width Quick Presets */}
                <div className="flex items-center gap-1.5">
                  {[40, 60, 75, 90, 100].map((w) => (
                    <button
                      key={w}
                      onClick={() =>
                        handleUpdateTemplateBox(selectedBox.id, {
                          width: Math.min(100 - selectedBox.x, w),
                        })
                      }
                      className={`flex-1 py-1 text-[10px] font-mono font-semibold rounded-lg border transition-all ${
                        selectedBox.width === w
                          ? 'bg-[#D4AF37] text-[#0B0B0F] border-[#D4AF37]'
                          : 'bg-[#121217] text-[#FFF8E7]/60 border-[#262632] hover:text-[#FFF8E7]'
                      }`}
                    >
                      {w}%
                    </button>
                  ))}
                </div>

                {/* Height (Length) Slider + Steppers */}
                <div className="pt-2">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="font-semibold text-[#D4AF37]">Box Height: {selectedBox.height}%</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        handleUpdateTemplateBox(selectedBox.id, {
                          height: Math.max(4, selectedBox.height - 2),
                        })
                      }
                      className="p-1.5 rounded-lg bg-[#121217] border border-[#333342] text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors"
                      title="Reduce height"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="range"
                      min="4"
                      max={100 - selectedBox.y}
                      value={selectedBox.height}
                      onChange={(e) =>
                        handleUpdateTemplateBox(selectedBox.id, {
                          height: parseInt(e.target.value, 10),
                        })
                      }
                      className="flex-1 accent-[#D4AF37] h-1.5 bg-[#121217] rounded-lg cursor-pointer"
                    />

                    <button
                      onClick={() =>
                        handleUpdateTemplateBox(selectedBox.id, {
                          height: Math.min(100 - selectedBox.y, selectedBox.height + 2),
                        })
                      }
                      className="p-1.5 rounded-lg bg-[#121217] border border-[#333342] text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors"
                      title="Expand height"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-[#FFF8E7]/40 pt-1 leading-relaxed">
                  💡 Tip: Drag directly on any of the 4 white-gold corner handles on the canvas to expand or shrink the text box freely.
                </p>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* 3. ALWAYS-VISIBLE HORIZONTALLY SCROLLABLE THUMBNAIL STRIP AT BOTTOM */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#121217]/95 backdrop-blur-md border-t border-[#262632] px-3 py-2 flex items-center gap-3 overflow-x-auto">
        {/* Upload Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            ref={batchUploadRef}
            type="file"
            multiple
            accept="image/png, image/jpeg, image/jpg"
            onChange={(e) => handleUploadFiles(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => batchUploadRef.current?.click()}
            className="bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs px-3 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/20 transition-all min-h-[44px] shrink-0"
            title="Batch Upload (many designs)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">Batch upload</span>
          </button>

          <input
            ref={singleUploadRef}
            type="file"
            accept="image/png, image/jpeg, image/jpg"
            onChange={(e) => handleUploadFiles(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => singleUploadRef.current?.click()}
            className="bg-[#1C1C24] hover:bg-[#262632] border border-[#333342] text-[#FFF8E7] text-xs font-semibold px-2.5 py-2.5 rounded-xl flex items-center gap-1 transition-all min-h-[44px] shrink-0"
            title="Single Upload"
          >
            <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="whitespace-nowrap hidden sm:inline">Single</span>
          </button>
        </div>

        <div className="h-8 w-px bg-[#262632] shrink-0" />

        {/* Thumbnails Carousel */}
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {project.pages.map((page, idx) => {
            const isActive = idx === activePageIndex;
            const thumbUrl = thumbnailUrls[page.id];

            return (
              <button
                key={page.id}
                onClick={() => handleSelectPage(idx)}
                className={`relative shrink-0 rounded-xl overflow-hidden border-2 transition-all min-h-[44px] ${
                  isActive
                    ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30 scale-105'
                    : 'border-[#262632] opacity-70 hover:opacity-100'
                }`}
                style={{ width: '64px', height: '64px' }}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={page.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[#1A1A24] flex items-center justify-center text-[10px] text-[#FFF8E7]/40">
                    #{idx + 1}
                  </div>
                )}
                <span className="absolute bottom-0.5 right-1 text-[9px] font-mono font-bold bg-black/70 px-1 rounded text-white">
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Spreadsheet Bottom Sheet */}
      <SpreadsheetSheet
        project={project}
        isOpen={isSpreadsheetOpen}
        onClose={() => setIsSpreadsheetOpen(false)}
        onUpdateProject={(updated) => {
          onUpdateProject(updated);
          triggerAutoSave(updated);
        }}
      />

      {/* Download Bottom Sheet */}
      <DownloadSheet
        project={project}
        activePageIndex={activePageIndex}
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />

      {/* Font Management Utility Modal */}
      <FontManagerModal
        isOpen={isFontManagerOpen}
        onClose={() => setIsFontManagerOpen(false)}
        selectedFontFamily={selectedBox?.fontFamily}
        onSelectFont={(familyName) => {
          if (selectedBox) {
            handleUpdateTemplateBox(selectedBox.id, { fontFamily: familyName });
          }
        }}
      />
    </div>
  );
};

