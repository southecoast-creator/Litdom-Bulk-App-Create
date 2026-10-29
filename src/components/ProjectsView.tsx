/**
 * Litdom Batch Studio - Stage 1: Projects Management & Storage Cleanup
 * In-app project deletion, storage purging, backup export/import, and quota monitoring.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  FolderPlus,
  Trash2,
  Copy,
  Edit2,
  HardDrive,
  Download,
  UploadCloud,
  Check,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  FolderKanban,
  X,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { Project } from '../types';
import {
  getAllProjects,
  saveProject,
  deleteProject,
  clearAllProjects,
  getStorageEstimate,
  formatBytes,
  exportProjectBackup,
  importProjectBackup,
} from '../utils/db';

interface ProjectsViewProps {
  currentProject: Project | null;
  onSelectProject: (project: Project) => void;
  onLoadSample: () => void;
  onLoadMinimalTest?: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  currentProject,
  onSelectProject,
  onLoadSample,
  onLoadMinimalTest,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [storageInfo, setStorageInfo] = useState<{
    usedBytes: number;
    quotaBytes: number;
    percentage: number;
  }>({ usedBytes: 0, quotaBytes: 0, percentage: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // In-app deletion confirmation state (replaces window.confirm)
  const [projectPendingDelete, setProjectPendingDelete] = useState<Project | null>(null);
  const [isStorageManagerOpen, setIsStorageManagerOpen] = useState(false);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const list = await getAllProjects();
      setProjects(list);
      const estimate = await getStorageEstimate();
      setStorageInfo(estimate);
    } catch (err: any) {
      setErrorMsg(`Failed to load projects: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim() || 'Untitled Project';
    const newProj: Project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      defaultFontFamily: 'Plus Jakarta Sans',
      defaultColor: '#FFF8E7',
      pages: [],
      customFonts: [],
    };

    try {
      await saveProject(newProj);
      setNewProjectName('');
      setIsCreating(false);
      await loadData();
      onSelectProject(newProj);
      showToast(`Created project "${newProj.name}"`);
    } catch (err: any) {
      setErrorMsg(`Storage error: ${err.message}`);
    }
  };

  const handleRenameProject = async (proj: Project) => {
    if (!editingName.trim()) return;
    const updated = { ...proj, name: editingName.trim(), updatedAt: Date.now() };
    await saveProject(updated);
    setEditingProjectId(null);
    await loadData();
    if (currentProject?.id === proj.id) {
      onSelectProject(updated);
    }
    showToast(`Renamed project to "${updated.name}"`);
  };

  const handleDuplicateProject = async (proj: Project) => {
    const duplicated: Project = {
      ...proj,
      id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `${proj.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pages: JSON.parse(JSON.stringify(proj.pages)),
    };
    await saveProject(duplicated);
    await loadData();
    showToast(`Duplicated "${proj.name}"`);
  };

  // Safe In-App Delete without window.confirm
  const confirmDelete = async () => {
    if (!projectPendingDelete) return;
    const { id, name } = projectPendingDelete;
    try {
      await deleteProject(id);
      setProjectPendingDelete(null);
      await loadData();
      showToast(`Deleted "${name}" and freed up storage space.`);
    } catch (err: any) {
      setErrorMsg(`Failed to delete project: ${err.message}`);
    }
  };

  // Safe In-App Clear All Projects & Free Up All Storage
  const handlePurgeAllProjects = async () => {
    try {
      await clearAllProjects();
      setIsConfirmingClearAll(false);
      setIsStorageManagerOpen(false);
      await loadData();
      showToast('All projects deleted. Local storage has been completely freed!');
    } catch (err: any) {
      setErrorMsg(`Failed to purge storage: ${err.message}`);
    }
  };

  const handleBackupUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const restored = await importProjectBackup(file);
      await loadData();
      onSelectProject(restored);
      showToast(`Project "${restored.name}" successfully restored!`);
    } catch (err: any) {
      setErrorMsg(`Restore failed: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header & Storage Widget */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#212128]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#FFF8E7]">Projects Studio</h2>
          <p className="text-xs md:text-sm text-[#F4D58D]/70 mt-1">
            Manage your design templates, delete old files, and free up browser storage space.
          </p>
        </div>

        {/* Local Storage Indicator & Cleanup Button */}
        <div className="bg-[#17171C] border border-[#212128] rounded-xl p-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-[#D4AF37]" />
            <div className="text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#FFF8E7]/70">Storage:</span>
                <span className="font-semibold text-[#FFF8E7] font-mono">
                  {formatBytes(storageInfo.usedBytes)} / {formatBytes(storageInfo.quotaBytes)}
                </span>
              </div>
              <div className="w-36 bg-[#0B0B0F] h-1.5 rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full transition-all ${
                    storageInfo.percentage > 85 ? 'bg-red-500' : 'bg-[#D4AF37]'
                  }`}
                  style={{ width: `${Math.max(2, storageInfo.percentage)}%` }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsStorageManagerOpen(true)}
            className="px-3 py-1.5 bg-[#212128] hover:bg-[#2a2a35] text-[#D4AF37] border border-[#8C7625]/40 hover:border-[#D4AF37] rounded-lg text-xs font-semibold transition-all active:scale-95"
            title="Manage storage space and delete projects"
          >
            Free Up Space
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className="p-3 bg-emerald-950/50 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-950/40 border border-red-800 text-red-200 rounded-lg text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-300 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-semibold text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create New Project</span>
            </button>
          ) : (
            <form onSubmit={handleCreateProject} className="flex items-center gap-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. Autumn Catalogue 2026"
                autoFocus
                className="bg-[#17171C] border border-[#D4AF37] text-[#FFF8E7] text-xs px-3 py-2 rounded-lg focus:outline-none w-56 sm:w-72"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-[#D4AF37] text-[#0B0B0F] rounded-lg text-xs font-semibold hover:bg-[#F4D58D]"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-2 bg-[#212128] text-[#FFF8E7]/70 rounded-lg text-xs hover:text-[#FFF8E7]"
              >
                Cancel
              </button>
            </form>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2.5 rounded-lg bg-[#17171C] border border-[#212128] hover:border-[#8C7625] text-[#FFF8E7]/90 text-xs font-medium flex items-center gap-2 transition-all active:scale-95"
          >
            <UploadCloud className="w-4 h-4 text-[#D4AF37]" />
            <span>Restore Backup</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.litdom"
            onChange={handleBackupUpload}
            className="hidden"
          />
        </div>

        <div className="flex items-center gap-2">
          {onLoadMinimalTest && (
            <button
              onClick={onLoadMinimalTest}
              className="px-3.5 py-2.5 rounded-lg bg-[#17171C] border border-[#D4AF37]/50 hover:border-[#D4AF37] text-[#D4AF37] text-xs font-semibold flex items-center gap-2 transition-all active:scale-95"
              title="Load 1 page with 4 labelled boxes (TITLE, SUBTITLE, PARAGRAPH 1, CTA)"
            >
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <span>1-Page 4-Boxes Test</span>
            </button>
          )}

          <button
            onClick={onLoadSample}
            className="px-3.5 py-2.5 rounded-lg bg-[#17171C] border border-[#8C7625]/50 hover:border-[#D4AF37] text-[#F4D58D] text-xs font-medium flex items-center gap-2 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            <span>Load 2-Layout Suite</span>
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="py-16 text-center text-xs text-[#FFF8E7]/50 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#D4AF37]" />
          <span>Loading projects from local storage...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="py-16 px-6 text-center bg-[#17171C]/50 border border-dashed border-[#212128] rounded-2xl max-w-lg mx-auto space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#212128] text-[#D4AF37] flex items-center justify-center mx-auto">
            <FolderPlus className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#FFF8E7]">Storage is Clear — No Projects</h3>
            <p className="text-xs text-[#F4D58D]/60 mt-1 max-w-sm mx-auto">
              Create a new project or load the minimal 1-page 4-box test to start editing immediately.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-[#D4AF37] text-[#0B0B0F] font-semibold text-xs rounded-lg hover:bg-[#F4D58D] transition-all"
            >
              Create New Project
            </button>
            {onLoadMinimalTest && (
              <button
                onClick={onLoadMinimalTest}
                className="px-4 py-2 bg-[#212128] text-[#D4AF37] font-semibold text-xs rounded-lg hover:bg-[#2a2a35] transition-all border border-[#D4AF37]/40"
              >
                Load Minimal Test
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => {
            const isSelected = currentProject?.id === proj.id;
            const coverImage = proj.pages[0]?.imageUrl;

            return (
              <div
                key={proj.id}
                className={`bg-[#17171C] border rounded-2xl overflow-hidden transition-all duration-200 flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#D4AF37] shadow-lg shadow-[#D4AF37]/10 ring-1 ring-[#D4AF37]'
                    : 'border-[#212128] hover:border-[#8C7625]/60'
                }`}
              >
                {/* Thumbnail Preview Banner */}
                <div
                  onClick={() => onSelectProject(proj)}
                  className="h-32 bg-[#0B0B0F] relative cursor-pointer overflow-hidden group flex items-center justify-center"
                >
                  {coverImage ? (
                    <img
                      src={coverImage}
                      alt={proj.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <div className="w-8 h-8 rounded-lg bg-[#212128] text-[#8C7625] flex items-center justify-center mx-auto mb-2">
                        <FolderKanban className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] text-[#FFF8E7]/40">No backgrounds uploaded</span>
                    </div>
                  )}

                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#0B0B0F]/80 backdrop-blur-sm border border-[#212128] text-[10px] font-semibold text-[#D4AF37]">
                    {proj.pages.length} {proj.pages.length === 1 ? 'Page' : 'Pages'}
                  </div>

                  {isSelected && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#D4AF37] text-[#0B0B0F] text-[10px] font-bold flex items-center gap-1 shadow-sm">
                      <Check className="w-3 h-3" />
                      <span>ACTIVE</span>
                    </div>
                  )}
                </div>

                {/* Details Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    {editingProjectId === proj.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="bg-[#0B0B0F] border border-[#D4AF37] text-xs text-[#FFF8E7] px-2 py-1 rounded w-full"
                          autoFocus
                        />
                        <button
                          onClick={() => handleRenameProject(proj)}
                          className="p-1 text-[#D4AF37] hover:text-[#FFF8E7]"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <h4
                          onClick={() => onSelectProject(proj)}
                          className="font-semibold text-sm text-[#FFF8E7] hover:text-[#D4AF37] cursor-pointer line-clamp-1"
                        >
                          {proj.name}
                        </h4>
                        <button
                          onClick={() => {
                            setEditingProjectId(proj.id);
                            setEditingName(proj.name);
                          }}
                          className="text-[#FFF8E7]/40 hover:text-[#D4AF37] transition-colors p-1"
                          title="Rename project"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="text-[11px] text-[#FFF8E7]/50 mt-1 flex items-center gap-2">
                      <span>Updated: {new Date(proj.updatedAt).toLocaleDateString()}</span>
                      {proj.lastSpreadsheetName && (
                        <>
                          <span>•</span>
                          <span className="text-[#F4D58D] truncate max-w-[120px]">
                            {proj.lastSpreadsheetName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="pt-2 border-t border-[#212128] flex items-center justify-between gap-1">
                    <button
                      onClick={() => onSelectProject(proj)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isSelected
                          ? 'bg-[#212128] text-[#D4AF37]'
                          : 'bg-[#D4AF37] text-[#0B0B0F] hover:bg-[#F4D58D]'
                      }`}
                    >
                      <span>{isSelected ? 'Open Studio' : 'Select'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => exportProjectBackup(proj)}
                        className="p-2 text-[#FFF8E7]/60 hover:text-[#D4AF37] rounded-lg hover:bg-[#212128] transition-colors"
                        title="Download JSON backup"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDuplicateProject(proj)}
                        className="p-2 text-[#FFF8E7]/60 hover:text-[#D4AF37] rounded-lg hover:bg-[#212128] transition-colors"
                        title="Duplicate project"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {/* IN-APP DELETE BUTTON */}
                      <button
                        onClick={() => setProjectPendingDelete(proj)}
                        className="p-2 text-[#FFF8E7]/60 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
                        title="Delete project & free storage"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: In-App Single Project Deletion Confirmation */}
      {projectPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171C] border border-[#212128] rounded-2xl max-w-md w-full p-6 text-xs text-[#FFF8E7] space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#212128]">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <Trash2 className="w-4 h-4" />
                <span>Delete Project & Free Up Space?</span>
              </div>
              <button
                onClick={() => setProjectPendingDelete(null)}
                className="text-stone-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-[#FFF8E7]/80 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-white">"{projectPendingDelete.name}"</strong>?
            </p>
            <p className="text-[11px] text-[#8C7625]">
              All background images, text boxes, and locally stored assets for this project will be removed from your browser to free up storage space.
            </p>

            <div className="pt-3 border-t border-[#212128] flex items-center justify-end gap-2">
              <button
                onClick={() => setProjectPendingDelete(null)}
                className="px-4 py-2 bg-[#212128] hover:bg-[#2a2a35] text-[#FFF8E7] rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete & Free Up Space</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Storage Manager & Bulk Cleanup Modal */}
      {isStorageManagerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171C] border border-[#212128] rounded-2xl max-w-lg w-full p-6 text-xs text-[#FFF8E7] space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#212128]">
              <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-sm">
                <HardDrive className="w-4 h-4" />
                <span>Storage Manager & Space Cleanup</span>
              </div>
              <button
                onClick={() => {
                  setIsStorageManagerOpen(false);
                  setIsConfirmingClearAll(false);
                }}
                className="text-stone-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Storage Usage Summary */}
            <div className="p-3.5 bg-[#0B0B0F] border border-[#212128] rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#FFF8E7]/70">Browser Storage Used:</span>
                <span className="font-mono font-bold text-[#D4AF37]">
                  {formatBytes(storageInfo.usedBytes)} of {formatBytes(storageInfo.quotaBytes)}
                </span>
              </div>
              <div className="w-full bg-[#17171C] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] h-full transition-all"
                  style={{ width: `${Math.max(2, storageInfo.percentage)}%` }}
                />
              </div>
              <div className="text-[10px] text-[#8C7625]">
                {projects.length} project(s) currently stored in browser IndexedDB.
              </div>
            </div>

            {/* Project List with individual delete */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              <span className="text-[11px] font-semibold text-[#8C7625] block">
                Stored Projects:
              </span>
              {projects.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-[#FFF8E7]/50">
                  No projects in storage. Storage is clear!
                </div>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 bg-[#0B0B0F] border border-[#212128] rounded-xl flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-[#FFF8E7] truncate">{p.name}</div>
                      <div className="text-[10px] text-[#8C7625]">
                        {p.pages.length} page(s) · {new Date(p.updatedAt).toLocaleDateString()}
                      </div>
                    </div>

                    <button
                      onClick={() => setProjectPendingDelete(p)}
                      className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-200 rounded text-xs font-semibold flex items-center gap-1 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Clear All Option */}
            {projects.length > 0 && (
              <div className="pt-3 border-t border-[#212128]">
                {!isConfirmingClearAll ? (
                  <button
                    onClick={() => setIsConfirmingClearAll(true)}
                    className="w-full py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear All Projects & Free All Storage</span>
                  </button>
                ) : (
                  <div className="p-3 bg-red-950/60 border border-red-700 rounded-xl space-y-2">
                    <p className="text-xs font-bold text-red-200">
                      Confirm Deletion of ALL {projects.length} Projects?
                    </p>
                    <p className="text-[10px] text-red-300">
                      This action cannot be undone. All project files in your browser will be purged.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => setIsConfirmingClearAll(false)}
                        className="px-3 py-1 bg-[#212128] text-[#FFF8E7] rounded text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handlePurgeAllProjects}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold"
                      >
                        Yes, Purge Everything
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
