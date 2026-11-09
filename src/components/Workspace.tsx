/**
 * Litdom Batch Studio - Screen 2: Unified Workspace
 * Automatic text box height (like Canva), rich text word formatting & double-tap editor,
 * thumbnail strip multi-page deletion, in-memory undo/redo, RAF drawing coalescing,
 * and downscaled preview image caching.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  List as ListIcon,
  ListOrdered,
  ArrowLeft,
  Home,
  Menu,
  Share2,
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
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Minus,
  Check,
  Sliders,
  Layers,
  Sparkles,
  Undo2,
  Redo2,
  CheckSquare,
  Square,
  Edit2,
  Edit3,
  AlertTriangle,
  Grid,
  RefreshCw,
  SlidersHorizontal,
  X,
  Image as ImageIcon,
  Feather,
  RotateCw,
  RotateCcw,
  Move,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  Project,
  TextBoxTemplate,
  DesignPage,
  StoredFontRecord,
  TextRun,
} from '../types';
import {
  saveProject,
  storeImageFile,
  isImageFile,
  getThumbnailBlob,
  getPreviewImageBlob,
  createManagedObjectUrl,
  revokeAllManagedObjectUrls,
  deleteDesignsFromProjectAtomic,
} from '../utils/db';
import {
  renderDesignToCanvas,
  computeTextBoxLayout,
  BUILTIN_FONTS,
  clearDecodedImageCache,
  predecodeImages,
} from '../utils/canvasEngine';
import { populateDesignsFromSpreadsheet } from '../utils/spreadsheetEngine';
import { toggleListInRange, selectionListKind, runsToText, reconcileRunsWithText, totalLength } from '../utils/richText';
import type { ListKind } from '../utils/listFormat';
import { loadAllStoredFonts } from '../utils/fontManager';
import { SpreadsheetSheet } from './SpreadsheetSheet';
import { DownloadSheet } from './DownloadSheet';
import { FontManagerModal } from './FontManagerModal';
import { FontPanel } from './FontPanel';
import { RichTextOverlay } from './RichTextOverlay';
import { TextEditor } from './TextEditor';
import { SyncLayoutModal } from './SyncLayoutModal';
import { AddPanelModal } from './AddPanelModal';
import { ShapePanelModal, ShapeType } from './ShapePanelModal';
import { MoreMenuDrawer } from './MoreMenuDrawer';
import { SocialShareModal } from './SocialShareModal';

type CanvasHandleType = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'e' | 'w';

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

  // In-Memory Undo / Redo History
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);

  // Thumbnail Multi-Select Mode
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  // Rich Text In-Place Editor state
  const [editingRichBoxId, setEditingRichBoxId] = useState<string | null>(null);
  // false = quick Canva-style editor, true = full fonts & effects panel
  const [richStylesMode, setRichStylesMode] = useState(false);
  useEffect(() => {
    if (!editingRichBoxId) setRichStylesMode(false);
  }, [editingRichBoxId]);
  const lastTapRef = useRef<{ time: number; boxId: string | null }>({ time: 0, boxId: null });

  // Bottom Sheets & Modals
  const [isSpreadsheetOpen, setIsSpreadsheetOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isFontManagerOpen, setIsFontManagerOpen] = useState(false);
  const [isSyncLayoutOpen, setIsSyncLayoutOpen] = useState(false);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isShapePanelOpen, setIsShapePanelOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSocialShareOpen, setIsSocialShareOpen] = useState(false);
  const [showTopThumbnails, setShowTopThumbnails] = useState(false);
  const [activeSelectedTool, setActiveSelectedTool] = useState<
    'styles' | 'font' | 'size' | 'color' | 'effects' | 'format' | 'position' | null
  >(null);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  // Touch Swipe Refs for Canvas Workspace (BUG-005)
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // Installed Custom Fonts
  const [installedFonts, setInstalledFonts] = useState<StoredFontRecord[]>([]);

  // Save Status
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mode A Effect Settings Inspector
  const [inspectedEffect, setInspectedEffect] = useState<
    'shadow' | 'glow' | 'outline' | 'neon' | 'hollow' | 'highlight'
  >('shadow');
  const [activeGradientStop, setActiveGradientStop] = useState<1 | 2 | 3>(1);

  // Mobile Bottom Panel Tab
  const [mobilePanelTab, setMobilePanelTab] = useState<'text' | 'style'>('text');

  // Thumbnail Object URLs cache: pageId -> objectUrl
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  // Background Image strictly bound to activePage.imageId: { imageId, blob }
  const [currentImageData, setCurrentImageData] = useState<{
    imageId: string;
    blob: Blob;
  } | null>(null);

  // Canvas Refs & Dimensions
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);

  // File Input Refs for Uploads
  const batchUploadRef = useRef<HTMLInputElement>(null);
  const singleUploadRef = useRef<HTMLInputElement>(null);
  const overlayUploadRef = useRef<HTMLInputElement>(null);

  // Width Resize & Drag State (automatic height)
  const [activeHandle, setActiveHandle] = useState<CanvasHandleType | null>(null);
  const [dragStart, setDragStart] = useState<{
    mouseX: number;
    mouseY: number;
    boxX: number;
    boxY: number;
    boxW: number;
    fontSize?: number;
  } | null>(null);

  // Snap-to-Grid mode for precise alignment
  const [isSnapToGrid, setIsSnapToGrid] = useState(false);

  // Red alignment guides (shown only while dragging a box), in % of the page
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const guidesActiveRef = useRef(false);

  // Nudge pad: step size + hold-to-repeat
  const [nudgeStep, setNudgeStep] = useState<number>(1);
  const nudgeStepRef = useRef<number>(1);
  nudgeStepRef.current = nudgeStep;
  const nudgeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nudgeDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedBox: TextBoxTemplate | undefined =
    selectedBoxId ? activeBoxes.find((b) => b.id === selectedBoxId) : undefined;

  // History gesture / burst grouping state
  const isGestureActiveRef = useRef<boolean>(false);
  const gestureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to push history snapshot before mutations (grouped by gesture or 400ms idle bursts)
  // True from pointer-down to pointer-up on the canvas, so one drag/resize is
  // always ONE undo step, even if the finger pauses for longer than 400ms.
  const isPointerGestureRef = useRef<boolean>(false);

  const recordHistory = useCallback((projToSave: Project, force: boolean = false) => {
    if (!force && isPointerGestureRef.current) return;

    // If a continuous gesture is active and not forced, do not push duplicate snapshots
    if (!force && isGestureActiveRef.current) {
      if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
      gestureTimeoutRef.current = setTimeout(() => {
        isGestureActiveRef.current = false;
      }, 400);
      return;
    }

    setUndoStack((prev) => {
      // Check if new snapshot is structurally identical to the top of the stack
      const last = prev[prev.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(projToSave)) {
        return prev;
      }
      return [...prev.slice(-100), JSON.parse(JSON.stringify(projToSave))];
    });
    setRedoStack([]);

    isGestureActiveRef.current = true;
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    gestureTimeoutRef.current = setTimeout(() => {
      isGestureActiveRef.current = false;
    }, 400);
  }, []);

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    // Clear any pending debounced auto-save immediately to prevent overwriting undone state
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Undo ends any open edit burst so the next edit is recorded as its own step
    isGestureActiveRef.current = false;
    isPointerGestureRef.current = false;
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);

    const previous = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    setRedoStack((prev) => [JSON.parse(JSON.stringify(project)), ...prev.slice(-100)]);
    setUndoStack(newUndoStack);

    // If Mode B rich-text overlay is open, close it cleanly to keep in sync with restored state
    if (editingRichBoxId) {
      setEditingRichBoxId(null);
    }

    onUpdateProject(previous);
    saveProject(previous).then(() => {
      setSaveStatus('saved');
    }).catch(console.error);
    showToast('Undo');
  }, [undoStack, project, onUpdateProject, editingRichBoxId]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    // Clear any pending debounced auto-save immediately to prevent overwriting redone state
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    isGestureActiveRef.current = false;
    isPointerGestureRef.current = false;
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);

    const next = redoStack[0];
    const newRedoStack = redoStack.slice(1);
    setUndoStack((prev) => [...prev.slice(-100), JSON.parse(JSON.stringify(project))]);
    setRedoStack(newRedoStack);

    // If Mode B rich-text overlay is open, close it cleanly to keep in sync with restored state
    if (editingRichBoxId) {
      setEditingRichBoxId(null);
    }

    onUpdateProject(next);
    saveProject(next).then(() => {
      setSaveStatus('saved');
    }).catch(console.error);
    showToast('Redo');
  }, [redoStack, project, onUpdateProject, editingRichBoxId]);

  // Keyboard Shortcuts for Undo & Redo (Cmd+Z / Ctrl+Z / Cmd+Shift+Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in input or contenteditable
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Keep selectedBoxId valid when active page changes
  useEffect(() => {
    if (selectedBoxId && !activeBoxes.some((b) => b.id === selectedBoxId)) {
      setSelectedBoxId(null);
    }
  }, [activeBoxes, selectedBoxId]);

  // Page Switch Handler: Immediately clears current image to avoid showing stale background
  const handleSelectPage = useCallback(
    (newIndex: number) => {
      if (newIndex === activePageIndex) return;
      setCurrentImageData(null);
      setActivePageIndex(newIndex);
    },
    [activePageIndex]
  );

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

  // Load Active Page's Preview Image Blob with cancel token and pre-decode adjacent
  useEffect(() => {
    if (!activePage) {
      setCurrentImageData(null);
      return;
    }

    const targetImageId = activePage.imageId;
    setCurrentImageData((prev) => (prev?.imageId === targetImageId ? prev : null));

    let isCancelled = false;

    // Safety timeout recovery (BUG-013) to prevent UI freezing if image storage takes too long or errors
    const safetyTimer = setTimeout(() => {
      if (!isCancelled) {
        setCurrentImageData((current) => {
          if (!current || current.imageId !== targetImageId) {
            console.warn(`Safety timeout reached for image ${targetImageId}; applying fallback surface`);
            try {
              const off = document.createElement('canvas');
              off.width = 1000;
              off.height = 1000;
              const ctx = off.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, 1000, 1000);
              }
              off.toBlob((fb) => {
                if (fb && !isCancelled) {
                  setCurrentImageData({ imageId: targetImageId, blob: fb });
                }
              }, 'image/png');
            } catch {}
          }
          return current;
        });
      }
    }, 4500);

    // Use fast ~1200px preview blob for buttery screen editing
    getPreviewImageBlob(targetImageId)
      .then((blob) => {
        clearTimeout(safetyTimer);
        if (!isCancelled && blob) {
          setCurrentImageData({ imageId: targetImageId, blob });
        } else if (!isCancelled && !blob) {
          // If no blob in IndexedDB, generate plain surface fallback
          const off = document.createElement('canvas');
          off.width = 1000;
          off.height = 1000;
          const ctx = off.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 1000, 1000);
          }
          off.toBlob((fb) => {
            if (fb && !isCancelled) {
              setCurrentImageData({ imageId: targetImageId, blob: fb });
            }
          }, 'image/png');
        }
      })
      .catch((err) => {
        clearTimeout(safetyTimer);
        console.error('Failed to load image preview:', err);
        const off = document.createElement('canvas');
        off.width = 1000;
        off.height = 1000;
        const ctx = off.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, 1000, 1000);
        }
        off.toBlob((fb) => {
          if (fb && !isCancelled) {
            setCurrentImageData({ imageId: targetImageId, blob: fb });
          }
        }, 'image/png');
      });

    // Pre-decode adjacent images in the background
    const prevPage = project.pages[activePageIndex - 1];
    const nextPage = project.pages[activePageIndex + 1];

    if (prevPage) {
      getPreviewImageBlob(prevPage.imageId).then((blob) => {
        if (blob) predecodeImages([{ imageId: prevPage.imageId, blob }]);
      });
    }
    if (nextPage) {
      getPreviewImageBlob(nextPage.imageId).then((blob) => {
        if (blob) predecodeImages([{ imageId: nextPage.imageId, blob }]);
      });
    }

    return () => {
      isCancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [activePage?.id, activePage?.imageId, activePageIndex, project.pages]);

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

  // Debounced Auto-Save to IndexedDB (~500ms)
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
      }, 500);
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
    }, 2500);
  };

  // Coalesced Canvas Redraw with RequestAnimationFrame (Zero flicker)
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

    const containerWidth = Math.round(canvasContainerRef.current.clientWidth || 600);
    const aspect = (activePage.width || 1000) / (activePage.height || 1000);
    const targetW = Math.round(Math.min(containerWidth, activePage.width || 1000));
    const targetH = Math.round(targetW / aspect);

    renderDesignToCanvas(
      canvasRef.current,
      activeBoxes,
      activePage,
      currentImageData.blob,
      {
        showBoundingBoxes: editingRichBoxId === null, // Hide canvas bounding box when in-place editor is open
        selectedBoxId,
        editingBoxId: editingRichBoxId,
        targetWidth: targetW,
        targetHeight: targetH,
      }
    );
  }, [activePage, currentImageData, activeBoxes, selectedBoxId, editingRichBoxId]);

  const scheduleRedraw = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      redrawCanvas();
      rafIdRef.current = null;
    });
  }, [redrawCanvas]);

  useEffect(() => {
    scheduleRedraw();
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [scheduleRedraw]);

  // Handle Updates to Style: This design only vs All designs
  const handleUpdateStyle = (
    boxId: string,
    updates: Partial<TextBoxTemplate>
  ) => {
    if (!activePage) return;
    recordHistory(project);

    const targetBox = activeBoxes.find((b) => b.id === boxId);
    const targetLabel = targetBox?.fieldLabel;

    if (styleScope === 'this') {
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

  const handleUpdateTemplateBox = handleUpdateStyle;

  // Switch a box back to a solid fill. The renderer also falls back to
  // box.effects.gradient, so that must be switched off too, otherwise the
  // gradient keeps showing after tapping "Solid".
  const solidFillUpdates = (
    box: TextBoxTemplate,
    extra: Partial<TextBoxTemplate> = {}
  ): Partial<TextBoxTemplate> => {
    const updates: Partial<TextBoxTemplate> = { ...extra, gradient: undefined };
    if (box.effects?.gradient) {
      updates.effects = {
        ...box.effects,
        gradient: { ...box.effects.gradient, enabled: false },
      };
    }
    return updates;
  };

  // Dragging/resizing text affects ONLY the current design (automatic height)
  const handleUpdateCurrentDesignBoxGeometry = (
    boxId: string,
    geometry: { x: number; y: number; width: number }
  ) => {
    if (!activePage) return;
    recordHistory(project);

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
    recordHistory(project);
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
    recordHistory(project);

    const updatedPages = project.pages.map((p, idx) => {
      if (idx !== activePageIndex) return p;
      return {
        ...p,
        values: {
          ...p.values,
          [fieldLabel]: newValue,
        },
        richValues: {
          ...(p.richValues || {}),
          [fieldLabel]: reconcileRunsWithText(p.richValues?.[fieldLabel] || [{ text: p.values[fieldLabel] || '' }], newValue),
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

  // Bullet / numbered list for the whole text of the selected box
  const handleToggleBoxList = (kind: ListKind) => {
    if (!activePage || !selectedBox) return;
    const label = selectedBox.fieldLabel;
    const plain = activePage.values[label] !== undefined ? activePage.values[label] : '';
    const base = activePage.richValues?.[label]?.length ? activePage.richValues[label] : [{ text: plain }];
    const out = toggleListInRange(base, 0, totalLength(base), kind);
    handleSaveRichText(out.runs, runsToText(out.runs));
  };

  // Save Rich Text Runs from In-Place Editor
  const handleSaveRichText = (runs: TextRun[], plainText: string) => {
    if (!activePage || !selectedBox) return;
    recordHistory(project);

    const fieldLabel = selectedBox.fieldLabel;
    const updatedPages = project.pages.map((p, idx) => {
      if (idx !== activePageIndex) return p;
      return {
        ...p,
        values: {
          ...p.values,
          [fieldLabel]: plainText,
        },
        richValues: {
          ...(p.richValues || {}),
          [fieldLabel]: runs,
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

  // "Style this word in all designs" feature
  const handleStyleWordInAllDesigns = (
    word: string,
    styleOverrides: Partial<TextRun>
  ) => {
    if (!selectedBox || !word) return;
    recordHistory(project);

    const fieldLabel = selectedBox.fieldLabel;

    const updatedPages = project.pages.map((p) => {
      const rawText = p.values[fieldLabel] || '';
      if (!rawText.includes(word)) return p;

      // Split rawText by word and reconstruct runs
      const parts = rawText.split(word);
      const newRuns: TextRun[] = [];

      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
          newRuns.push({ text: parts[i] });
        }
        if (i < parts.length - 1) {
          newRuns.push({
            text: word,
            ...styleOverrides,
          });
        }
      }

      return {
        ...p,
        richValues: {
          ...(p.richValues || {}),
          [fieldLabel]: newRuns,
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
    showToast(`Styled "${word}" in all designs`);
  };

  // Add New Field
  const handleAddNewField = (fieldName?: string) => {
    const name =
      fieldName ||
      prompt('Enter new field label (e.g., Headline, Paragraph 2, Footer):');
    if (!name || !name.trim()) return;

    recordHistory(project);
    const cleanLabel = name.trim();
    const newBox: TextBoxTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fieldLabel: cleanLabel,
      x: 15,
      y: Math.min(80, 20 + activeBoxes.length * 10),
      width: 70,
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

  const handleAddNewFieldWithConfig = (
    fieldName: string,
    config: Partial<TextBoxTemplate>
  ) => {
    recordHistory(project);
    const cleanLabel = `${fieldName} ${activeBoxes.length + 1}`;
    const newBox: TextBoxTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fieldLabel: cleanLabel,
      x: 15,
      y: Math.min(80, 20 + activeBoxes.length * 10),
      width: 70,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 24,
      fontWeight: '500',
      fontStyle: 'normal',
      textAlign: 'center',
      color: '#FFF8E7',
      lineHeight: 1.3,
      letterSpacing: 0,
      ...config,
    };

    const updatedTemplate = [...project.template, newBox];
    const updatedPages = project.pages.map((p) => {
      const pBoxes = p.textBoxes && p.textBoxes.length > 0 ? p.textBoxes : project.template;
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

  const handleAddFromPanel = (type?: 'heading' | 'subheading' | 'body' | 'page_number' | 'table' | 'line') => {
    if (type === 'heading') {
      handleAddNewFieldWithConfig('Heading', { fontSize: 36, fontWeight: '700', textAlign: 'center' });
    } else if (type === 'subheading') {
      handleAddNewFieldWithConfig('Subheading', { fontSize: 24, fontWeight: '600', textAlign: 'center' });
    } else if (type === 'body') {
      handleAddNewFieldWithConfig('Body Text', { fontSize: 16, fontWeight: '400', textAlign: 'left' });
    } else if (type === 'page_number') {
      handleAddNewFieldWithConfig('Page Number', { fontSize: 14, fontWeight: '600', textAlign: 'center' });
    } else if (type === 'line') {
      handleAddNewFieldWithConfig('Divider', { fontSize: 14, fontWeight: '400', textAlign: 'center' });
    } else {
      handleAddNewField();
    }
  };

  const handleApplyFontCombination = (headingFont: string, bodyFont: string) => {
    recordHistory(project);
    const updatedBoxes = activeBoxes.map((box, idx) => {
      if (idx === 0) {
        return { ...box, fontFamily: headingFont, fontWeight: '700' as const };
      } else {
        return { ...box, fontFamily: bodyFont, fontWeight: '400' as const };
      }
    });

    if (styleScope === 'this') {
      const updatedPages = project.pages.map((p, idx) =>
        idx === activePageIndex ? { ...p, textBoxes: updatedBoxes } : p
      );
      const updatedProj: Project = { ...project, pages: updatedPages, updatedAt: Date.now() };
      onUpdateProject(updatedProj);
      triggerAutoSave(updatedProj);
    } else {
      const updatedTemplate = updatedBoxes;
      const updatedPages = project.pages.map((p) => ({
        ...p,
        textBoxes: JSON.parse(JSON.stringify(updatedBoxes)),
      }));
      const updatedProj: Project = {
        ...project,
        template: updatedTemplate,
        pages: updatedPages,
        updatedAt: Date.now(),
      };
      onUpdateProject(updatedProj);
      triggerAutoSave(updatedProj);
    }
    showToast(`Applied ${headingFont} + ${bodyFont}`);
  };

  const handleSyncAllPages = () => {
    handleCopyLayoutToAllDesigns();
  };

  const handleSyncCustomPages = (pageIndices: number[]) => {
    if (!activePage) return;
    recordHistory(project);
    const currentBoxes = activeBoxes;
    const updatedPages = project.pages.map((p, idx) => {
      if (pageIndices.includes(idx)) {
        return {
          ...p,
          textBoxes: JSON.parse(JSON.stringify(currentBoxes)),
        };
      }
      return p;
    });
    const updatedProj: Project = {
      ...project,
      pages: updatedPages,
      updatedAt: Date.now(),
    };
    onUpdateProject(updatedProj);
    triggerAutoSave(updatedProj);
    showToast(`Layout synced to ${pageIndices.length} page(s)`);
  };

  const handleSyncFieldToPages = (fieldLabel: string, targetPageIndices: number[]) => {
    handleSyncFieldsToPages([fieldLabel], targetPageIndices);
  };

  const handleSyncFieldsToPages = (fieldLabels: string[], targetPageIndices: number[]) => {
    if (!activePage || fieldLabels.length === 0 || targetPageIndices.length === 0) return;
    recordHistory(project);

    const sourceBoxes = activeBoxes.filter((b) => fieldLabels.includes(b.fieldLabel));
    if (sourceBoxes.length === 0) return;

    const updatedPages = project.pages.map((p, idx) => {
      if (targetPageIndices.includes(idx)) {
        const pBoxes = p.textBoxes && p.textBoxes.length > 0 ? [...p.textBoxes] : [...project.template];
        const updated = pBoxes.map((b) => {
          const match = sourceBoxes.find((sb) => sb.fieldLabel === b.fieldLabel);
          if (match) {
            return {
              ...b,
              x: match.x,
              y: match.y,
              width: match.width,
              height: match.height,
              fontFamily: match.fontFamily,
              fontSize: match.fontSize,
              fontWeight: match.fontWeight,
              fontStyle: match.fontStyle,
              textAlign: match.textAlign,
              color: match.color,
              lineHeight: match.lineHeight,
              letterSpacing: match.letterSpacing,
              rotation: match.rotation,
              textCase: match.textCase,
              shadow: match.shadow ? JSON.parse(JSON.stringify(match.shadow)) : undefined,
              stroke: match.stroke ? JSON.parse(JSON.stringify(match.stroke)) : undefined,
              fill: match.fill ? JSON.parse(JSON.stringify(match.fill)) : undefined,
              effects: match.effects ? JSON.parse(JSON.stringify(match.effects)) : undefined,
              fillColor: match.fillColor,
              strokeColor: match.strokeColor,
              strokeWidth: match.strokeWidth,
            };
          }
          return b;
        });
        return { ...p, textBoxes: updated };
      }
      return p;
    });

    const updatedProj: Project = {
      ...project,
      pages: updatedPages,
      updatedAt: Date.now(),
    };
    onUpdateProject(updatedProj);
    triggerAutoSave(updatedProj);
    showToast(`Synced ${fieldLabels.length} field(s) across ${targetPageIndices.length} design(s)`);
  };

  // Insert Shape Handler (BUG-007)
  const handleInsertShape = (shapeType: ShapeType) => {
    if (!activePage) return;
    recordHistory(project);
    const newBox: TextBoxTemplate = {
      id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fieldLabel: shapeType.charAt(0).toUpperCase() + shapeType.slice(1),
      elementType: 'shape',
      shapeType,
      x: 37.5,
      y: 37.5,
      width: 25,
      height: 25,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 24,
      fontWeight: '500',
      fontStyle: 'normal',
      textAlign: 'center',
      color: '#000000',
      fillColor: '#000000',
      strokeColor: 'transparent',
      strokeWidth: 0,
      rotation: 0,
    };

    const updatedBoxes = [...activeBoxes, newBox];
    const updatedPages = project.pages.map((p, idx) =>
      idx === activePageIndex ? { ...p, textBoxes: updatedBoxes } : p
    );
    const updatedProj: Project = {
      ...project,
      pages: updatedPages,
      updatedAt: Date.now(),
    };
    onUpdateProject(updatedProj);
    setSelectedBoxId(newBox.id);
    triggerAutoSave(updatedProj);
    setIsShapePanelOpen(false);
    showToast(`Added ${shapeType}`);
  };

  // Insert Image Overlay Handler (BUG-008)
  const handleInsertImageOverlay = async (files: FileList | null) => {
    if (!files || files.length === 0 || !activePage) return;
    const file = files[0];
    if (!isImageFile(file)) {
      showToast('That file is not an image.');
      return;
    }
    recordHistory(project);

    try {
      const stored = await storeImageFile(file);

      // Start at the picture's real proportions (no squashing). Box width/height are
      // percentages of the page, so convert using the page's own aspect ratio.
      const pageW = activePage.width || 1080;
      const pageH = activePage.height || 1920;
      const imgAspect = stored.height / Math.max(1, stored.width); // h / w
      let ovW = 40; // % of page width
      let ovH = ovW * (pageW / pageH) * imgAspect; // % of page height
      if (ovH > 55) {
        ovH = 55;
        ovW = ovH / ((pageW / pageH) * imgAspect);
      }
      const ovX = Math.max(0, (100 - ovW) / 2);
      const ovY = Math.max(0, Math.min(100 - ovH, (100 - ovH) / 2));

      const newBox: TextBoxTemplate = {
        id: `img_overlay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fieldLabel: file.name.replace(/\.[^/.]+$/, ''),
        elementType: 'image_overlay',
        imageOverlayId: stored.imageId,
        x: Math.round(ovX * 10) / 10,
        y: Math.round(ovY * 10) / 10,
        width: Math.round(ovW * 10) / 10,
        height: Math.round(ovH * 10) / 10,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 24,
        fontWeight: '500',
        fontStyle: 'normal',
        textAlign: 'center',
        color: '#FFFFFF',
        rotation: 0,
      };

      const updatedBoxes = [...activeBoxes, newBox];
      const updatedPages = project.pages.map((p, idx) =>
        idx === activePageIndex ? { ...p, textBoxes: updatedBoxes } : p
      );
      const updatedProj: Project = {
        ...project,
        pages: updatedPages,
        updatedAt: Date.now(),
      };
      onUpdateProject(updatedProj);
      setSelectedBoxId(newBox.id);
      triggerAutoSave(updatedProj);
      setIsUploadMenuOpen(false);
      showToast('Image overlay added');
    } catch (err) {
      console.error('Failed to insert image overlay:', err);
      showToast('Failed to insert image overlay');
    }
  };

  // Duplicate Selected Box (BUG-011)
  const handleDuplicateSelectedBox = () => {
    if (!selectedBox || !activePage) return;
    recordHistory(project);

    const duplicated: TextBoxTemplate = {
      ...JSON.parse(JSON.stringify(selectedBox)),
      id: `dup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      x: Math.min(90 - (selectedBox.width || 25), selectedBox.x + 3),
      y: Math.min(85, selectedBox.y + 3),
    };

    const updatedBoxes = [...activeBoxes, duplicated];
    const updatedPages = project.pages.map((p, idx) =>
      idx === activePageIndex ? { ...p, textBoxes: updatedBoxes } : p
    );
    const updatedProj: Project = {
      ...project,
      pages: updatedPages,
      updatedAt: Date.now(),
    };
    onUpdateProject(updatedProj);
    setSelectedBoxId(duplicated.id);
    triggerAutoSave(updatedProj);
    showToast('Duplicated element');
  };

  // Delete Selected Box (BUG-011)
  const handleDeleteSelectedBox = () => {
    if (!selectedBoxId) return;
    handleDeleteField(selectedBoxId);
  };

  // Rotate Selected Box (BUG-011)
  const handleRotateSelectedBox = (deltaDegrees: number = 90) => {
    if (!selectedBox) return;
    const currentRot = selectedBox.rotation || 0;
    const nextRot = (currentRot + deltaDegrees) % 360;
    handleUpdateStyle(selectedBox.id, { rotation: nextRot });
  };

  // Nudge Selected Box. Reads the newest project through a ref so that holding
  // a button (rapid repeats) always builds on the previous step.
  const latestProjectRef = useRef(project);
  latestProjectRef.current = project;

  // While a box is being dragged/resized, stop the page from scrolling under the finger.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const block = (ev: TouchEvent) => {
      if (isPointerGestureRef.current && ev.cancelable) ev.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, [currentImageData, activePageIndex]);

  const nudgeBox = (dx: number, dy: number, absolute?: { x?: number; y?: number }) => {
    const proj = latestProjectRef.current;
    const page = proj.pages[activePageIndex];
    if (!page || !selectedBoxId) return;
    const boxes = page.textBoxes || proj.template;
    const box = boxes.find((b) => b.id === selectedBoxId);
    if (!box) return;
    let hPct = box.height || 5;
    try {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) {
        const r = c.getBoundingClientRect();
        hPct = (computeTextBoxLayout(ctx, box, page, r.width, r.height).computedHeightPx / r.height) * 100;
      }
    } catch {}
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const nx = absolute?.x !== undefined ? absolute.x : box.x + dx;
    const ny = absolute?.y !== undefined ? absolute.y : box.y + dy;
    const newX = r1(Math.max(0, Math.min(Math.max(0, 100 - box.width), nx)));
    const newY = r1(Math.max(0, Math.min(Math.max(0, 100 - Math.min(hPct, 95)), ny)));
    if (newX === box.x && newY === box.y) return;
    recordHistory(proj);
    const updatedBoxes = boxes.map((b) => (b.id === box.id ? { ...b, x: newX, y: newY } : b));
    const updated: Project = {
      ...proj,
      pages: proj.pages.map((p, i) => (i === activePageIndex ? { ...p, textBoxes: updatedBoxes } : p)),
      updatedAt: Date.now(),
    };
    latestProjectRef.current = updated;
    onUpdateProject(updated);
    triggerAutoSave(updated);
  };

  const handleNudgeSelectedBox = (dxPercent: number, dyPercent: number) => nudgeBox(dxPercent, dyPercent);

  const stopNudgeRepeat = () => {
    if (nudgeDelayRef.current) clearTimeout(nudgeDelayRef.current);
    if (nudgeTimerRef.current) clearInterval(nudgeTimerRef.current);
    nudgeDelayRef.current = null;
    nudgeTimerRef.current = null;
  };

  const startNudgeRepeat = (ux: number, uy: number) => {
    stopNudgeRepeat();
    nudgeBox(ux * nudgeStepRef.current, uy * nudgeStepRef.current);
    nudgeDelayRef.current = setTimeout(() => {
      nudgeTimerRef.current = setInterval(() => nudgeBox(ux * nudgeStepRef.current, uy * nudgeStepRef.current), 70);
    }, 350);
  };

  useEffect(() => stopNudgeRepeat, []);

  // Delete Field
  const handleDeleteField = (boxId: string) => {
    if (activeBoxes.length <= 1) {
      alert('A design must have at least one text field.');
      return;
    }
    recordHistory(project);
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

  // Upload Designs
  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Copy to an array first: resetting the input (below) empties the live FileList
    const fileArray = Array.from(files);
    recordHistory(project);

    const currentLayout = activeBoxes;
    const newPages: DesignPage[] = [];
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      if (!isImageFile(file)) {
        skipped++;
        continue;
      }

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
        failed++;
      }
    }

    if (newPages.length === 0) {
      showToast(
        failed > 0
          ? 'Could not read that image. Try a JPG or PNG.'
          : skipped > 0
          ? 'That file is not an image. Choose a JPG or PNG.'
          : 'No image was added.'
      );
      return;
    }

    let combinedPages = [...project.pages, ...newPages];

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
    showToast(
      `${newPages.length} design${newPages.length > 1 ? 's' : ''} added` +
        (failed + skipped > 0 ? ` (${failed + skipped} skipped)` : '')
    );
  };

  // Multi-Page Deletion in Thumbnail Strip
  const handleConfirmBatchDeletePages = async () => {
    if (selectedPageIds.size === 0) return;
    recordHistory(project);

    try {
      const updated = await deleteDesignsFromProjectAtomic(
        project.id,
        Array.from(selectedPageIds)
      );
      onUpdateProject(updated);
      setSelectedPageIds(new Set());
      setIsSelectMode(false);
      setIsDeleteModalOpen(false);
      showToast('Deleted selected designs and freed storage');
    } catch (err: any) {
      console.error('Batch delete error:', err);
      showToast('Failed to delete selected designs');
    }
  };

  // Canvas Pointer Events: Touch & Width Resize / Drag
  const startAction = (
    handle: CanvasHandleType,
    box: TextBoxTemplate,
    e: React.PointerEvent<HTMLCanvasElement>
  ) => {
    recordHistory(project);
    isPointerGestureRef.current = true;
    setSelectedBoxId(box.id);
    setActiveHandle(handle);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: box.x,
      boxY: box.y,
      boxW: box.width,
      fontSize: box.fontSize || 24,
    });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !activePage) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mousePxX = Math.round(e.clientX - rect.left);
    const mousePxY = Math.round(e.clientY - rect.top);

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const now = Date.now();

    // 1. If a box is selected, test handles and double-tap detection
    if (selectedBox) {
      const layout = computeTextBoxLayout(ctx, selectedBox, activePage, rect.width, rect.height);
      const boxPxX = layout.boxX;
      const boxPxY = layout.boxY;
      const boxPxW = layout.boxW;
      const boxPxH = layout.computedHeightPx;

      const hitRadius = 24;
      const distSq = (x1: number, y1: number, x2: number, y2: number) =>
        (x1 - x2) ** 2 + (y1 - y2) ** 2;

      // Double-tap inside selected box to enter rich text editor
      if (
        mousePxX >= boxPxX &&
        mousePxX <= boxPxX + boxPxW &&
        mousePxY >= boxPxY &&
        mousePxY <= boxPxY + boxPxH
      ) {
        if (now - lastTapRef.current.time < 350 && lastTapRef.current.boxId === selectedBox.id) {
          // Double-tap confirmed!
          setEditingRichBoxId(selectedBox.id);
          lastTapRef.current = { time: 0, boxId: null };
          return;
        }
        lastTapRef.current = { time: now, boxId: selectedBox.id };
      }

      // Check Width Midpoint Handles (W and E)
      if (distSq(mousePxX, mousePxY, boxPxX, boxPxY + boxPxH / 2) <= hitRadius ** 2) {
        startAction('w', selectedBox, e);
        return;
      }
      if (distSq(mousePxX, mousePxY, boxPxX + boxPxW, boxPxY + boxPxH / 2) <= hitRadius ** 2) {
        startAction('e', selectedBox, e);
        return;
      }

      // 4 Corners: NW, NE, SE, SW (width & position)
      if (distSq(mousePxX, mousePxY, boxPxX, boxPxY) <= hitRadius ** 2) {
        startAction('nw', selectedBox, e);
        return;
      }
      if (distSq(mousePxX, mousePxY, boxPxX + boxPxW, boxPxY) <= hitRadius ** 2) {
        startAction('ne', selectedBox, e);
        return;
      }
      if (distSq(mousePxX, mousePxY, boxPxX + boxPxW, boxPxY + boxPxH) <= hitRadius ** 2) {
        startAction('se', selectedBox, e);
        return;
      }
      if (distSq(mousePxX, mousePxY, boxPxX, boxPxY + boxPxH) <= hitRadius ** 2) {
        startAction('sw', selectedBox, e);
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

    // 2. Otherwise hit-test all active boxes (top-most first)
    for (let i = activeBoxes.length - 1; i >= 0; i--) {
      const b = activeBoxes[i];
      const layout = computeTextBoxLayout(ctx, b, activePage, rect.width, rect.height);
      if (
        mousePxX >= layout.boxX &&
        mousePxX <= layout.boxX + layout.boxW &&
        mousePxY >= layout.boxY &&
        mousePxY <= layout.boxY + layout.computedHeightPx
      ) {
        lastTapRef.current = { time: now, boxId: b.id };
        startAction('move', b, e);
        return;
      }
    }

    // 3. Tapped outside all text boxes: deselect to reveal unselected State A dock
    setSelectedBoxId(null);
    setActiveSelectedTool(null);
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

    const initialFontSize = dragStart.fontSize || 24;

    switch (activeHandle) {
      case 'move':
        newX = Math.max(0, Math.min(100 - dragStart.boxW, Math.round((dragStart.boxX + deltaX) * 10) / 10));
        newY = Math.max(0, Math.min(95, Math.round((dragStart.boxY + deltaY) * 10) / 10));
        break;

      case 'e':
        // Middle right handle: adjust width only (causes text wrap)
        newW = Math.max(10, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxW + deltaX)));
        break;

      case 'w':
        // Middle left handle: adjust width only (causes text wrap)
        newW = Math.max(10, Math.round(dragStart.boxW - deltaX));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 10, Math.round(dragStart.boxX + deltaX)));
        break;

      case 'se': {
        // Corner bottom-right: proportional scale (scales font size)
        const scaleFactor = Math.max(0.2, (dragStart.boxW + deltaX) / dragStart.boxW);
        newW = Math.max(10, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxW * scaleFactor)));
        const newFontSize = Math.max(8, Math.min(180, Math.round(initialFontSize * scaleFactor)));
        handleUpdateTemplateBox(selectedBoxId, { fontSize: newFontSize });
        break;
      }

      case 'ne': {
        // Corner top-right: proportional scale (scales font size)
        const scaleFactor = Math.max(0.2, (dragStart.boxW + deltaX) / dragStart.boxW);
        newW = Math.max(10, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxW * scaleFactor)));
        newY = Math.max(0, Math.min(95, Math.round(dragStart.boxY + deltaY)));
        const newFontSize = Math.max(8, Math.min(180, Math.round(initialFontSize * scaleFactor)));
        handleUpdateTemplateBox(selectedBoxId, { fontSize: newFontSize });
        break;
      }

      case 'sw': {
        // Corner bottom-left: proportional scale (scales font size)
        const scaleFactor = Math.max(0.2, (dragStart.boxW - deltaX) / dragStart.boxW);
        newW = Math.max(10, Math.round(dragStart.boxW * scaleFactor));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 10, Math.round(dragStart.boxX + dragStart.boxW - newW)));
        const newFontSize = Math.max(8, Math.min(180, Math.round(initialFontSize * scaleFactor)));
        handleUpdateTemplateBox(selectedBoxId, { fontSize: newFontSize });
        break;
      }

      case 'nw': {
        // Corner top-left: proportional scale (scales font size)
        const scaleFactor = Math.max(0.2, (dragStart.boxW - deltaX) / dragStart.boxW);
        newW = Math.max(10, Math.round(dragStart.boxW * scaleFactor));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 10, Math.round(dragStart.boxX + dragStart.boxW - newW)));
        newY = Math.max(0, Math.min(95, Math.round(dragStart.boxY + deltaY)));
        const newFontSize = Math.max(8, Math.min(180, Math.round(initialFontSize * scaleFactor)));
        handleUpdateTemplateBox(selectedBoxId, { fontSize: newFontSize });
        break;
      }
    }

    if (isSnapToGrid) {
      // Snap to 2.5% increments
      newX = Math.round(newX / 2.5) * 2.5;
      newY = Math.round(newY / 2.5) * 2.5;
      newW = Math.max(10, Math.round(newW / 2.5) * 2.5);

      // Snap to center (horizontal center: newX + newW / 2 close to 50%)
      const centerX = newX + newW / 2;
      if (Math.abs(centerX - 50) < 2) {
        newX = Math.max(0, Math.round((50 - newW / 2) * 10) / 10);
      }
    }

    // Alignment guides + snapping (move only)
    if (activeHandle === 'move' && activePage) {
      const ctx = canvasRef.current.getContext('2d');
      const me = activeBoxes.find((b) => b.id === selectedBoxId);
      if (ctx && me) {
        const pctH = (b: TextBoxTemplate) => {
          try {
            return (computeTextBoxLayout(ctx, b, activePage, rect.width, rect.height).computedHeightPx / rect.height) * 100;
          } catch {
            return b.height || 5;
          }
        };
        const myH = pctH(me);
        const thX = (6 / rect.width) * 100;
        const thY = (6 / rect.height) * 100;
        const xt: number[] = [0, 50, 100];
        const yt: number[] = [0, 50, 100];
        activeBoxes.forEach((b) => {
          if (b.id === selectedBoxId) return;
          const h = pctH(b);
          xt.push(b.x, b.x + b.width / 2, b.x + b.width);
          yt.push(b.y, b.y + h / 2, b.y + h);
        });
        const best = (edges: number[], targets: number[], th: number) => {
          let d = 0;
          let min = th;
          for (const e of edges) for (const t of targets) {
            const diff = t - e;
            if (Math.abs(diff) < min) { min = Math.abs(diff); d = diff; }
          }
          return min < th ? d : 0;
        };
        const dx = best([newX, newX + newW / 2, newX + newW], xt, thX);
        const dy = best([newY, newY + myH / 2, newY + myH], yt, thY);
        newX = Math.max(0, Math.min(100 - newW, newX + dx));
        newY = Math.max(0, Math.min(100 - Math.min(myH, 95), newY + dy));
        const near = (a: number, b: number) => Math.abs(a - b) < 0.15;
        const v: number[] = [];
        const hh: number[] = [];
        for (const e of [newX, newX + newW / 2, newX + newW]) for (const t of xt) if (near(e, t) && !v.some((q) => near(q, t))) v.push(t);
        for (const e of [newY, newY + myH / 2, newY + myH]) for (const t of yt) if (near(e, t) && !hh.some((q) => near(q, t))) hh.push(t);
        setGuides((g) => {
          if (v.length && !g.v.length && !g.h.length) { try { navigator.vibrate?.(8); } catch {} }
          return { v, h: hh };
        });
        guidesActiveRef.current = true;
      }
    }

    // Update geometry on active design
    handleUpdateCurrentDesignBoxGeometry(selectedBoxId, { x: newX, y: newY, width: newW });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isPointerGestureRef.current = false;
    if (guidesActiveRef.current) {
      guidesActiveRef.current = false;
      setGuides({ v: [], h: [] });
    }
    if (activeHandle) {
      setActiveHandle(null);
      setDragStart(null);
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Get active editing box layout for in-place rich text overlay
  const getEditingBoxLayout = () => {
    if (!editingRichBoxId || !canvasRef.current || !activePage) return null;
    const targetBox = activeBoxes.find((b) => b.id === editingRichBoxId);
    if (!targetBox) return null;

    const canvasEl = canvasRef.current;
    const containerEl = canvasContainerRef.current;
    if (!containerEl) return null;

    const canvasRect = canvasEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return null;

    const layout = computeTextBoxLayout(ctx, targetBox, activePage, canvasRect.width, canvasRect.height);
    const canvasLeft = canvasRect.left - containerRect.left;
    const canvasTop = canvasRect.top - containerRect.top;

    const boxX = Math.round(canvasLeft + layout.boxX);
    const boxY = Math.round(canvasTop + layout.boxY);
    const boxW = Math.round(layout.boxW);
    const boxH = Math.round(layout.computedHeightPx);

    return {
      box: targetBox,
      scale: canvasRect.width / 1000,
      boxX,
      boxY,
      boxW,
      boxH,
      containerWidth: Math.round(containerRect.width),
      containerHeight: Math.round(containerRect.height),
    };
  };

  const editingLayout = getEditingBoxLayout();

  // Floating quick-action toolbar position directly underneath selected box (BUG-011)
  const getSelectedBoxToolbarPosition = () => {
    if (!selectedBox || editingRichBoxId || !canvasRef.current || !canvasContainerRef.current || !activePage) return null;
    const canvasEl = canvasRef.current;
    const containerEl = canvasContainerRef.current;
    const canvasRect = canvasEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return null;

    const layout = computeTextBoxLayout(ctx, selectedBox, activePage, canvasRect.width, canvasRect.height);
    const canvasLeft = canvasRect.left - containerRect.left;
    const canvasTop = canvasRect.top - containerRect.top;

    const centerX = Math.round(canvasLeft + layout.boxX + layout.boxW / 2);
    const bottomY = Math.round(Math.min(canvasTop + layout.boxY + layout.computedHeightPx + 12, containerRect.height - 52));

    return {
      centerX,
      bottomY,
    };
  };

  const selectedBoxToolbarPos = getSelectedBoxToolbarPosition();

  return (
    <div className="h-[100dvh] bg-[#E5B224] text-black flex flex-col font-sans select-none overflow-hidden overscroll-none relative">
      {/* 1. TOP APP BAR (BUG-004: Clean header with project title, no oval pagination pill) */}
      <header className="border-b border-[#212128] bg-[#0B0B0F] text-white shrink-0 z-30 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-md">
        {/* Left: Circular Home Button & In-Memory Undo / Redo */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onBackToDashboard}
            className="w-10 h-10 rounded-full bg-black border border-white/20 text-white flex items-center justify-center hover:bg-neutral-800 active:scale-95 shadow-md shrink-0 transition-transform"
            title="Back to Dashboard"
          >
            <Home className="w-5 h-5 text-white" />
          </button>

          <div className="flex items-center gap-1 bg-[#17171C] border border-[#2D2D38] p-1 rounded-xl">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-[#262632] disabled:opacity-30 transition-all min-h-[32px] min-w-[32px] flex items-center justify-center"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-[#262632] disabled:opacity-30 transition-all min-h-[32px] min-w-[32px] flex items-center justify-center"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: Project Title (BUG-004: Oval pill removed, project title displayed) */}
        <div className="flex items-center gap-2 truncate max-w-[180px] sm:max-w-xs md:max-w-md">
          <span className="text-sm font-bold text-[#E5B224] tracking-wide truncate">
            {project.name || 'Untitled Project'}
          </span>
        </div>

        {/* Right: Designs (3-bar strip toggle), Download, Share */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Top 3-Bar Strip Toggle (Page 18) */}
          <button
            onClick={() => setShowTopThumbnails(!showTopThumbnails)}
            className={`p-2 sm:px-3 sm:py-2 rounded-xl border flex items-center gap-1.5 transition-all min-h-[40px] shadow-sm ${
              showTopThumbnails
                ? 'bg-[#E5B224] text-black border-[#E5B224] font-bold'
                : 'bg-[#1C1C24] border-[#333342] text-white hover:bg-[#262632]'
            }`}
            title="Toggle All Designs Thumbnail Strip"
          >
            <Menu className="w-4 h-4" />
            <span className="hidden sm:inline text-xs font-semibold">Designs</span>
          </button>

          {/* Download Button */}
          <button
            onClick={() => {
              if (editingRichBoxId) setEditingRichBoxId(null);
              setIsDownloadOpen(true);
            }}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] text-black text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/20 transition-all active:scale-95 min-h-[40px]"
            title="Download Designs"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download</span>
          </button>

          {/* Share Button (Page 10) */}
          <button
            onClick={() => setIsSocialShareOpen(true)}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-[#1C1C24] hover:bg-[#262632] border border-[#333342] text-[#D4AF37] text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95 min-h-[40px]"
            title="Upload Directly to Social Media"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </header>

      {/* 2. TOP HORIZONTAL THUMBNAIL STRIP (Exact match to IMG_1495 (2).pdf Page 18) */}
      {showTopThumbnails && (
        <div className="bg-[#0B0B0F]/95 backdrop-blur-md border-b border-[#262632] px-4 py-2 flex items-center gap-2.5 overflow-x-auto z-20 shadow-xl shrink-0 animate-in slide-in-from-top-2">
          {project.pages.map((page, idx) => {
            const isActive = idx === activePageIndex;
            const thumbUrl = thumbnailUrls[page.id];

            return (
              <button
                key={page.id}
                onClick={() => handleSelectPage(idx)}
                className={`relative shrink-0 rounded-xl overflow-hidden border-2 cursor-pointer transition-all flex flex-col items-center justify-center p-0.5 ${
                  isActive
                    ? 'border-[#E5B224] ring-2 ring-[#E5B224]/50 scale-105'
                    : 'border-[#333342] opacity-75 hover:opacity-100'
                }`}
                style={{ width: '62px', height: '62px' }}
                title={`Design ${idx + 1}`}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={page.name}
                    className="w-full h-full object-cover rounded-lg"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-[#1A1A24] flex items-center justify-center text-[10px] text-white/50 rounded-lg">
                    #{idx + 1}
                  </div>
                )}
                <span className="absolute bottom-0.5 right-1 text-[9px] font-mono font-bold bg-black/80 px-1 rounded text-white">
                  {idx + 1}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => batchUploadRef.current?.click()}
            className="shrink-0 w-15 h-15 rounded-xl border-2 border-dashed border-[#D4AF37]/50 hover:border-[#D4AF37] bg-[#121217] text-[#D4AF37] flex flex-col items-center justify-center gap-1 transition-all"
            title="Upload more backgrounds"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[9px] font-bold">Add</span>
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0B0B0F] text-[#E5B224] border border-[#E5B224] text-xs font-bold px-4 py-2 rounded-full shadow-2xl animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* 2. MAIN WORKSPACE BODY */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto p-2 sm:p-4 gap-4 overflow-y-auto pb-24">
        {/* Left / Center Area: Canvas & Pagination */}
        <div className="flex-1 flex flex-col items-center justify-start space-y-2.5 min-w-0">
          {/* Interactive Canvas Container with Auto-Height Box Layout */}
          <div
            ref={canvasContainerRef}
            onTouchStart={(e) => {
              // Swipe between pages only on empty background canvas when no element is selected or edited
              if (activeHandle || selectedBoxId !== null || editingRichBoxId !== null) return;
              touchStartXRef.current = e.touches[0].clientX;
              touchStartYRef.current = e.touches[0].clientY;
            }}
            onTouchEnd={(e) => {
              if (activeHandle || selectedBoxId !== null || editingRichBoxId !== null || touchStartXRef.current === null || touchStartYRef.current === null) {
                touchStartXRef.current = null;
                touchStartYRef.current = null;
                return;
              }
              const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
              const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
              touchStartXRef.current = null;
              touchStartYRef.current = null;

              // Horizontal swipe must dominate vertical scroll and be deliberate (>60px)
              if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.8) {
                if (deltaX < 0 && activePageIndex < project.pages.length - 1) {
                  handleSelectPage(activePageIndex + 1);
                } else if (deltaX > 0 && activePageIndex > 0) {
                  handleSelectPage(activePageIndex - 1);
                }
              }
            }}
            style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
            className="w-full max-w-lg bg-[#121217] border border-[#262632] rounded-2xl overflow-hidden shadow-2xl relative flex items-center justify-center min-h-[320px] crisp-render"
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
              <div className="relative w-full flex items-center justify-center crisp-render" style={{ transform: 'translateZ(0)' }}>
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
                  onPointerCancel={handleCanvasPointerUp}
                  style={{
                    touchAction: activeHandle ? 'none' : 'pan-y pinch-zoom',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    textRendering: 'optimizeLegibility',
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden',
                  }}
                  className="workspace-canvas crisp-render cursor-move max-w-full h-auto rounded-xl shadow-lg"
                />

                {/* Red dashed alignment guides (only while moving) */}
                {activeHandle === 'move' && canvasRef.current && (guides.v.length > 0 || guides.h.length > 0) && (
                  <div className="absolute pointer-events-none z-30" style={{
                    left: canvasRef.current.offsetLeft, top: canvasRef.current.offsetTop,
                    width: canvasRef.current.offsetWidth, height: canvasRef.current.offsetHeight,
                  }}>
                    {guides.v.map((x) => (
                      <div key={`v${x}`} style={{ position: 'absolute', left: `${x}%`, top: 0, bottom: 0, borderLeft: '2.5px dashed #FF2D55', filter: 'drop-shadow(0 0 3px #FF2D55) drop-shadow(0 0 1px #fff)' }} />
                    ))}
                    {guides.h.map((y) => (
                      <div key={`h${y}`} style={{ position: 'absolute', top: `${y}%`, left: 0, right: 0, borderTop: '2.5px dashed #FF2D55', filter: 'drop-shadow(0 0 3px #FF2D55) drop-shadow(0 0 1px #fff)' }} />
                    ))}
                  </div>
                )}

                {/* Floating Quick-Action Toolbar centered directly underneath selected box (BUG-011) */}
                {selectedBox && !editingRichBoxId && selectedBoxToolbarPos && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${selectedBoxToolbarPos.centerX}px`,
                      top: `${selectedBoxToolbarPos.bottomY}px`,
                      transform: 'translateX(-50%)',
                      zIndex: 35,
                    }}
                    className="bg-[#0B0B0F]/95 backdrop-blur-md border border-[#D4AF37]/60 rounded-full px-3 py-1.5 shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 pointer-events-auto"
                  >
                    {/* Duplicate */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateSelectedBox();
                      }}
                      className="p-1.5 rounded-full text-white/80 hover:text-[#E5B224] hover:bg-white/10 active:scale-95 transition-all"
                      title="Duplicate Element"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSelectedBox();
                      }}
                      className="p-1.5 rounded-full text-white/80 hover:text-red-400 hover:bg-white/10 active:scale-95 transition-all"
                      title="Delete Element"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Divider keeps the destructive Delete away from Nudge */}
                    <span className="w-px h-5 mx-1 bg-[#D4AF37]/40" aria-hidden="true" />

                    {/* Nudge */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSelectedTool(activeSelectedTool === 'format' ? null : 'format');
                      }}
                      className="p-1.5 rounded-full text-white/80 hover:text-[#E5B224] hover:bg-white/10 active:scale-95 transition-all"
                      title="Nudge Position"
                    >
                      <Move className="w-3.5 h-3.5" />
                    </button>

                    {/* Rotate */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRotateSelectedBox(90);
                      }}
                      className="p-1.5 rounded-full text-white/80 hover:text-[#E5B224] hover:bg-white/10 active:scale-95 transition-all"
                      title="Rotate 90°"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Double-tap in-place rich text editor overlay */}
                {editingLayout && !richStylesMode && (
                  <TextEditor
                    key={editingLayout.box.id}
                    box={editingLayout.box}
                    page={activePage}
                    scale={editingLayout.scale}
                    boxX={editingLayout.boxX}
                    boxY={editingLayout.boxY}
                    boxW={editingLayout.boxW}
                    boxH={editingLayout.boxH}
                    onSave={handleSaveRichText}
                    onMoreStyles={() => setRichStylesMode(true)}
                    onClose={() => setEditingRichBoxId(null)}
                  />
                )}
                {editingLayout && richStylesMode && (
                  <RichTextOverlay
                    box={editingLayout.box}
                    page={activePage}
                    scale={editingLayout.scale}
                    boxX={editingLayout.boxX}
                    boxY={editingLayout.boxY}
                    boxW={editingLayout.boxW}
                    boxH={editingLayout.boxH}
                    containerWidth={editingLayout.containerWidth}
                    containerHeight={editingLayout.containerHeight}
                    onSave={handleSaveRichText}
                    onStyleWordInAllDesigns={handleStyleWordInAllDesigns}
                    onClose={() => setEditingRichBoxId(null)}
                  />
                )}
              </div>
            )}
          </div>

          {/* Relative 3-Circle Progress Indicator (BUG-005) */}
          {project.pages.length > 0 && (
            <div className="flex flex-col items-center justify-center gap-1.5 py-1">
              <div className="flex items-center gap-3">
                {/* Left circle: previous design */}
                <button
                  onClick={() => handleSelectPage(Math.max(0, activePageIndex - 1))}
                  disabled={activePageIndex === 0}
                  className={`transition-all ${
                    activePageIndex > 0
                      ? 'w-2.5 h-2.5 rounded-full bg-black/60 hover:bg-black hover:scale-125'
                      : 'w-2.5 h-2.5 rounded-full border border-black/25 opacity-40 cursor-default'
                  }`}
                  title="Previous Design"
                />

                {/* Center circle: active design */}
                <div
                  className="w-3.5 h-3.5 rounded-full bg-black shadow-md shadow-black/30 ring-2 ring-black/20"
                  title={`Active Design ${activePageIndex + 1}`}
                />

                {/* Right circle: next design */}
                <button
                  onClick={() => handleSelectPage(Math.min(project.pages.length - 1, activePageIndex + 1))}
                  disabled={activePageIndex === project.pages.length - 1}
                  className={`transition-all ${
                    activePageIndex < project.pages.length - 1
                      ? 'w-2.5 h-2.5 rounded-full bg-black/60 hover:bg-black hover:scale-125'
                      : 'w-2.5 h-2.5 rounded-full border border-black/25 opacity-40 cursor-default'
                  }`}
                  title="Next Design"
                />
              </div>

              <div className="flex items-center gap-1.5 text-black/80 font-mono text-[11px] font-bold">
                <span>Design {activePageIndex + 1} of {project.pages.length}</span>
                {activePage?.name && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="opacity-70 truncate max-w-[150px] font-sans font-medium">{activePage.name}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Area: Text Field Editors & Style Panel */}
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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBoxId(box.id);
                          setEditingRichBoxId(box.id);
                        }}
                        className="text-[#D4AF37]/80 hover:text-[#D4AF37] text-[10px] font-semibold flex items-center gap-1 p-1 rounded hover:bg-[#2D2D3A]"
                        title="Double-tap box on canvas or click here to format words"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Format Words</span>
                      </button>
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
                  </div>
                  <textarea
                    rows={2}
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

              {/* Style Scope Switch (This design only vs All designs) */}
              <div className="bg-[#121217] p-1.5 rounded-xl border border-[#2D2D38] space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold text-[#D4AF37]">Apply Style Changes To:</span>
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
                title="Copy box positions, widths, and styles from this design to all other designs"
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
                    <span>Global Font Library</span>
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

              {/* 2. Font Size Stepper */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#FFF8E7]/70">Font Size (1000px base)</span>
                <div className="flex items-center bg-[#121217] border border-[#333342] rounded-xl overflow-hidden">
                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        fontSize: Math.max(10, selectedBox.fontSize - 2),
                      })
                    }
                    className="px-2.5 py-1.5 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors min-h-[36px]"
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
                    className="px-2.5 py-1.5 text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors min-h-[36px]"
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

              {/* 4. Color & Swatches + Hex Code Input */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#FFF8E7]/70">Color</span>
                  {/* Hex input */}
                  <div className="flex items-center gap-1 bg-[#17171C] border border-[#2D2D38] px-2 py-0.5 rounded-lg">
                    <span className="text-[11px] text-[#D4AF37] font-mono">#</span>
                    <input
                      type="text"
                      maxLength={7}
                      value={selectedBox.color.replace(/^#/, '')}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (/^[0-9A-Fa-f]{0,6}$/.test(val)) {
                          handleUpdateTemplateBox(selectedBox.id, { color: '#' + val });
                        }
                      }}
                      className="w-16 bg-transparent text-xs font-mono text-[#FFF8E7] focus:outline-none uppercase"
                      placeholder="FFFFFF"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['#D4AF37', '#FFF8E7', '#F4D58D', '#0B0B0F', '#FFFFFF', '#EF4444', '#3B82F6', '#10B981'].map(
                      (hex) => (
                        <button
                          key={hex}
                          onClick={() =>
                            handleUpdateTemplateBox(selectedBox.id, { color: hex })
                          }
                          className={`w-6 h-6 rounded-full border transition-all ${
                            selectedBox.color.toUpperCase() === hex.toUpperCase()
                              ? 'border-white scale-110 shadow-md ring-2 ring-[#D4AF37]'
                              : 'border-white/20 hover:scale-105'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      )
                    )}
                  </div>
                  <input
                    type="color"
                    value={
                      selectedBox.color.startsWith('#') && selectedBox.color.length === 7
                        ? selectedBox.color
                        : '#D4AF37'
                    }
                    onChange={(e) =>
                      handleUpdateTemplateBox(selectedBox.id, { color: e.target.value })
                    }
                    className="w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer shrink-0"
                    title="Choose custom color"
                  />
                </div>
              </div>

              {/* 5. Automatic Height Box: Only Width Slider & Quick Presets */}
              <div className="space-y-2.5 pt-1 border-t border-[#262632]">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#D4AF37]">
                    Box Width: {selectedBox.width}%
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    Height is automatic (fits text)
                  </span>
                </div>

                {/* Width Slider + Steppers */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        width: Math.max(10, selectedBox.width - 5),
                      })
                    }
                    className="p-1.5 rounded-lg bg-[#121217] border border-[#333342] text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors min-h-[36px]"
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
                    className="p-1.5 rounded-lg bg-[#121217] border border-[#333342] text-[#FFF8E7]/70 hover:text-white hover:bg-[#212128] transition-colors min-h-[36px]"
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
                      className={`flex-1 py-1.5 text-[10px] font-mono font-semibold rounded-lg border transition-all min-h-[32px] ${
                        selectedBox.width === w
                          ? 'bg-[#D4AF37] text-[#0B0B0F] border-[#D4AF37]'
                          : 'bg-[#121217] text-[#FFF8E7]/60 border-[#262632] hover:text-[#FFF8E7]'
                      }`}
                    >
                      {w}%
                    </button>
                  ))}
                </div>

                <div className="p-2 bg-[#121217] rounded-xl border border-[#262632] text-[10px] text-[#FFF8E7]/50 leading-relaxed">
                  💡 <strong>Tip:</strong> Double-tap any box on the canvas to open the rich-text editor and style individual words!
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. DYNAMIC BOTTOM DOCK & FORMATTING POPOVERS (Exact match to IMG_1495 (2).pdf Page 2 vs Page 11) */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[96%] sm:w-auto">
        {/* Secondary Popover for Selected Tool (Font Size, Color, Styles, Effects, Format) */}
        {selectedBox && activeSelectedTool && (
          <div className="mb-2 bg-[#0B0B0F] border-2 border-[#D4AF37]/50 rounded-2xl p-4 shadow-2xl text-white animate-in slide-in-from-bottom-2 max-w-md mx-auto overflow-y-auto overscroll-contain" style={{ maxHeight: '58vh' }}>
            <div className="sticky -top-4 -mx-4 px-4 pt-4 -mt-4 z-10 bg-[#0B0B0F] flex items-center justify-between mb-3 border-b border-[#262632] pb-2">
              <span className="text-xs font-bold text-[#E5B224] uppercase tracking-wider">
                {activeSelectedTool === 'styles' && 'Text Styles'}
                {activeSelectedTool === 'font' && 'Font Family & Library'}
                {activeSelectedTool === 'size' && 'Font Size'}
                {activeSelectedTool === 'color' && 'Color & Palette'}
                {activeSelectedTool === 'effects' && 'Text Effects'}
                {activeSelectedTool === 'format' && 'Format & Alignment'}
              </span>
              <button
                onClick={() => setActiveSelectedTool(null)}
                className="text-white/60 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Font Panel */}
            {activeSelectedTool === 'font' && (
              <div className="space-y-3">
                <FontPanel
                  selectedFontFamily={selectedBox.fontFamily}
                  onSelectFont={(fontName) =>
                    handleUpdateTemplateBox(selectedBox.id, { fontFamily: fontName })
                  }
                  compact
                />
              </div>
            )}

            {/* Styles Panel */}
            {activeSelectedTool === 'styles' && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    handleUpdateTemplateBox(selectedBox.id, {
                      fontSize: 40,
                      fontWeight: '700',
                      letterSpacing: -0.5,
                    })
                  }
                  className="p-3 bg-[#17171C] hover:bg-[#262632] border border-[#333342] rounded-xl text-left"
                >
                  <div className="text-base font-bold text-white">Heading</div>
                  <div className="text-[10px] text-white/50">40px • Bold</div>
                </button>
                <button
                  onClick={() =>
                    handleUpdateTemplateBox(selectedBox.id, {
                      fontSize: 26,
                      fontWeight: '600',
                      letterSpacing: 0,
                    })
                  }
                  className="p-3 bg-[#17171C] hover:bg-[#262632] border border-[#333342] rounded-xl text-left"
                >
                  <div className="text-sm font-semibold text-white">Subheading</div>
                  <div className="text-[10px] text-white/50">26px • Semibold</div>
                </button>
                <button
                  onClick={() =>
                    handleUpdateTemplateBox(selectedBox.id, {
                      fontSize: 18,
                      fontWeight: '400',
                      letterSpacing: 0,
                    })
                  }
                  className="p-3 bg-[#17171C] hover:bg-[#262632] border border-[#333342] rounded-xl text-left"
                >
                  <div className="text-xs font-normal text-white">Body Text</div>
                  <div className="text-[10px] text-white/50">18px • Regular</div>
                </button>
                <button
                  onClick={() =>
                    handleUpdateTemplateBox(selectedBox.id, {
                      fontSize: 13,
                      fontWeight: '600',
                      letterSpacing: 1.5,
                    })
                  }
                  className="p-3 bg-[#17171C] hover:bg-[#262632] border border-[#333342] rounded-xl text-left"
                >
                  <div className="text-xs font-semibold uppercase text-white">Caption</div>
                  <div className="text-[10px] text-white/50">13px • Uppercase</div>
                </button>
              </div>
            )}

            {/* Font Size Panel */}
            {activeSelectedTool === 'size' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Size</span>
                  <div className="flex items-center gap-1 bg-[#17171C] border border-[#2D2D38] px-2 py-0.5 rounded-lg focus-within:border-[#E5B224]">
                    <input
                      type="number"
                      min={6}
                      max={200}
                      value={selectedBox.fontSize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          const clamped = Math.min(200, Math.max(6, val));
                          handleUpdateTemplateBox(selectedBox.id, { fontSize: clamped });
                        }
                      }}
                      className="w-12 bg-transparent font-mono text-[#E5B224] text-xs font-bold text-right focus:outline-none"
                      title="Type exact font size"
                    />
                    <span className="text-[10px] text-white/50">px</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        fontSize: Math.max(8, selectedBox.fontSize - 2),
                      })
                    }
                    className="p-2 bg-[#17171C] hover:bg-[#262632] border border-[#333342] rounded-lg"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="range"
                    min="8"
                    max="120"
                    value={selectedBox.fontSize}
                    onChange={(e) =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        fontSize: parseInt(e.target.value, 10),
                      })
                    }
                    className="flex-1 accent-[#E5B224] h-1.5 bg-[#262632] rounded-lg cursor-pointer"
                  />
                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        fontSize: Math.min(144, selectedBox.fontSize + 2),
                      })
                    }
                    className="p-2 bg-[#17171C] hover:bg-[#262632] border border-[#333342] rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  {[14, 18, 24, 32, 48, 64].map((sz) => (
                    <button
                      key={sz}
                      onClick={() => handleUpdateTemplateBox(selectedBox.id, { fontSize: sz })}
                      className={`flex-1 py-1 text-xs font-mono rounded-lg border transition-all ${
                        selectedBox.fontSize === sz
                          ? 'bg-[#E5B224] text-black border-[#E5B224] font-bold'
                          : 'bg-[#17171C] text-white/70 border-[#333342] hover:text-white'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color Panel (Solid | Gradient Fill) */}
            {activeSelectedTool === 'color' && (
              <div className="space-y-3">
                {/* Mode Switch: Solid Fill vs Gradient Fill */}
                <div className="flex items-center p-1 bg-[#121217] rounded-xl border border-[#2D2D38]">
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateTemplateBox(selectedBox.id, solidFillUpdates(selectedBox));
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      !selectedBox.gradient?.enabled
                        ? 'bg-[#E5B224] text-black shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Solid
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const existing = selectedBox.gradient;
                      handleUpdateTemplateBox(selectedBox.id, {
                        gradient: {
                          enabled: true,
                          color: existing?.color || '#22C55E',
                          color2: existing?.color2 || '#FACC15',
                          color3: existing?.color3 !== undefined ? existing.color3 : '#3B82F6',
                          angle: existing?.angle ?? 90,
                        },
                      });
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      selectedBox.gradient?.enabled
                        ? 'bg-[#E5B224] text-black shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Gradient
                  </button>
                </div>

                {/* SOLID FILL CONTROLS */}
                {!selectedBox.gradient?.enabled ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/70">Hex Code</span>
                      <div className="flex items-center gap-1 bg-[#17171C] border border-[#2D2D38] px-2 py-1 rounded-lg">
                        <span className="text-xs text-[#E5B224] font-mono">#</span>
                        <input
                          type="text"
                          maxLength={7}
                          value={selectedBox.color.replace(/^#/, '')}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            if (/^[0-9A-Fa-f]{0,6}$/.test(val)) {
                              handleUpdateTemplateBox(selectedBox.id, solidFillUpdates(selectedBox, { color: '#' + val }));
                            }
                          }}
                          className="w-16 bg-transparent text-xs font-mono text-white focus:outline-none uppercase"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      {[
                        '#E5B224',
                        '#FFF8E7',
                        '#F4D58D',
                        '#FFFFFF',
                        '#0B0B0F',
                        '#EF4444',
                        '#3B82F6',
                        '#10B981',
                        '#8B5CF6',
                        '#F59E0B',
                      ].map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => handleUpdateTemplateBox(selectedBox.id, solidFillUpdates(selectedBox, { color: hex }))}
                          className={`w-7 h-7 rounded-full border transition-all ${
                            selectedBox.color.toUpperCase() === hex.toUpperCase()
                              ? 'border-white scale-110 shadow-md ring-2 ring-[#E5B224]'
                              : 'border-white/20 hover:scale-105'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                      <input
                        type="color"
                        value={
                          selectedBox.color.startsWith('#') && selectedBox.color.length === 7
                            ? selectedBox.color
                            : '#E5B224'
                        }
                        onChange={(e) =>
                          handleUpdateTemplateBox(selectedBox.id, solidFillUpdates(selectedBox, { color: e.target.value }))
                        }
                        className="w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer shrink-0"
                        title="Choose custom color"
                      />
                    </div>
                  </div>
                ) : (
                  /* GRADIENT FILL CONTROLS */
                  <div className="space-y-3">
                    {/* Live Preview Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-white/70">
                        <span>Preview</span>
                        <span className="font-mono text-[#E5B224]">{selectedBox.gradient?.angle ?? 90}°</span>
                      </div>
                      <div
                        className="w-full h-7 rounded-xl border border-white/20 shadow-inner"
                        style={{
                          background: selectedBox.gradient?.color3
                            ? `linear-gradient(${selectedBox.gradient.angle ?? 90}deg, ${selectedBox.gradient.color || '#22C55E'}, ${selectedBox.gradient.color2 || '#FACC15'}, ${selectedBox.gradient.color3})`
                            : `linear-gradient(${selectedBox.gradient?.angle ?? 90}deg, ${selectedBox.gradient?.color || '#22C55E'}, ${selectedBox.gradient?.color2 || '#FACC15'})`,
                        }}
                      />
                    </div>

                    {/* Angle Slider */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-white/70">
                        <span>Angle</span>
                        <span className="font-mono text-xs text-[#E5B224]">{selectedBox.gradient?.angle ?? 90}°</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={selectedBox.gradient?.angle ?? 90}
                        onChange={(e) => {
                          const angle = parseInt(e.target.value, 10);
                          handleUpdateTemplateBox(selectedBox.id, {
                            gradient: {
                              ...selectedBox.gradient,
                              enabled: true,
                              angle,
                            },
                          });
                        }}
                        className="w-full accent-[#E5B224] cursor-pointer"
                      />
                    </div>

                    {/* Stops Count Toggle & Stop Buttons */}
                    <div className="flex items-center justify-between pt-1 border-t border-[#262632]">
                      <span className="text-xs text-white/70 font-semibold">Stops</span>
                      <div className="flex items-center gap-1 bg-[#17171C] p-0.5 rounded-lg border border-[#2D2D38]">
                        <button
                          type="button"
                          onClick={() => {
                            handleUpdateTemplateBox(selectedBox.id, {
                              gradient: {
                                ...selectedBox.gradient,
                                enabled: true,
                                color3: undefined,
                              },
                            });
                            if (activeGradientStop === 3) setActiveGradientStop(2);
                          }}
                          className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                            !selectedBox.gradient?.color3
                              ? 'bg-[#E5B224] text-black shadow-sm'
                              : 'text-white/60 hover:text-white'
                          }`}
                        >
                          2 Stops
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleUpdateTemplateBox(selectedBox.id, {
                              gradient: {
                                ...selectedBox.gradient,
                                enabled: true,
                                color3: selectedBox.gradient?.color3 || '#3B82F6',
                              },
                            });
                          }}
                          className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                            selectedBox.gradient?.color3
                              ? 'bg-[#E5B224] text-black shadow-sm'
                              : 'text-white/60 hover:text-white'
                          }`}
                        >
                          3 Stops
                        </button>
                      </div>
                    </div>

                    {/* Stop Selector Tabs */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1, 2, ...(selectedBox.gradient?.color3 !== undefined ? [3] : [])].map((stopNum) => {
                        const sColor =
                          stopNum === 1
                            ? selectedBox.gradient?.color || '#22C55E'
                            : stopNum === 2
                            ? selectedBox.gradient?.color2 || '#FACC15'
                            : selectedBox.gradient?.color3 || '#3B82F6';
                        const isActive = activeGradientStop === stopNum;

                        return (
                          <button
                            key={stopNum}
                            type="button"
                            onClick={() => setActiveGradientStop(stopNum as 1 | 2 | 3)}
                            className={`p-1.5 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                              isActive
                                ? 'bg-[#2A2A38] border-[#E5B224] ring-1 ring-[#E5B224]'
                                : 'bg-[#17171C] border-[#333342] hover:border-white/40'
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-full border border-white/40 shrink-0"
                              style={{ backgroundColor: sColor }}
                            />
                            <span className="text-[11px] font-bold text-white">Stop {stopNum}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Stop Color Editor (Color Picker + Hex Code) */}
                    {(() => {
                      const curColor =
                        activeGradientStop === 1
                          ? selectedBox.gradient?.color || '#22C55E'
                          : activeGradientStop === 2
                          ? selectedBox.gradient?.color2 || '#FACC15'
                          : selectedBox.gradient?.color3 || '#3B82F6';

                      const updateStopColor = (newHex: string) => {
                        const grad = { ...selectedBox.gradient, enabled: true };
                        if (activeGradientStop === 1) grad.color = newHex;
                        else if (activeGradientStop === 2) grad.color2 = newHex;
                        else grad.color3 = newHex;
                        handleUpdateTemplateBox(selectedBox.id, { gradient: grad });
                      };

                      return (
                        <div className="space-y-2 p-2 bg-[#17171C] rounded-xl border border-[#2D2D38]">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/80 font-semibold">Stop {activeGradientStop} Colour</span>
                            <div className="flex items-center gap-1 bg-[#121217] border border-[#333342] px-2 py-0.5 rounded-lg">
                              <span className="text-xs text-[#E5B224] font-mono">#</span>
                              <input
                                type="text"
                                maxLength={7}
                                value={curColor.replace(/^#/, '')}
                                onChange={(e) => {
                                  const val = e.target.value.trim();
                                  if (/^[0-9A-Fa-f]{0,6}$/.test(val)) {
                                    updateStopColor('#' + val);
                                  }
                                }}
                                className="w-16 bg-transparent text-xs font-mono text-white focus:outline-none uppercase"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            {[
                              '#22C55E',
                              '#FACC15',
                              '#3B82F6',
                              '#EF4444',
                              '#EC4899',
                              '#8B5CF6',
                              '#10B981',
                              '#F97316',
                              '#FFFFFF',
                              '#000000',
                            ].map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => updateStopColor(hex)}
                                className={`w-6 h-6 rounded-full border transition-all ${
                                  curColor.toUpperCase() === hex.toUpperCase()
                                    ? 'border-white scale-110 shadow-md ring-2 ring-[#E5B224]'
                                    : 'border-white/20 hover:scale-105'
                                }`}
                                style={{ backgroundColor: hex }}
                                title={hex}
                              />
                            ))}
                            <input
                              type="color"
                              value={curColor.startsWith('#') && curColor.length === 7 ? curColor : '#22C55E'}
                              onChange={(e) => updateStopColor(e.target.value)}
                              className="w-6 h-6 rounded-full bg-transparent border-0 cursor-pointer shrink-0"
                              title="Pick custom stop colour"
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Effects Panel (shadow, glow, outline, neon, hollow, highlight) */}
            {activeSelectedTool === 'effects' && (
              <div className="space-y-3">
                {/* Effect Toggle Buttons */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(['shadow', 'glow', 'outline', 'neon', 'hollow', 'highlight'] as const).map(
                    (effect) => {
                      const isEnabled = !!selectedBox.effects?.[effect]?.enabled;
                      const isInspected = inspectedEffect === effect;

                      return (
                        <button
                          key={effect}
                          type="button"
                          onClick={() => {
                            const currentEffects = { ...(selectedBox.effects || {}) };
                            if (isEnabled && isInspected) {
                              // Tapping active effect toggles it off
                              currentEffects[effect] = {
                                ...currentEffects[effect],
                                enabled: false,
                              };
                              handleUpdateTemplateBox(selectedBox.id, { effects: currentEffects });
                            } else if (isEnabled && !isInspected) {
                              // Inspect this effect
                              setInspectedEffect(effect);
                            } else {
                              // Enable and inspect
                              setInspectedEffect(effect);
                              currentEffects[effect] = {
                                ...currentEffects[effect],
                                enabled: true,
                                ...(effect === 'shadow'
                                  ? { blur: 8, color: '#000000', offsetX: 3, offsetY: 3, opacity: 80 }
                                  : {}),
                                ...(effect === 'glow'
                                  ? { blur: 16, color: '#E5B224', intensity: 75, opacity: 90 }
                                  : {}),
                                ...(effect === 'outline'
                                  ? { width: 2, color: '#000000', opacity: 100 }
                                  : {}),
                                ...(effect === 'neon'
                                  ? { intensity: 1.5, color: '#00FFA3', blur: 16, opacity: 100 }
                                  : {}),
                                ...(effect === 'hollow'
                                  ? { width: 2, strokeWidth: 2, color: selectedBox.color || '#FFF8E7', opacity: 100 }
                                  : {}),
                                ...(effect === 'highlight'
                                  ? { color: '#FFE600', opacity: 60 }
                                  : {}),
                              };
                              handleUpdateTemplateBox(selectedBox.id, { effects: currentEffects });
                            }
                          }}
                          className={`py-1.5 px-2 border text-[11px] font-semibold rounded-lg capitalize text-center transition-all flex items-center justify-between ${
                            isEnabled
                              ? isInspected
                                ? 'bg-[#E5B224] text-black border-[#E5B224] font-bold shadow-md ring-1 ring-white'
                                : 'bg-[#E5B224]/80 text-black border-[#E5B224] font-bold'
                              : isInspected
                              ? 'bg-[#262632] border-[#E5B224] text-white'
                              : 'bg-[#17171C] hover:bg-[#262632] border-[#333342] text-white/80'
                          }`}
                        >
                          <span>{effect}</span>
                          {isEnabled && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                        </button>
                      );
                    }
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-white/60 font-medium">Multiple effects can be combined</span>
                  <button
                    type="button"
                    onClick={() => handleUpdateTemplateBox(selectedBox.id, { effects: undefined })}
                    className="py-1 px-2.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-[11px] font-semibold rounded-lg text-red-300 text-center"
                  >
                    Reset all effects
                  </button>
                </div>

                {/* Settings Panel for Inspected Effect */}
                {(() => {
                  const effKey = inspectedEffect;
                  const effSettings = selectedBox.effects?.[effKey] || {};
                  const isEnabled = !!effSettings.enabled;

                  const updateEff = (changes: Record<string, any>) => {
                    const currentEffects = { ...(selectedBox.effects || {}) };
                    currentEffects[effKey] = {
                      ...currentEffects[effKey],
                      enabled: true,
                      ...changes,
                    };
                    handleUpdateTemplateBox(selectedBox.id, { effects: currentEffects });
                  };

                  return (
                    <div className="p-3 bg-[#17171C] rounded-xl border border-[#2D2D38] space-y-3 pt-2.5">
                      <div className="flex items-center justify-between border-b border-[#262632] pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold capitalize text-[#E5B224]">
                            {effKey} Controls
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              isEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40'
                            }`}
                          >
                            {isEnabled ? 'Active' : 'Off'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const currentEffects = { ...(selectedBox.effects || {}) };
                            currentEffects[effKey] = {
                              ...currentEffects[effKey],
                              enabled: !isEnabled,
                            };
                            handleUpdateTemplateBox(selectedBox.id, { effects: currentEffects });
                          }}
                          className={`text-[11px] px-2 py-0.5 rounded font-bold transition-colors ${
                            isEnabled
                              ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                              : 'bg-[#E5B224] text-black hover:bg-[#F4D58D]'
                          }`}
                        >
                          {isEnabled ? 'Turn Off' : 'Turn On'}
                        </button>
                      </div>

                      {/* Controls: Colour */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-white/70">
                          <span>Colour</span>
                          <div className="flex items-center gap-1 bg-[#121217] border border-[#333342] px-2 py-0.5 rounded-lg">
                            <span className="text-xs text-[#E5B224] font-mono">#</span>
                            <input
                              type="text"
                              maxLength={7}
                              value={(effSettings.color || (effKey === 'neon' ? '#00FFA3' : effKey === 'highlight' ? '#FFE600' : '#000000')).replace(/^#/, '')}
                              onChange={(e) => {
                                const val = e.target.value.trim();
                                if (/^[0-9A-Fa-f]{0,6}$/.test(val)) {
                                  updateEff({ color: '#' + val });
                                }
                              }}
                              className="w-16 bg-transparent text-xs font-mono text-white focus:outline-none uppercase"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          {[
                            '#000000',
                            '#FFFFFF',
                            '#E5B224',
                            '#00FFA3',
                            '#3B82F6',
                            '#EF4444',
                            '#FFE600',
                            '#EC4899',
                          ].map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => updateEff({ color: hex })}
                              className={`w-5 h-5 rounded-full border transition-all ${
                                (effSettings.color || '').toUpperCase() === hex.toUpperCase()
                                  ? 'border-white scale-110 shadow-md ring-2 ring-[#E5B224]'
                                  : 'border-white/20 hover:scale-105'
                              }`}
                              style={{ backgroundColor: hex }}
                              title={hex}
                            />
                          ))}
                          <input
                            type="color"
                            value={
                              effSettings.color && effSettings.color.startsWith('#') && effSettings.color.length === 7
                                ? effSettings.color
                                : effKey === 'neon' ? '#00FFA3' : '#000000'
                            }
                            onChange={(e) => updateEff({ color: e.target.value })}
                            className="w-5 h-5 rounded-full bg-transparent border-0 cursor-pointer shrink-0"
                            title="Choose custom colour"
                          />
                        </div>
                      </div>

                      {/* Controls: Intensity (for glow, neon) */}
                      {(effKey === 'glow' || effKey === 'neon') && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-white/70">
                            <span>Intensity</span>
                            <span className="font-mono text-[#E5B224] text-xs">
                              {effKey === 'neon'
                                ? (effSettings.intensity ?? 1.5)
                                : `${effSettings.intensity ?? 75}%`}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={effKey === 'neon' ? 0.5 : 0}
                            max={effKey === 'neon' ? 3.0 : 100}
                            step={effKey === 'neon' ? 0.1 : 1}
                            value={effKey === 'neon' ? (effSettings.intensity ?? 1.5) : (effSettings.intensity ?? 75)}
                            onChange={(e) =>
                              updateEff({
                                intensity: effKey === 'neon' ? parseFloat(e.target.value) : parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full accent-[#E5B224] cursor-pointer"
                          />
                        </div>
                      )}

                      {/* Controls: Blur (for shadow, glow, neon) */}
                      {(effKey === 'shadow' || effKey === 'glow' || effKey === 'neon') && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-white/70">
                            <span>Blur</span>
                            <span className="font-mono text-[#E5B224] text-xs">{effSettings.blur ?? (effKey === 'shadow' ? 8 : 16)}px</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={40}
                            value={effSettings.blur ?? (effKey === 'shadow' ? 8 : 16)}
                            onChange={(e) => updateEff({ blur: parseInt(e.target.value, 10) })}
                            className="w-full accent-[#E5B224] cursor-pointer"
                          />
                        </div>
                      )}

                      {/* Controls: Opacity */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-white/70">
                          <span>Opacity</span>
                          <span className="font-mono text-[#E5B224] text-xs">{effSettings.opacity ?? 100}%</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={effSettings.opacity ?? 100}
                          onChange={(e) => updateEff({ opacity: parseInt(e.target.value, 10) })}
                          className="w-full accent-[#E5B224] cursor-pointer"
                        />
                      </div>

                      {/* Controls: Offset X & Offset Y (for shadow) */}
                      {effKey === 'shadow' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-white/70">
                              <span>Offset X</span>
                              <span className="font-mono text-[#E5B224] text-xs">{effSettings.offsetX ?? 3}px</span>
                            </div>
                            <input
                              type="range"
                              min={-25}
                              max={25}
                              value={effSettings.offsetX ?? 3}
                              onChange={(e) => updateEff({ offsetX: parseInt(e.target.value, 10) })}
                              className="w-full accent-[#E5B224] cursor-pointer"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-white/70">
                              <span>Offset Y</span>
                              <span className="font-mono text-[#E5B224] text-xs">{effSettings.offsetY ?? 3}px</span>
                            </div>
                            <input
                              type="range"
                              min={-25}
                              max={25}
                              value={effSettings.offsetY ?? 3}
                              onChange={(e) => updateEff({ offsetY: parseInt(e.target.value, 10) })}
                              className="w-full accent-[#E5B224] cursor-pointer"
                            />
                          </div>
                        </div>
                      )}

                      {/* Controls: Width (for outline, hollow) */}
                      {(effKey === 'outline' || effKey === 'hollow') && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-white/70">
                            <span>Width</span>
                            <span className="font-mono text-[#E5B224] text-xs">{effSettings.width ?? 2}px</span>
                          </div>
                          <input
                            type="range"
                            min={0.5}
                            max={effKey === 'hollow' ? 6 : 10}
                            step={0.5}
                            value={effSettings.width ?? 2}
                            onChange={(e) => {
                              const w = parseFloat(e.target.value);
                              updateEff({ width: w, strokeWidth: w });
                            }}
                            className="w-full accent-[#E5B224] cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Format Panel */}
            {activeSelectedTool === 'format' && (
              <div className="space-y-3">
                {/* Lists: whole text of this box (use Mode B for selected words) */}
                {(() => {
                  const lbl = selectedBox.fieldLabel;
                  const runsNow = activePage?.richValues?.[lbl]?.length
                    ? activePage.richValues[lbl]
                    : [{ text: activePage?.values[lbl] || '' }];
                  const cur = selectionListKind(runsNow, 0, totalLength(runsNow));
                  return (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleBoxList('bullet')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[12px] font-semibold ${cur === 'bullet' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-[#17171C] text-white/80 border-[#333342]'}`}
                      >
                        <ListIcon className="w-4 h-4" /> Bullets
                      </button>
                      <button
                        onClick={() => handleToggleBoxList('number')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[12px] font-semibold ${cur === 'number' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-[#17171C] text-white/80 border-[#333342]'}`}
                      >
                        <ListOrdered className="w-4 h-4" /> Numbers
                      </button>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        fontWeight:
                          selectedBox.fontWeight === '700' || selectedBox.fontWeight === '800'
                            ? '400'
                            : '700',
                      })
                    }
                    className={`p-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center flex-1 ${
                      selectedBox.fontWeight === '700' || selectedBox.fontWeight === '800'
                        ? 'bg-[#E5B224] text-black font-extrabold'
                        : 'bg-[#17171C] text-white/70 hover:text-white'
                    }`}
                  >
                    <Bold className="w-4 h-4 mr-1" />
                    <span>Bold</span>
                  </button>

                  <button
                    onClick={() =>
                      handleUpdateTemplateBox(selectedBox.id, {
                        fontStyle: selectedBox.fontStyle === 'italic' ? 'normal' : 'italic',
                      })
                    }
                    className={`p-2 rounded-lg text-xs italic transition-all flex items-center justify-center flex-1 ${
                      selectedBox.fontStyle === 'italic'
                        ? 'bg-[#E5B224] text-black'
                        : 'bg-[#17171C] text-white/70 hover:text-white'
                    }`}
                  >
                    <Italic className="w-4 h-4 mr-1" />
                    <span>Italic</span>
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-[#17171C] p-1 rounded-xl border border-[#333342]">
                  {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                    <button
                      key={align}
                      onClick={() => handleUpdateTemplateBox(selectedBox.id, { textAlign: align })}
                      className={`flex-1 py-1.5 rounded-lg text-xs transition-all flex items-center justify-center ${
                        selectedBox.textAlign === align
                          ? 'bg-[#E5B224] text-black'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {align === 'left' && <AlignLeft className="w-4 h-4" />}
                      {align === 'center' && <AlignCenter className="w-4 h-4" />}
                      {align === 'right' && <AlignRight className="w-4 h-4" />}
                      {align === 'justify' && <AlignJustify className="w-4 h-4" />}
                    </button>
                  ))}
                </div>

                {/* Position pad: tap or hold to nudge */}
                <div className="pt-2 border-t border-[#333342]/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-[#E5B224]">Position</span>
                    <span className="text-[10px] text-white/50 font-mono">
                      X {selectedBox.x.toFixed(1)}% · Y {selectedBox.y.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    {[0.5, 1, 5].map((st) => (
                      <button
                        key={st}
                        onClick={() => setNudgeStep(st)}
                        className={`px-3 py-1 rounded-full text-[11px] font-bold border ${nudgeStep === st ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-[#17171C] text-white/70 border-[#333342]'}`}
                      >
                        {st}%
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      onPointerDown={(e) => { e.preventDefault(); startNudgeRepeat(0, -1); }}
                      onPointerUp={stopNudgeRepeat}
                      onPointerLeave={stopNudgeRepeat}
                      onPointerCancel={stopNudgeRepeat}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                      className="bg-[#17171C] active:bg-[#D4AF37] active:text-black border border-[#333342] rounded-xl text-white font-bold text-lg w-12 h-12 flex items-center justify-center"
                      title="Move Up"
                    >
                      ↑
                    </button>
                    <div className="flex items-center gap-1.5">
                    <button
                      onPointerDown={(e) => { e.preventDefault(); startNudgeRepeat(-1, 0); }}
                      onPointerUp={stopNudgeRepeat}
                      onPointerLeave={stopNudgeRepeat}
                      onPointerCancel={stopNudgeRepeat}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                      className="bg-[#17171C] active:bg-[#D4AF37] active:text-black border border-[#333342] rounded-xl text-white font-bold text-lg w-12 h-12 flex items-center justify-center"
                      title="Move Left"
                    >
                      ←
                    </button>
                      <div className="w-12 h-12 flex items-center justify-center text-white/30 text-lg">✥</div>
                    <button
                      onPointerDown={(e) => { e.preventDefault(); startNudgeRepeat(1, 0); }}
                      onPointerUp={stopNudgeRepeat}
                      onPointerLeave={stopNudgeRepeat}
                      onPointerCancel={stopNudgeRepeat}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                      className="bg-[#17171C] active:bg-[#D4AF37] active:text-black border border-[#333342] rounded-xl text-white font-bold text-lg w-12 h-12 flex items-center justify-center"
                      title="Move Right"
                    >
                      →
                    </button>
                    </div>
                    <button
                      onPointerDown={(e) => { e.preventDefault(); startNudgeRepeat(0, 1); }}
                      onPointerUp={stopNudgeRepeat}
                      onPointerLeave={stopNudgeRepeat}
                      onPointerCancel={stopNudgeRepeat}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                      className="bg-[#17171C] active:bg-[#D4AF37] active:text-black border border-[#333342] rounded-xl text-white font-bold text-lg w-12 h-12 flex items-center justify-center"
                      title="Move Down"
                    >
                      ↓
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <button
                      onClick={() => nudgeBox(0, 0, { x: (100 - selectedBox.width) / 2 })}
                      className="px-3 py-1.5 bg-[#17171C] border border-[#333342] rounded-lg text-[11px] text-white/80 font-semibold"
                    >
                      Centre ↔
                    </button>
                    <button
                      onClick={() => nudgeBox(0, 0, { y: 50 - (selectedBox.height || 10) / 2 })}
                      className="px-3 py-1.5 bg-[#17171C] border border-[#333342] rounded-lg text-[11px] text-white/80 font-semibold"
                    >
                      Centre ↕
                    </button>
                  </div>
                </div>

                {/* Rotation Control (BUG-011, BUG-012) */}
                <div className="pt-2 border-t border-[#333342]/60 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-[#E5B224]">Rotation</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleRotateSelectedBox(-15)}
                      className="px-2 py-1 bg-[#17171C] hover:bg-[#262632] border border-[#333342] rounded-lg text-[11px] text-white"
                      title="-15°"
                    >
                      -15°
                    </button>
                    <span className="text-xs font-mono font-bold text-[#E5B224] min-w-[36px] text-center">
                      {selectedBox.rotation || 0}°
                    </span>
                    <button
                      onClick={() => handleRotateSelectedBox(15)}
                      className="px-2 py-1 bg-[#17171C] hover:bg-[#262632] border border-[#333342] rounded-lg text-[11px] text-white"
                      title="+15°"
                    >
                      +15°
                    </button>
                    <button
                      onClick={() => handleRotateSelectedBox(-(selectedBox.rotation || 0))}
                      className="px-1.5 py-1 bg-red-950/40 border border-red-800 rounded-lg text-[10px] text-red-300"
                      title="Reset rotation to 0°"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Reset words to match box (Clear Mode B rich overrides) */}
                {activePage?.richValues && activePage.richValues[selectedBox.fieldLabel] && activePage.richValues[selectedBox.fieldLabel].length > 0 && (
                  <div className="pt-2 border-t border-[#333342]/60">
                    <button
                      type="button"
                      onClick={() => {
                        recordHistory(project, true);
                        const rawText = activePage.values[selectedBox.fieldLabel] !== undefined
                          ? activePage.values[selectedBox.fieldLabel]
                          : selectedBox.fieldLabel;
                        const updatedPages = project.pages.map((p, idx) => {
                          if (idx !== activePageIndex) return p;
                          const newRich = { ...(p.richValues || {}) };
                          delete newRich[selectedBox.fieldLabel];
                          return {
                            ...p,
                            richValues: newRich,
                            values: { ...p.values, [selectedBox.fieldLabel]: rawText },
                          };
                        });
                        const updatedProj: Project = {
                          ...project,
                          pages: updatedPages,
                          updatedAt: Date.now(),
                        };
                        onUpdateProject(updatedProj);
                        triggerAutoSave(updatedProj);
                        showToast('Reset words to match box styling');
                      }}
                      className="w-full py-2 px-3 bg-[#17171C] hover:bg-[#262632] border border-[#D4AF37]/40 text-[#D4AF37] hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset words to match box</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Upload Sub-Popup (BUG-008: Batch, Single, and Image Overlay) */}
        {isUploadMenuOpen && !selectedBoxId && (
          <div className="mb-2 bg-[#0B0B0F] border-2 border-[#D4AF37]/50 rounded-2xl p-2.5 shadow-2xl text-white flex items-center gap-2 animate-in slide-in-from-bottom-2 max-w-sm mx-auto">
            <button
              onClick={() => {
                setIsUploadMenuOpen(false);
                batchUploadRef.current?.click();
              }}
              className="flex-1 py-2 bg-[#E5B224] text-black text-xs font-bold rounded-xl flex items-center justify-center gap-1"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Batch</span>
            </button>
            <button
              onClick={() => {
                setIsUploadMenuOpen(false);
                singleUploadRef.current?.click();
              }}
              className="flex-1 py-2 bg-[#1C1C24] hover:bg-[#262632] border border-[#333342] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5 text-[#E5B224]" />
              <span>Single</span>
            </button>
            <button
              onClick={() => {
                setIsUploadMenuOpen(false);
                overlayUploadRef.current?.click();
              }}
              className="flex-1 py-2 bg-[#1C1C24] hover:bg-[#262632] border border-[#333342] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#E5B224]" />
              <span>Overlay</span>
            </button>
          </div>
        )}

        {/* The Fixed Dock Container */}
        <div className="bg-[#0B0B0F] border-2 border-black/40 rounded-2xl px-2 sm:px-4 py-2 shadow-2xl flex items-center justify-between sm:justify-center gap-1 sm:gap-2.5 text-white">
          {selectedBoxId === null ? (
            /* STATE A: UNSELECTED TEXT (Exact match to IMG_1495 (2).pdf Page 2) */
            <>
              {/* [A Text] (BUG-006: Opens Text Element panel) */}
              <button
                onClick={() => setIsAddPanelOpen(true)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[50px] min-h-[46px]"
                title="Add Text Fields"
              >
                <Type className="w-4 h-4 text-[#E5B224]" />
                <span className="text-[10px] font-bold mt-1">Text</span>
              </button>

              {/* [📷 Upload] */}
              <button
                onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[50px] min-h-[46px]"
                title="Upload Backgrounds or Overlays"
              >
                <Upload className="w-4 h-4 text-[#E5B224]" />
                <span className="text-[10px] font-bold mt-1">Upload</span>
              </button>

              {/* [📑 Fields] */}
              <button
                onClick={() => setIsSpreadsheetOpen(true)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[50px] min-h-[46px]"
                title="Spreadsheet Fields"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#E5B224]" />
                <span className="text-[10px] font-bold mt-1">Fields</span>
              </button>

              {/* [🔄 Sync Layout] */}
              <button
                onClick={() => setIsSyncLayoutOpen(true)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[58px] min-h-[46px]"
                title="Sync Layout across designs"
              >
                <RefreshCw className="w-4 h-4 text-[#E5B224]" />
                <span className="text-[10px] font-bold mt-1 whitespace-nowrap">Sync Layout</span>
              </button>

              {/* [+ Add] (BUG-007: Opens Shape & Visual Elements panel) */}
              <button
                onClick={() => setIsShapePanelOpen(true)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[50px] min-h-[46px]"
                title="Add Shapes & Elements"
              >
                <Plus className="w-4 h-4 text-[#E5B224]" />
                <span className="text-[10px] font-bold mt-1">Add</span>
              </button>

              {/* [🖋️ More] */}
              <button
                onClick={() => setIsMoreMenuOpen(true)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[50px] min-h-[46px]"
                title="More Options"
              >
                <Feather className="w-4 h-4 text-[#E5B224]" />
                <span className="text-[10px] font-bold mt-1">More</span>
              </button>
            </>
          ) : (
            /* STATE B: SELECTED TEXT (Exact match to IMG_1495 (2).pdf Page 11) */
            <>
              {/* [✏️ Edit (pencil)] */}
              <button
                onClick={() => selectedBox && setEditingRichBoxId(selectedBox.id)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-[#E5B224] bg-[#1A1A24] hover:bg-[#262632] transition-all min-w-[46px] min-h-[46px]"
                title="Word-Level Text Editor"
              >
                <Edit3 className="w-4 h-4" />
                <span className="text-[10px] font-bold mt-1">Edit</span>
              </button>

              {/* [🖼️ Text Styles] */}
              <button
                onClick={() =>
                  setActiveSelectedTool(activeSelectedTool === 'styles' ? null : 'styles')
                }
                className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all min-w-[48px] min-h-[46px] ${
                  activeSelectedTool === 'styles'
                    ? 'bg-[#E5B224] text-black'
                    : 'text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24]'
                }`}
                title="Text Styles"
              >
                <Layers className="w-4 h-4" />
                <span className="text-[10px] font-bold mt-1 whitespace-nowrap">Styles</span>
              </button>

              {/* [🪶 Font] */}
              <button
                onClick={() =>
                  setActiveSelectedTool(activeSelectedTool === 'font' ? null : 'font')
                }
                className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all min-w-[48px] min-h-[46px] ${
                  activeSelectedTool === 'font'
                    ? 'bg-[#E5B224] text-black'
                    : 'text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24]'
                }`}
                title="Select Font"
              >
                <Type className="w-4 h-4" />
                <span className="text-[10px] font-bold mt-1 whitespace-nowrap">Font</span>
              </button>

              {/* [a Font size] */}
              <button
                onClick={() =>
                  setActiveSelectedTool(activeSelectedTool === 'size' ? null : 'size')
                }
                className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all min-w-[48px] min-h-[46px] ${
                  activeSelectedTool === 'size'
                    ? 'bg-[#E5B224] text-black'
                    : 'text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24]'
                }`}
                title="Font Size"
              >
                <span className="text-xs font-bold leading-none">aA</span>
                <span className="text-[10px] font-bold mt-1 whitespace-nowrap">Size</span>
              </button>

              {/* [🎨 Color] */}
              <button
                onClick={() =>
                  setActiveSelectedTool(activeSelectedTool === 'color' ? null : 'color')
                }
                className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all min-w-[46px] min-h-[46px] ${
                  activeSelectedTool === 'color'
                    ? 'bg-[#E5B224] text-black'
                    : 'text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24]'
                }`}
                title="Text Color"
              >
                <Palette className="w-4 h-4" />
                <span className="text-[10px] font-bold mt-1">Color</span>
              </button>

              {/* [✨ Effects] */}
              <button
                onClick={() =>
                  setActiveSelectedTool(activeSelectedTool === 'effects' ? null : 'effects')
                }
                className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all min-w-[48px] min-h-[46px] ${
                  activeSelectedTool === 'effects'
                    ? 'bg-[#E5B224] text-black'
                    : 'text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24]'
                }`}
                title="Text Effects"
              >
                <Sparkles className="w-4 h-4" />
                <span className="text-[10px] font-bold mt-1">Effects</span>
              </button>

              {/* [🔤 Format] */}
              <button
                onClick={() =>
                  setActiveSelectedTool(activeSelectedTool === 'format' ? null : 'format')
                }
                className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all min-w-[48px] min-h-[46px] ${
                  activeSelectedTool === 'format'
                    ? 'bg-[#E5B224] text-black'
                    : 'text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24]'
                }`}
                title="Format & Alignment"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="text-[10px] font-bold mt-1">Format</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hidden File Inputs for Background Uploads & Overlays */}
      <input
        ref={batchUploadRef}
        type="file"
        multiple
        accept="image/*,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          handleUploadFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={singleUploadRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          handleUploadFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={overlayUploadRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          handleInsertImageOverlay(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Multi-Page Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171C] border border-[#333342] rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-[#FFF8E7]">
                Delete {selectedPageIds.size} Design{selectedPageIds.size > 1 ? 's' : ''}?
              </h3>
            </div>
            <p className="text-xs text-[#FFF8E7]/70 leading-relaxed">
              These designs and their unused background images will be permanently removed from
              browser storage to free up space.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#FFF8E7]/70 hover:bg-[#212128] transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBatchDeletePages}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 transition-all min-h-[44px]"
              >
                Delete & Free Space
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Layout Modal (IMG_1495 (2).pdf Page 14) */}
      <SyncLayoutModal
        project={project}
        activePageIndex={activePageIndex}
        isOpen={isSyncLayoutOpen}
        onClose={() => setIsSyncLayoutOpen(false)}
        onSyncAll={handleSyncAllPages}
        onSyncCustomPages={handleSyncCustomPages}
        onSyncFieldsToPages={handleSyncFieldsToPages}
      />

      {/* Add Element Panel (IMG_1495 (2).pdf Page 17) */}
      <AddPanelModal
        isOpen={isAddPanelOpen}
        onClose={() => setIsAddPanelOpen(false)}
        onAddTextBox={handleAddFromPanel}
        onApplyFontCombination={handleApplyFontCombination}
      />

      {/* Shape Panel Modal (BUG-007) */}
      <ShapePanelModal
        isOpen={isShapePanelOpen}
        onClose={() => setIsShapePanelOpen(false)}
        onSelectShape={handleInsertShape}
      />

      {/* More Menu Drawer (IMG_1495 (2).pdf Pages 19-20) */}
      <MoreMenuDrawer
        project={project}
        activePageIndex={activePageIndex}
        isOpen={isMoreMenuOpen}
        onClose={() => setIsMoreMenuOpen(false)}
        onRenameProject={(newName) => {
          const updated = { ...project, name: newName };
          onUpdateProject(updated);
          triggerAutoSave(updated);
        }}
        onToggleThumbnails={() => {
          setShowTopThumbnails(!showTopThumbnails);
          setIsMoreMenuOpen(false);
        }}
        onDeleteCurrentPage={() => {
          if (project.pages.length <= 1) {
            alert('A project must have at least one design page.');
            return;
          }
          const targetPageId = activePage?.id;
          if (targetPageId) {
            deleteDesignsFromProjectAtomic(project.id, [targetPageId]).then((updated) => {
              onUpdateProject(updated);
              setIsMoreMenuOpen(false);
              showToast('Design deleted');
            });
          }
        }}
        onOpenTemplates={() => {
          setIsMoreMenuOpen(false);
          showToast('Template saved to storage');
        }}
        onOpenDownload={() => {
          setIsMoreMenuOpen(false);
          setIsDownloadOpen(true);
        }}
      />

      {/* Social Media Share Modal (IMG_1495 (2).pdf Page 10) */}
      <SocialShareModal
        project={project}
        activePageIndex={activePageIndex}
        isOpen={isSocialShareOpen}
        onClose={() => setIsSocialShareOpen(false)}
      />

      {/* Spreadsheet Bottom Sheet */}
      <SpreadsheetSheet
        project={project}
        isOpen={isSpreadsheetOpen}
        onClose={() => setIsSpreadsheetOpen(false)}
        onUpdateProject={(updated) => {
          recordHistory(project);
          onUpdateProject(updated);
          triggerAutoSave(updated);
        }}
      />

      {/* Download Bottom Sheet (IMG_1495 (2).pdf Pages 6-9) */}
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
