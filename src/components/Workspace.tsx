/**
 * Litdom Batch Studio - Screen 2: Unified Workspace
 * Automatic text box height (like Canva), rich text word formatting & double-tap editor,
 * thumbnail strip multi-page deletion, in-memory undo/redo, RAF drawing coalescing,
 * and downscaled preview image caching.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
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
import { loadAllStoredFonts } from '../utils/fontManager';
import { SpreadsheetSheet } from './SpreadsheetSheet';
import { DownloadSheet } from './DownloadSheet';
import { FontManagerModal } from './FontManagerModal';
import { RichTextOverlay } from './RichTextOverlay';
import { SyncLayoutModal } from './SyncLayoutModal';
import { AddPanelModal } from './AddPanelModal';
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
  const lastTapRef = useRef<{ time: number; boxId: string | null }>({ time: 0, boxId: null });

  // Bottom Sheets & Modals
  const [isSpreadsheetOpen, setIsSpreadsheetOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isFontManagerOpen, setIsFontManagerOpen] = useState(false);
  const [isSyncLayoutOpen, setIsSyncLayoutOpen] = useState(false);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSocialShareOpen, setIsSocialShareOpen] = useState(false);
  const [showTopThumbnails, setShowTopThumbnails] = useState(false);
  const [activeSelectedTool, setActiveSelectedTool] = useState<
    'styles' | 'font' | 'size' | 'color' | 'effects' | 'format' | null
  >(null);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  // Installed Custom Fonts
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

  // Canvas Refs & Dimensions
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);

  // File Input Refs for Uploads
  const batchUploadRef = useRef<HTMLInputElement>(null);
  const singleUploadRef = useRef<HTMLInputElement>(null);

  // Width Resize & Drag State (automatic height)
  const [activeHandle, setActiveHandle] = useState<CanvasHandleType | null>(null);
  const [dragStart, setDragStart] = useState<{
    mouseX: number;
    mouseY: number;
    boxX: number;
    boxY: number;
    boxW: number;
  } | null>(null);

  // Snap-to-Grid mode for precise alignment
  const [isSnapToGrid, setIsSnapToGrid] = useState(false);

  const selectedBox: TextBoxTemplate | undefined =
    selectedBoxId ? activeBoxes.find((b) => b.id === selectedBoxId) : undefined;

  // Helper to push history snapshot before mutations
  const recordHistory = useCallback((projToSave: Project) => {
    setUndoStack((prev) => [...prev.slice(-30), JSON.parse(JSON.stringify(projToSave))]);
    setRedoStack([]);
  }, []);

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    setRedoStack((prev) => [JSON.parse(JSON.stringify(project)), ...prev]);
    setUndoStack(newUndoStack);
    onUpdateProject(previous);
    saveProject(previous).catch(console.error);
    showToast('Undo');
  }, [undoStack, project, onUpdateProject]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    const newRedoStack = redoStack.slice(1);
    setUndoStack((prev) => [...prev, JSON.parse(JSON.stringify(project))]);
    setRedoStack(newRedoStack);
    onUpdateProject(next);
    saveProject(next).catch(console.error);
    showToast('Redo');
  }, [redoStack, project, onUpdateProject]);

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

    // Use fast ~1200px preview blob for buttery screen editing
    getPreviewImageBlob(targetImageId)
      .then((blob) => {
        if (!isCancelled && blob) {
          setCurrentImageData({ imageId: targetImageId, blob });
        }
      })
      .catch((err) => {
        console.error('Failed to load image preview:', err);
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
          [fieldLabel]: [{ text: newValue }],
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
    const sourceBox = activeBoxes.find((b) => b.fieldLabel === fieldLabel);
    if (!sourceBox) return;
    recordHistory(project);
    const updatedPages = project.pages.map((p, idx) => {
      if (targetPageIndices.includes(idx)) {
        const pBoxes = p.textBoxes && p.textBoxes.length > 0 ? p.textBoxes : project.template;
        const updated = pBoxes.map((b) => (b.fieldLabel === fieldLabel ? { ...b, ...sourceBox } : b));
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
    showToast(`Field "${fieldLabel}" synced`);
  };

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
    recordHistory(project);

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
    setSelectedBoxId(box.id);
    setActiveHandle(handle);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: box.x,
      boxY: box.y,
      boxW: box.width,
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

    switch (activeHandle) {
      case 'move':
        newX = Math.max(0, Math.min(100 - dragStart.boxW, Math.round(dragStart.boxX + deltaX)));
        newY = Math.max(0, Math.min(95, Math.round(dragStart.boxY + deltaY)));
        break;

      case 'e':
      case 'se':
      case 'ne':
        newW = Math.max(10, Math.min(100 - dragStart.boxX, Math.round(dragStart.boxW + deltaX)));
        break;

      case 'w':
      case 'sw':
      case 'nw':
        newW = Math.max(10, Math.round(dragStart.boxW - deltaX));
        newX = Math.max(0, Math.min(dragStart.boxX + dragStart.boxW - 10, Math.round(dragStart.boxX + deltaX)));
        break;
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

    // Update geometry on active design
    handleUpdateCurrentDesignBoxGeometry(selectedBoxId, { x: newX, y: newY, width: newW });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
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

  return (
    <div className="h-[100dvh] bg-[#E5B224] text-black flex flex-col font-sans select-none overflow-hidden overscroll-none relative">
      {/* 1. TOP APP BAR (Exact match to IMG_1495 (2).pdf Pages 2-5) */}
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

        {/* Center: Pagination & Project Title */}
        <div className="flex items-center gap-2">
          {project.pages.length > 0 && (
            <div className="flex items-center gap-1.5 bg-black/60 border border-white/10 px-3 py-1 rounded-full">
              <button
                onClick={() => handleSelectPage(Math.max(0, activePageIndex - 1))}
                disabled={activePageIndex === 0}
                className="text-white/70 hover:text-white disabled:opacity-30 p-0.5"
                title="Previous Design"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono font-bold text-[#E5B224] tracking-wide">
                Design {activePageIndex + 1} of {project.pages.length}
              </span>

              <button
                onClick={() =>
                  handleSelectPage(
                    Math.min(project.pages.length - 1, activePageIndex + 1)
                  )
                }
                disabled={activePageIndex === project.pages.length - 1}
                className="text-white/70 hover:text-white disabled:opacity-30 p-0.5"
                title="Next Design"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
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

              <div className="flex flex-col items-center">
                <span className="text-xs font-mono font-bold text-[#D4AF37]">
                  Design {activePageIndex + 1} of {project.pages.length}
                </span>
                <span className="text-[10px] text-[#FFF8E7]/40 truncate max-w-[180px]">
                  {activePage ? activePage.name : ''}
                </span>
              </div>

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

          {/* Interactive Canvas Container with Auto-Height Box Layout */}
          <div
            ref={canvasContainerRef}
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

                {/* Double-tap in-place rich text editor overlay */}
                {editingLayout && (
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
          <div className="mb-2 bg-[#0B0B0F] border-2 border-[#D4AF37]/50 rounded-2xl p-4 shadow-2xl text-white animate-in slide-in-from-bottom-2 max-w-md mx-auto">
            <div className="flex items-center justify-between mb-3 border-b border-[#262632] pb-2">
              <span className="text-xs font-bold text-[#E5B224] uppercase tracking-wider">
                {activeSelectedTool === 'styles' && 'Text Styles'}
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
                  <span className="font-mono text-[#E5B224]">{selectedBox.fontSize}px</span>
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

            {/* Color Panel */}
            {activeSelectedTool === 'color' && (
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
                          handleUpdateTemplateBox(selectedBox.id, { color: '#' + val });
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
                      onClick={() => handleUpdateTemplateBox(selectedBox.id, { color: hex })}
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
                      handleUpdateTemplateBox(selectedBox.id, { color: e.target.value })
                    }
                    className="w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer shrink-0"
                    title="Choose custom color"
                  />
                </div>
              </div>
            )}

            {/* Effects Panel */}
            {activeSelectedTool === 'effects' && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-1.5">
                  {(['none', 'shadow', 'glow', 'outline', 'neon', 'hollow', 'highlight'] as const).map(
                    (effect) => (
                      <button
                        key={effect}
                        onClick={() => {
                          const currentEffects = selectedBox.effects || {};
                          if (effect === 'none') {
                            handleUpdateTemplateBox(selectedBox.id, { effects: undefined });
                          } else {
                            handleUpdateTemplateBox(selectedBox.id, {
                              effects: {
                                ...currentEffects,
                                shadow: effect === 'shadow' ? { blur: 8, color: '#000000', offsetX: 2, offsetY: 2 } : currentEffects.shadow,
                                glow: effect === 'glow' ? { blur: 12, color: '#E5B224', opacity: 0.9 } : currentEffects.glow,
                                outline: effect === 'outline' ? { width: 2, color: '#000000' } : currentEffects.outline,
                                neon: effect === 'neon' ? { intensity: 1.5, color: '#00FFA3' } : currentEffects.neon,
                                hollow: effect === 'hollow' ? { strokeWidth: 1.5, strokeColor: selectedBox.color } : currentEffects.hollow,
                                highlight: effect === 'highlight' ? { color: '#FFE600', opacity: 0.6 } : currentEffects.highlight,
                              },
                            });
                          }
                        }}
                        className="py-1.5 px-2 bg-[#17171C] hover:bg-[#262632] border border-[#333342] text-[11px] font-semibold rounded-lg capitalize text-center"
                      >
                        {effect}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => handleUpdateTemplateBox(selectedBox.id, { effects: undefined })}
                    className="py-1.5 px-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-[11px] font-semibold rounded-lg text-red-300 text-center"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}

            {/* Format Panel */}
            {activeSelectedTool === 'format' && (
              <div className="space-y-3">
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
              </div>
            )}
          </div>
        )}

        {/* Upload Sub-Popup (When Upload button is clicked in unselected dock) */}
        {isUploadMenuOpen && !selectedBoxId && (
          <div className="mb-2 bg-[#0B0B0F] border-2 border-[#D4AF37]/50 rounded-2xl p-3 shadow-2xl text-white flex items-center gap-2 animate-in slide-in-from-bottom-2 max-w-xs mx-auto">
            <button
              onClick={() => {
                setIsUploadMenuOpen(false);
                batchUploadRef.current?.click();
              }}
              className="flex-1 py-2 bg-[#E5B224] text-black text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Batch Upload</span>
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
          </div>
        )}

        {/* The Fixed Dock Container */}
        <div className="bg-[#0B0B0F] border-2 border-black/40 rounded-2xl px-2 sm:px-4 py-2 shadow-2xl flex items-center justify-between sm:justify-center gap-1 sm:gap-2.5 text-white">
          {selectedBoxId === null ? (
            /* STATE A: UNSELECTED TEXT (Exact match to IMG_1495 (2).pdf Page 2) */
            <>
              {/* [A Text] */}
              <button
                onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[50px] min-h-[46px]"
                title="Text Fields"
              >
                <Type className="w-4 h-4 text-[#E5B224]" />
                <span className="text-[10px] font-bold mt-1">Text</span>
              </button>

              {/* [📷 Upload] */}
              <button
                onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[50px] min-h-[46px]"
                title="Upload Backgrounds"
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

              {/* [+ Add] */}
              <button
                onClick={() => setIsAddPanelOpen(true)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[50px] min-h-[46px]"
                title="Add Elements"
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
                onClick={() => setIsFontManagerOpen(true)}
                className="flex flex-col items-center justify-center px-2 py-1 rounded-xl text-white/90 hover:text-[#E5B224] hover:bg-[#1A1A24] transition-all min-w-[46px] min-h-[46px]"
                title="Select Font"
              >
                <Type className="w-4 h-4 text-[#E5B224]" />
                <span className="text-[10px] font-bold mt-1">Font</span>
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

      {/* Hidden File Inputs for Background Uploads */}
      <input
        ref={batchUploadRef}
        type="file"
        multiple
        accept="image/png, image/jpeg, image/jpg"
        onChange={(e) => handleUploadFiles(e.target.files)}
        className="hidden"
      />
      <input
        ref={singleUploadRef}
        type="file"
        accept="image/png, image/jpeg, image/jpg"
        onChange={(e) => handleUploadFiles(e.target.files)}
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
        onSyncFieldToPages={handleSyncFieldToPages}
      />

      {/* Add Element Panel (IMG_1495 (2).pdf Page 17) */}
      <AddPanelModal
        isOpen={isAddPanelOpen}
        onClose={() => setIsAddPanelOpen(false)}
        onAddTextBox={handleAddFromPanel}
        onApplyFontCombination={handleApplyFontCombination}
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
