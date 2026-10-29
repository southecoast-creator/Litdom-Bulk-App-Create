/**
 * Litdom Batch Studio - Stage 2: Upload Background Designs
 * Batch multi-image upload, preserving original dimensions and aspect ratio.
 */
import React, { useRef, useState } from 'react';
import {
  Upload,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Trash2,
  FilePlus,
  Maximize2,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { Project, PageDesign, TextBox } from '../types';

interface UploadDesignsViewProps {
  project: Project;
  onUpdateProject: (updated: Project) => void;
  onNavigateToEdit: (pageIndex: number) => void;
  onLoadSample: () => void;
}

export const UploadDesignsView: React.FC<UploadDesignsViewProps> = ({
  project,
  onUpdateProject,
  onNavigateToEdit,
  onLoadSample,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);

    try {
      const newPages: PageDesign[] = [...project.pages];
      let currentMaxNum = newPages.length > 0 ? Math.max(...newPages.map((p) => p.pageNumber)) : 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        // Read image to get original dimensions & data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const imgDimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ width: 1080, height: 1350 });
          img.src = dataUrl;
        });

        currentMaxNum += 1;
        const pageId = `page_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;

        // Default initial 4 labelled text boxes for convenient mapping
        const initialBoxes: TextBox[] = [
          {
            id: `box_${pageId}_title`,
            fieldLabel: 'TITLE',
            content: `Page ${currentMaxNum} Headline`,
            x: 10,
            y: 22,
            width: 80,
            height: 14,
            fontFamily: 'Cinzel',
            fontSize: Math.round(imgDimensions.width * 0.046),
            fontWeight: '700',
            fontStyle: 'normal',
            textAlign: 'center',
            color: '#D4AF37',
            lineHeight: 1.25,
            letterSpacing: 2,
            shadow: { color: 'rgba(0,0,0,0.8)', blur: 8, offsetX: 0, offsetY: 2 },
          },
          {
            id: `box_${pageId}_sub`,
            fieldLabel: 'SUBTITLE',
            content: 'Detailed description text here',
            x: 15,
            y: 39,
            width: 70,
            height: 10,
            fontFamily: project.defaultFontFamily || 'Plus Jakarta Sans',
            fontSize: Math.round(imgDimensions.width * 0.024),
            fontWeight: '500',
            fontStyle: 'normal',
            textAlign: 'center',
            color: '#FFF8E7',
            lineHeight: 1.4,
            letterSpacing: 0,
          },
          {
            id: `box_${pageId}_p1`,
            fieldLabel: 'PARAGRAPH 1',
            content: 'Body text description that can be replaced with spreadsheet rows.',
            x: 15,
            y: 52,
            width: 70,
            height: 18,
            fontFamily: project.defaultFontFamily || 'Plus Jakarta Sans',
            fontSize: Math.round(imgDimensions.width * 0.02),
            fontWeight: '400',
            fontStyle: 'normal',
            textAlign: 'center',
            color: '#F4D58D',
            lineHeight: 1.5,
            letterSpacing: 0,
          },
          {
            id: `box_${pageId}_cta`,
            fieldLabel: 'CTA',
            content: 'CALL TO ACTION',
            x: 25,
            y: 76,
            width: 50,
            height: 8,
            fontFamily: 'Montserrat',
            fontSize: Math.round(imgDimensions.width * 0.018),
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

        newPages.push({
          id: pageId,
          pageNumber: currentMaxNum,
          name: file.name.replace(/\.[^/.]+$/, ''),
          imageUrl: dataUrl,
          originalWidth: imgDimensions.width,
          originalHeight: imgDimensions.height,
          textBoxes: initialBoxes,
        });
      }

      // Re-index page numbers sequentially 1..N
      const reindexed = newPages.map((page, idx) => ({
        ...page,
        pageNumber: idx + 1,
      }));

      onUpdateProject({
        ...project,
        pages: reindexed,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('Error processing batch image upload:', err);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const movePage = (index: number, direction: 'up' | 'down') => {
    const newPages = [...project.pages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newPages.length) return;

    const temp = newPages[index];
    newPages[index] = newPages[targetIndex];
    newPages[targetIndex] = temp;

    // Update page numbers sequentially
    const updated = newPages.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    onUpdateProject({ ...project, pages: updated, updatedAt: Date.now() });
  };

  const deletePage = (index: number) => {
    if (!window.confirm(`Delete Page ${project.pages[index].pageNumber}?`)) return;
    const newPages = project.pages.filter((_, idx) => idx !== index);
    const updated = newPages.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    onUpdateProject({ ...project, pages: updated, updatedAt: Date.now() });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#212128]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#FFF8E7]">
            Upload Design Backgrounds
          </h2>
          <p className="text-xs md:text-sm text-[#F4D58D]/70 mt-1">
            Upload single or multiple image templates (PNG, JPG, JPEG). Each image represents a numbered page with uncompromised resolution.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {project.pages.length === 0 && (
            <button
              onClick={onLoadSample}
              className="px-3.5 py-2 rounded-lg bg-[#17171C] border border-[#8C7625]/60 hover:border-[#D4AF37] text-[#F4D58D] text-xs font-medium flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Load 2 Test Backgrounds</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-semibold text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>{isProcessing ? 'Processing Images...' : 'Batch Upload Images'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
        </div>
      </div>

      {/* Flat Screenshot Notice Callout */}
      <div className="p-3.5 bg-[#17171C] border border-[#212128] rounded-xl text-xs flex items-start gap-3">
        <Info className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
        <div className="text-[#FFF8E7]/80 text-[11px] leading-relaxed">
          <strong className="text-[#FFF8E7]">Design Notice:</strong> An uploaded design or screenshot is treated as a preserved flat background image. Text baked into the image cannot be modified automatically. Litdom Batch Studio renders crisp, scalable text boxes positioned over your background. If your screenshot already has printed text, use clean template images or apply solid background fills to your text boxes in Edit Page.
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-[#D4AF37] bg-[#D4AF37]/5'
            : 'border-[#212128] hover:border-[#8C7625] bg-[#17171C]/40'
        }`}
      >
        <div className="w-12 h-12 rounded-xl bg-[#212128] text-[#D4AF37] flex items-center justify-center mx-auto mb-3">
          <ImageIcon className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-[#FFF8E7]">
          Drag and drop background images here, or tap to browse
        </h4>
        <p className="text-xs text-[#FFF8E7]/50 mt-1">
          Supports PNG, JPG, JPEG. Aspect ratios and native pixel resolutions are 100% preserved.
        </p>
      </div>

      {/* Uploaded Pages Grid */}
      {project.pages.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#FFF8E7] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#D4AF37]" />
              <span>Project Pages ({project.pages.length})</span>
            </h3>
            <span className="text-xs text-[#8C7625]">
              Spreadsheet data row 1 populates Page 1, row 2 populates Page 2, etc.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {project.pages.map((page, idx) => (
              <div
                key={page.id}
                className="bg-[#17171C] border border-[#212128] rounded-xl overflow-hidden flex flex-col justify-between hover:border-[#8C7625] transition-all"
              >
                {/* Image Banner */}
                <div
                  onClick={() => onNavigateToEdit(idx)}
                  className="h-44 bg-[#0B0B0F] relative cursor-pointer group flex items-center justify-center overflow-hidden"
                >
                  <img
                    src={page.imageUrl}
                    alt={page.name}
                    className="max-h-full max-w-full object-contain group-hover:scale-102 transition-transform duration-300"
                  />

                  {/* Badge */}
                  <div className="absolute top-2 left-2 px-2.5 py-1 rounded bg-[#0B0B0F]/90 border border-[#212128] text-xs font-bold text-[#D4AF37]">
                    Page {page.pageNumber}
                  </div>

                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-[#0B0B0F]/80 backdrop-blur-sm text-[10px] text-[#FFF8E7]/70 font-mono">
                    {page.originalWidth} × {page.originalHeight} px
                  </div>
                </div>

                {/* Info & Reorder Controls */}
                <div className="p-3 border-t border-[#212128] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h5 className="text-xs font-semibold text-[#FFF8E7] truncate">{page.name}</h5>
                    <p className="text-[11px] text-[#F4D58D]/60 mt-0.5">
                      {page.textBoxes.length} text {page.textBoxes.length === 1 ? 'box' : 'boxes'} configured
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => movePage(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1.5 rounded hover:bg-[#212128] text-[#FFF8E7]/70 hover:text-[#D4AF37] disabled:opacity-30 disabled:pointer-events-none"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => movePage(idx, 'down')}
                      disabled={idx === project.pages.length - 1}
                      className="p-1.5 rounded hover:bg-[#212128] text-[#FFF8E7]/70 hover:text-[#D4AF37] disabled:opacity-30 disabled:pointer-events-none"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onNavigateToEdit(idx)}
                      className="p-1.5 rounded hover:bg-[#212128] text-[#D4AF37]"
                      title="Edit text boxes on this page"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deletePage(idx)}
                      className="p-1.5 rounded hover:bg-[#212128] text-[#FFF8E7]/40 hover:text-red-400"
                      title="Delete page"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
