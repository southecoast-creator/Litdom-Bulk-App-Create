/**
 * Litdom Batch Studio - Screen 1: Dashboard
 * Exact visual match to IMG_1495 (2).pdf Page 1:
 * - Golden yellow theme (#E5B224)
 * - Header: "LITDOM BATCH STUDIOS" with notification bell, settings, and user profile icons
 * - Pill search bar: "Search here ..."
 * - Create a Project section with 3 cards: Document (DOCX), Images (Single/Bulk), Sheet (Spreadsheet)
 * - Your Projects grid with folder icon, 3-bar menu (Download, Edit, Delete, Save as Template), and preview thumbnail
 * - Storage section with Used (red) and Available (green) indicators
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Settings,
  User,
  Search,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  Folder,
  Menu,
  Download,
  Edit3,
  Trash2,
  BookmarkPlus,
  BookmarkX,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react';
import { Project, StorageBreakdown, SavedTemplate } from '../types';
import {
  getAllProjects,
  saveProject,
  deleteProject,
  createDefaultTemplate,
  calculateExactStorageBreakdown,
  storeImageFile,
  formatBytes,
  saveSavedTemplate,
  getAllSavedTemplates,
  deleteSavedTemplate,
  getThumbnailBlob,
  createManagedObjectUrl,
  APP_STORAGE_QUOTA_BYTES,
} from '../utils/db';
import { DocxWorkflowModal } from './DocxWorkflowModal';
import * as XLSX from 'xlsx';

interface DashboardProps {
  onOpenProject: (projectId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);

  // Storage State
  const [storageBreakdown, setStorageBreakdown] = useState<StorageBreakdown>({
    designsBytes: 0,
    fontsBytes: 0,
    projectsBytes: 0,
    totalBytes: 0,
    projectSizes: {},
  });
  const [storageEstimate, setStorageEstimate] = useState<{
    usedBytes: number;
    quotaBytes: number;
    percentage: number;
  }>({ usedBytes: 0, quotaBytes: 1073741824, percentage: 0 });

  // Thumbnail URLs: projectId -> objectUrl
  const [projectThumbnails, setProjectThumbnails] = useState<Record<string, string>>({});

  // Workflow Modals & Inputs
  const [isDocxModalOpen, setIsDocxModalOpen] = useState(false);
  const [isTemplateSelectorOpen, setIsTemplateSelectorOpen] = useState(false);
  const [pendingSheetData, setPendingSheetData] = useState<{
    filename: string;
    headers: string[];
    rows: Record<string, string>[];
  } | null>(null);

  const [savedTemplatesList, setSavedTemplatesList] = useState<SavedTemplate[]>([]);

  // File Input Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  // Project Delete Confirmation
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const loadData = async () => {
    try {
      const [list, breakdown, tpls] = await Promise.all([
        getAllProjects(),
        calculateExactStorageBreakdown(),
        getAllSavedTemplates(),
      ]);
      setProjects(list);
      setStorageBreakdown(breakdown);
      setSavedTemplatesList(tpls);

      // Load thumbnail for first page of each project
      const thumbs: Record<string, string> = {};
      for (const p of list) {
        if (p.pages.length > 0 && p.pages[0].imageId) {
          const blob = await getThumbnailBlob(p.pages[0].imageId);
          if (blob) {
            thumbs[p.id] = createManagedObjectUrl(blob);
          }
        }
      }
      setProjectThumbnails(thumbs);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleClickOutside = () => setActiveMenuProjectId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // 1. Image Workflow: Single or Bulk Images Upload
  const handleImagesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    const pages: any[] = [];
    const baseTemplate = createDefaultTemplate();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      try {
        const stored = await storeImageFile(file);
        pages.push({
          id: `page_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          imageId: stored.imageId,
          name: file.name.replace(/\.[^/.]+$/, ''),
          width: stored.width,
          height: stored.height,
          values: {
            Title: file.name.replace(/\.[^/.]+$/, ''),
            Subtitle: 'Your Subtitle Here',
          },
          textBoxes: JSON.parse(JSON.stringify(baseTemplate)),
        });
      } catch (err) {
        console.error('Failed storing image file:', err);
      }
    }

    if (pages.length === 0) {
      setLoading(false);
      return;
    }

    const firstFileName = files[0].name.replace(/\.[^/.]+$/, '');
    const newProject: Project = {
      id: `proj_img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: pages.length === 1 ? firstFileName : `${firstFileName} (Batch of ${pages.length})`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      template: baseTemplate,
      pages,
    };

    await saveProject(newProject);
    setLoading(false);
    onOpenProject(newProject.id);
  };

  // 2. Spreadsheet Workflow: Upload Sheet
  const handleSheetSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      if (json.length === 0) {
        showToast('Spreadsheet contains no data rows.');
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

      setPendingSheetData({
        filename: file.name.replace(/\.[^/.]+$/, ''),
        headers,
        rows: cleanRows,
      });

      // Open template selector dialog (Saved template or Plain-white)
      setIsTemplateSelectorOpen(true);
    } catch (err) {
      console.error('Failed parsing sheet:', err);
      showToast('Could not parse spreadsheet file.');
    }
  };

  // Populate Spreadsheet into chosen template or Plain-White
  const handleApplyTemplateToSpreadsheet = async (chosenTemplate?: SavedTemplate) => {
    if (!pendingSheetData) return;
    setLoading(true);

    const baseTemplate: any[] = chosenTemplate
      ? chosenTemplate.template
      : createDefaultTemplate();

    const pages: any[] = [];
    const rows = pendingSheetData.rows;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let imageId = chosenTemplate?.imageId;
      let imgW = chosenTemplate?.width || 1080;
      let imgH = chosenTemplate?.height || 1920;

      // Plain white background
      if (!imageId) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1920;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, 1080, 1920);
        }
        const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
        const stored = await storeImageFile(blob);
        imageId = stored.imageId;
      }

      const values: Record<string, string> = {};
      baseTemplate.forEach((box) => {
        const matchingCol = pendingSheetData.headers.find(
          (h) => h.toLowerCase() === box.fieldLabel.toLowerCase()
        ) || pendingSheetData.headers[0];
        values[box.fieldLabel] = row[matchingCol] || '';
      });

      pages.push({
        id: `page_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        imageId,
        name: `Design ${i + 1}`,
        width: imgW,
        height: imgH,
        values,
        textBoxes: JSON.parse(JSON.stringify(baseTemplate)),
      });
    }

    const newProject: Project = {
      id: `proj_sheet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: pendingSheetData.filename,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      template: baseTemplate,
      pages,
      lastSpreadsheet: {
        filename: pendingSheetData.filename,
        headers: pendingSheetData.headers,
        rows: pendingSheetData.rows,
        mappings: pendingSheetData.headers.reduce((acc, h) => ({ ...acc, [h]: h }), {}),
      },
    };

    await saveProject(newProject);
    setIsTemplateSelectorOpen(false);
    setPendingSheetData(null);
    setLoading(false);
    onOpenProject(newProject.id);
  };

  // 3-Bar Menu Actions
  const handleSaveProjectAsTemplate = async (p: Project) => {
    setActiveMenuProjectId(null);
    if (p.pages.length === 0) {
      showToast('Project has no design pages to save as template.');
      return;
    }
    const firstPage = p.pages[0];
    const newTpl: SavedTemplate = {
      id: `tpl_saved_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `${p.name} Template`,
      createdAt: Date.now(),
      imageId: firstPage.imageId,
      width: firstPage.width,
      height: firstPage.height,
      template: firstPage.textBoxes && firstPage.textBoxes.length > 0 ? firstPage.textBoxes : p.template,
    };

    try {
      await saveSavedTemplate(newTpl);
      const list = await getAllSavedTemplates();
      setSavedTemplatesList(list);
      const breakdown = await calculateExactStorageBreakdown();
      setStorageBreakdown(breakdown);
      showToast('Saved as reusable template!');
    } catch (err) {
      console.error('Error saving template:', err);
      showToast('Failed to save template.');
    }
  };

  const handleRemoveFromTemplate = async (p: Project) => {
    setActiveMenuProjectId(null);
    const matchingTpl = savedTemplatesList.find(
      (t) =>
        t.name === `${p.name} Template` ||
        (p.pages.length > 0 && t.imageId === p.pages[0].imageId)
    );
    if (!matchingTpl) {
      showToast('This project is not currently saved as a template.');
      return;
    }
    try {
      await deleteSavedTemplate(matchingTpl.id);
      const updatedList = await getAllSavedTemplates();
      setSavedTemplatesList(updatedList);
      const breakdown = await calculateExactStorageBreakdown();
      setStorageBreakdown(breakdown);
      showToast('Removed template from saved templates.');
    } catch (err) {
      console.error('Error removing template:', err);
      showToast('Failed to remove template.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject(projectToDelete.id);
      setProjectToDelete(null);
      await loadData();
      showToast('Project deleted and storage freed.');
    } catch (err) {
      console.error('Error deleting project:', err);
      showToast('Failed to delete project.');
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-[100dvh] bg-[#E5B224] text-[#0B0B0F] flex flex-col font-sans select-none pb-12">
      {/* 1. BLACK HEADER (IMG_1495 (2).pdf Page 1) */}
      <header className="bg-black text-white px-4 sm:px-6 py-4 flex flex-col gap-3 shadow-md">
        <div className="flex items-center justify-between">
          <h1 className="font-sans font-black text-base sm:text-lg tracking-wider text-white uppercase">
            LITDOM BATCH STUDIOS
          </h1>
          <div className="flex items-center gap-3 text-white/80">
            <button className="p-1 hover:text-white transition-colors" title="Notifications">
              <Bell className="w-5 h-5" />
            </button>
            <button className="p-1 hover:text-white transition-colors" title="Settings">
              <Settings className="w-5 h-5" />
            </button>
            <button className="p-1 hover:text-white transition-colors" title="Profile">
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar in Header (Pill shaped, yellow background) */}
        <div className="relative w-full max-w-md mx-auto">
          <input
            type="text"
            placeholder="Search here ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#F0BC28] text-black placeholder-black/60 font-medium text-xs sm:text-sm px-4 py-2.5 rounded-full pr-10 focus:outline-none shadow-inner"
          />
          <Search className="w-4 h-4 text-black absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </header>

      {/* Main Body with Golden-Yellow Canvas Background */}
      <main className="max-w-xl mx-auto w-full px-4 sm:px-6 pt-5 flex flex-col gap-5">
        {/* Toast */}
        {feedbackToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#16161D] text-[#FFF8E7] border border-[#D4AF37] px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
            <Check className="w-4 h-4 text-[#D4AF37]" />
            <span>{feedbackToast}</span>
          </div>
        )}

        {/* 2. CREATE A PROJECT SECTION */}
        <section className="bg-black/90 backdrop-blur-md rounded-3xl p-5 text-white shadow-xl flex flex-col gap-4">
          <div className="bg-[#B88E18]/80 text-white font-bold text-sm px-4 py-1.5 rounded-2xl w-fit shadow-sm">
            Create a Project
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Card 1: Document (Upload DOCX) */}
            <button
              onClick={() => setIsDocxModalOpen(true)}
              className="bg-[#0B0B0F] hover:bg-[#1C1C24] border border-white/10 hover:border-[#D4AF37] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 transition-all min-h-[110px] text-center group active:scale-95"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-400 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-white leading-tight">
                Upload DOCX
              </span>
              <span className="text-[10px] text-white/50 -mt-1">Document</span>
            </button>

            {/* Card 2: Images (Upload Images) */}
            <button
              onClick={() => imageInputRef.current?.click()}
              className="bg-[#0B0B0F] hover:bg-[#1C1C24] border border-white/10 hover:border-[#D4AF37] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 transition-all min-h-[110px] text-center group active:scale-95"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-white leading-tight">
                Upload Images
              </span>
              <span className="text-[10px] text-white/50 -mt-1">Images</span>
            </button>

            {/* Card 3: Sheet (Upload Sheet) */}
            <button
              onClick={() => sheetInputRef.current?.click()}
              className="bg-[#0B0B0F] hover:bg-[#1C1C24] border border-white/10 hover:border-[#D4AF37] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 transition-all min-h-[110px] text-center group active:scale-95"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-400 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-white leading-tight">
                Upload Sheet
              </span>
              <span className="text-[10px] text-white/50 -mt-1">Sheet</span>
            </button>
          </div>
        </section>

        {/* Hidden File Inputs for Images & Sheets */}
        <input
          type="file"
          ref={imageInputRef}
          multiple
          accept="image/*"
          onChange={handleImagesSelected}
          className="hidden"
        />
        <input
          type="file"
          ref={sheetInputRef}
          accept=".xlsx,.csv"
          onChange={handleSheetSelected}
          className="hidden"
        />

        {/* 3. YOUR PROJECTS SECTION */}
        <section className="bg-black/90 backdrop-blur-md rounded-3xl p-5 text-white shadow-xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="bg-[#B88E18]/80 text-white font-bold text-sm px-4 py-1.5 rounded-2xl w-fit shadow-sm">
              Your Projects
            </div>
            <span className="text-xs text-white/50">
              {filteredProjects.length} project{filteredProjects.length === 1 ? '' : 's'}
            </span>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="py-8 text-center text-white/60 text-xs">
              {searchQuery ? 'No matching projects found.' : 'No projects yet. Upload a DOCX, Images, or Spreadsheet above!'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredProjects.map((p) => {
                const thumb = projectThumbnails[p.id];
                const isMenuOpen = activeMenuProjectId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`relative bg-[#16161D] border border-white/10 rounded-2xl flex flex-col group hover:border-[#D4AF37] transition-all shadow-md ${
                      isMenuOpen ? 'z-30' : 'z-10'
                    }`}
                  >
                    {/* Project Card Header: Folder icon on left, 3-bar menu on right */}
                    <div className="p-2.5 flex items-center justify-between bg-black/40 rounded-t-2xl z-10">
                      <Folder className="w-4 h-4 text-[#D4AF37]" />
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuProjectId(isMenuOpen ? null : p.id);
                          }}
                          className="p-1 hover:text-[#D4AF37] text-white/70 rounded transition-colors"
                          title="Project actions"
                        >
                          <Menu className="w-4 h-4" />
                        </button>

                        {/* 3-Bar Dropdown Menu: SVG icons and unclipped floating positioning */}
                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-8 z-50 w-52 bg-[#1E1E26] border border-[#D4AF37]/50 rounded-2xl shadow-2xl py-1.5 text-xs text-[#FFF8E7] animate-in fade-in zoom-in-95 duration-150"
                          >
                            <button
                              onClick={() => {
                                setActiveMenuProjectId(null);
                                onOpenProject(p.id);
                              }}
                              className="w-full text-left px-3.5 py-2 hover:bg-[#2A2A36] flex items-center gap-2.5 transition-colors"
                            >
                              <Edit3 className="w-4 h-4 text-[#D4AF37]" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => {
                                setActiveMenuProjectId(null);
                                onOpenProject(p.id);
                              }}
                              className="w-full text-left px-3.5 py-2 hover:bg-[#2A2A36] flex items-center gap-2.5 transition-colors"
                            >
                              <Download className="w-4 h-4 text-blue-400" />
                              <span>Download</span>
                            </button>
                            <button
                              onClick={() => handleSaveProjectAsTemplate(p)}
                              className="w-full text-left px-3.5 py-2 hover:bg-[#2A2A36] flex items-center gap-2.5 transition-colors"
                            >
                              <BookmarkPlus className="w-4 h-4 text-emerald-400" />
                              <span>Save as Template</span>
                            </button>
                            <button
                              onClick={() => handleRemoveFromTemplate(p)}
                              className="w-full text-left px-3.5 py-2 hover:bg-[#2A2A36] flex items-center gap-2.5 transition-colors"
                            >
                              <BookmarkX className="w-4 h-4 text-amber-400" />
                              <span>Remove from Template</span>
                            </button>
                            <div className="h-px bg-white/10 my-1" />
                            <button
                              onClick={() => {
                                setActiveMenuProjectId(null);
                                setProjectToDelete(p);
                              }}
                              className="w-full text-left px-3.5 py-2 text-red-400 hover:bg-red-950/40 flex items-center gap-2.5 transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Preview Thumbnail Area */}
                    <div
                      onClick={() => onOpenProject(p.id)}
                      className="cursor-pointer aspect-[3/4] bg-black/60 flex items-center justify-center overflow-hidden relative"
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="text-center p-2 text-white/30 text-[10px]">
                          No preview
                        </div>
                      )}
                    </div>

                    {/* Project Title underneath */}
                    <div
                      onClick={() => onOpenProject(p.id)}
                      className="p-2.5 text-center cursor-pointer bg-black/50 rounded-b-2xl"
                    >
                      <h4 className="text-xs font-semibold text-white truncate" title={p.name}>
                        {p.name}
                      </h4>
                      <p className="text-[10px] text-white/50 mt-0.5">
                        {p.pages.length} design{p.pages.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 4. STORAGE SECTION (IMG_1495 (2).pdf Page 1 & BUG-001 / ENHANCEMENT-001) */}
        <section className="bg-black/90 backdrop-blur-md rounded-3xl p-5 text-white shadow-xl flex flex-col gap-3">
          <div className="bg-[#B88E18]/80 text-white font-bold text-sm px-4 py-1.5 rounded-2xl w-fit shadow-sm">
            Storage
          </div>

          <div className="flex items-center justify-between text-xs sm:text-sm font-bold pt-1">
            <div>
              <span className="text-white/80 font-normal">Used: </span>
              <span className="text-red-500 font-mono text-sm sm:text-base">
                {formatBytes(storageBreakdown.totalBytes)}
              </span>
            </div>
            <div>
              <span className="text-white/80 font-normal">Available: </span>
              <span className="text-emerald-400 font-mono text-sm sm:text-base">
                {formatBytes(Math.max(0, APP_STORAGE_QUOTA_BYTES - storageBreakdown.totalBytes))}
              </span>
            </div>
          </div>

          {/* Progress Bar with Yellow / Green Indicator */}
          <div className="w-full h-3 bg-[#1C1C24] rounded-full overflow-hidden border border-white/10 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-yellow-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(storageBreakdown.totalBytes > 0 ? 2 : 0, Math.min(100, (storageBreakdown.totalBytes / APP_STORAGE_QUOTA_BYTES) * 100))}%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-white/50 pt-0.5">
            <span>Dedicated App Storage (2.00 GB Quota)</span>
            <span>{((storageBreakdown.totalBytes / APP_STORAGE_QUOTA_BYTES) * 100).toFixed(1)}% used</span>
          </div>
        </section>
      </main>

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#121217] border border-red-500/50 rounded-3xl p-6 shadow-2xl text-[#FFF8E7] flex flex-col gap-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-base">Delete Project?</h3>
            </div>
            <p className="text-xs text-[#FFF8E7]/70">
              Are you sure you want to delete <span className="font-semibold text-white">"{projectToDelete.name}"</span>?
              All associated background images and design data will be permanently wiped from browser storage.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-lg shadow-red-600/30"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Workflow Multi-Step Modal */}
      <DocxWorkflowModal
        isOpen={isDocxModalOpen}
        onClose={() => setIsDocxModalOpen(false)}
        onProjectCreated={(id) => onOpenProject(id)}
      />

      {/* Spreadsheet Workflow: Template Selector Dialog */}
      {isTemplateSelectorOpen && pendingSheetData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#121217] border border-[#D4AF37] rounded-3xl p-6 shadow-2xl text-[#FFF8E7] flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#262632] pb-3">
              <h3 className="font-bold text-base text-[#FFF8E7]">
                Select Template for Spreadsheet
              </h3>
              <button
                onClick={() => setIsTemplateSelectorOpen(false)}
                className="text-white/50 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#FFF8E7]/60">
              "{pendingSheetData.filename}" contains {pendingSheetData.rows.length} row(s) and columns:{' '}
              <span className="text-[#D4AF37]">{pendingSheetData.headers.join(', ')}</span>.
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              <button
                onClick={() => handleApplyTemplateToSpreadsheet(undefined)}
                className="w-full text-left p-3 rounded-2xl bg-[#1C1C24] hover:bg-[#262632] border border-white/10 hover:border-[#D4AF37] transition-all flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-white">
                    Plain-White Clean Document
                  </div>
                  <div className="text-[10px] text-white/50">
                    Auto-creates text boxes on high-resolution white pages
                  </div>
                </div>
                <span className="text-xs text-[#D4AF37]">Select</span>
              </button>

              {savedTemplatesList.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleApplyTemplateToSpreadsheet(tpl)}
                  className="w-full text-left p-3 rounded-2xl bg-[#1C1C24] hover:bg-[#262632] border border-white/10 hover:border-[#D4AF37] transition-all flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-white">{tpl.name}</div>
                    <div className="text-[10px] text-white/50">
                      {tpl.template.length} placeholder fields
                    </div>
                  </div>
                  <span className="text-xs text-[#D4AF37]">Select</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
