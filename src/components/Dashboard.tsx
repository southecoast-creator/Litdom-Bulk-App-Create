/**
 * Litdom Batch Studio - Screen 1: Dashboard
 * Create project (opens workspace immediately), open existing, delete with in-app confirm,
 * and display real-time storage quota.
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  FolderOpen,
  Trash2,
  HardDrive,
  Layers,
  Sparkles,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  Type,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { Project, StorageBreakdown } from '../types';
import {
  getAllProjects,
  saveProject,
  deleteProject,
  createDefaultTemplate,
  getStorageEstimate,
  calculateExactStorageBreakdown,
  cleanupOrphanedImages,
  eraseEverything,
  formatBytes,
} from '../utils/db';

interface DashboardProps {
  onOpenProject: (projectId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null);

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
  }>({ usedBytes: 0, quotaBytes: 0, percentage: 0 });

  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [eraseStep, setEraseStep] = useState<0 | 1 | 2>(0);
  const [isErasing, setIsErasing] = useState(false);

  const loadDashboardData = async () => {
    try {
      const [list, breakdown, estimate] = await Promise.all([
        getAllProjects(),
        calculateExactStorageBreakdown(),
        getStorageEstimate(),
      ]);
      setProjects(list);
      setStorageBreakdown(breakdown);
      setStorageEstimate(estimate);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    // Silently clean up orphaned images on app mount
    cleanupOrphanedImages().catch(() => {});
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim() || 'Untitled Project';
    const newProj: Project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      template: createDefaultTemplate(),
      pages: [],
    };

    try {
      await saveProject(newProj);
      setNewProjectName('');
      onOpenProject(newProj.id);
    } catch (err) {
      console.error('Error creating project:', err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject(projectToDelete.id);
      setProjectToDelete(null);
      await loadDashboardData();
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  const handleManualCleanup = async () => {
    setIsCleaning(true);
    setCleanFeedback(null);
    try {
      const res = await cleanupOrphanedImages();
      await loadDashboardData();
      if (res.deletedCount > 0) {
        setCleanFeedback(`Cleaned up ${res.deletedCount} orphaned image(s), freed ${formatBytes(res.freedBytes)}.`);
      } else {
        setCleanFeedback('Storage is fully optimized. No orphaned assets found.');
      }
      setTimeout(() => setCleanFeedback(null), 5000);
    } catch (err) {
      console.error('Cleanup error:', err);
      setCleanFeedback('Failed to perform cleanup.');
    } finally {
      setIsCleaning(false);
    }
  };

  const handlePerformEraseEverything = async () => {
    setIsErasing(true);
    try {
      await eraseEverything();
    } catch (err) {
      console.error('Erase error:', err);
      setIsErasing(false);
      setEraseStep(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0F] text-[#FFF8E7] flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-[#212128] bg-[#121217]/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D4AF37] to-[#8C7625] flex items-center justify-center shadow-lg shadow-[#D4AF37]/20">
            <span className="text-[#0B0B0F] font-bold font-serif text-sm tracking-widest">L</span>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-serif font-bold tracking-tight text-[#FFF8E7]">
              Litdom Batch Studio
            </h1>
            <p className="text-[11px] text-[#D4AF37]/80 font-medium">
              High-Speed Spreadsheet Design Population
            </p>
          </div>
        </div>

        {/* Top Storage Indicator */}
        <div className="flex items-center gap-2 bg-[#17171C] border border-[#262632] px-3 py-1.5 rounded-xl text-xs">
          <HardDrive className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span className="text-[#FFF8E7]/70 hidden sm:inline">Your Data:</span>
          <span className="font-mono text-[#D4AF37] font-semibold">
            {formatBytes(storageBreakdown.totalBytes)}
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Storage Quota Warning Banner */}
        {storageEstimate.percentage >= 80 && (
          <div className="bg-red-500/15 border border-red-500/40 rounded-2xl p-4 flex items-center justify-between gap-3 text-red-200 text-xs">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <span>
                <strong>Warning:</strong> Browser storage is at {storageEstimate.percentage}% of quota ({formatBytes(storageEstimate.usedBytes)} of {formatBytes(storageEstimate.quotaBytes)}). Consider deleting older projects or cleaning up unused assets.
              </span>
            </div>
            <button
              onClick={handleManualCleanup}
              disabled={isCleaning}
              className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 px-3 py-1.5 rounded-xl font-bold whitespace-nowrap min-h-[36px]"
            >
              Clean Up Now
            </button>
          </div>
        )}

        {/* Create Project Hero Card */}
        <div className="bg-gradient-to-r from-[#17171C] via-[#1A1A22] to-[#17171C] border border-[#2A2A36] rounded-2xl p-5 sm:p-6 shadow-2xl">
          <div className="max-w-xl">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-[#FFF8E7] mb-1">
              Create New Design Batch
            </h2>
            <p className="text-xs sm:text-sm text-[#FFF8E7]/60 mb-4">
              Upload backgrounds, map CSV or Excel fields, customize fonts & styles, and export pixel-perfect batches in seconds.
            </p>

            <form onSubmit={handleCreateProject} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                placeholder="Project Name (e.g., Summer Luxury Drop)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="flex-1 bg-[#0B0B0F] border border-[#333342] focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm text-[#FFF8E7] placeholder-[#FFF8E7]/30 focus:outline-none transition-colors"
                autoFocus
              />
              <button
                type="submit"
                className="bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] hover:from-[#F4D58D] hover:to-[#D4AF37] text-[#0B0B0F] font-bold text-sm px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/20 active:scale-[0.98] transition-all min-h-[44px]"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Create & Open</span>
              </button>
            </form>
          </div>
        </div>

        {/* Honest Storage Breakdown Card */}
        <div className="bg-[#121217] border border-[#23232E] rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="text-sm font-semibold text-[#FFF8E7]">
                  Your Storage Breakdown
                </h3>
              </div>
              <p className="text-[11px] text-[#FFF8E7]/50 mt-0.5">
                Exact sum of your stored assets. Reads 0 B when nothing is stored.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleManualCleanup}
                disabled={isCleaning}
                className="bg-[#1C1C24] hover:bg-[#262632] border border-[#2D2D3A] text-xs text-[#FFF8E7] px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors min-h-[36px]"
                title="Remove unreferenced images and old databases"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${isCleaning ? 'animate-spin' : ''}`} />
                <span>{isCleaning ? 'Cleaning…' : 'Clean Up'}</span>
              </button>

              <button
                onClick={() => setEraseStep(1)}
                className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs text-red-300 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors min-h-[36px]"
                title="Wipe all projects and stored data"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Erase Everything</span>
              </button>
            </div>
          </div>

          {cleanFeedback && (
            <div className="p-2.5 bg-[#17171C] border border-[#D4AF37]/40 rounded-xl text-xs text-[#D4AF37] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>{cleanFeedback}</span>
            </div>
          )}

          {/* 4 Metric Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#17171C] border border-[#262632] rounded-xl p-3">
              <div className="text-[10px] uppercase font-mono tracking-wider text-[#FFF8E7]/50 mb-1">
                Designs & Images
              </div>
              <div className="text-base font-bold font-mono text-[#D4AF37]">
                {formatBytes(storageBreakdown.designsBytes)}
              </div>
            </div>

            <div className="bg-[#17171C] border border-[#262632] rounded-xl p-3">
              <div className="text-[10px] uppercase font-mono tracking-wider text-[#FFF8E7]/50 mb-1">
                Custom Fonts
              </div>
              <div className="text-base font-bold font-mono text-[#D4AF37]">
                {formatBytes(storageBreakdown.fontsBytes)}
              </div>
            </div>

            <div className="bg-[#17171C] border border-[#262632] rounded-xl p-3">
              <div className="text-[10px] uppercase font-mono tracking-wider text-[#FFF8E7]/50 mb-1">
                Project Layouts
              </div>
              <div className="text-base font-bold font-mono text-[#D4AF37]">
                {formatBytes(storageBreakdown.projectsBytes)}
              </div>
            </div>

            <div className="bg-[#17171C] border border-[#D4AF37]/30 bg-gradient-to-br from-[#17171C] to-[#21212B] rounded-xl p-3">
              <div className="text-[10px] uppercase font-mono tracking-wider text-[#D4AF37] mb-1">
                Total Used
              </div>
              <div className="text-base font-bold font-mono text-[#FFF8E7]">
                {formatBytes(storageBreakdown.totalBytes)}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-[#FFF8E7]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-1 border-t border-[#1C1C24]">
            <span>
              Browser total (approximate): {formatBytes(storageEstimate.usedBytes)} of {formatBytes(storageEstimate.quotaBytes)} ({storageEstimate.percentage}%)
            </span>
            <span className="text-[10px] italic">
              Browser total includes internal database indices and may update slowly.
            </span>
          </div>
        </div>

        {/* Existing Projects Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#D4AF37]">
              Your Projects ({projects.length})
            </h3>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-36 rounded-2xl bg-[#17171C]/50 animate-pulse border border-[#212128]"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-[#262632] rounded-2xl bg-[#121217]/40 space-y-3">
              <Layers className="w-10 h-10 text-[#D4AF37]/40 mx-auto" />
              <div className="text-sm font-semibold text-[#FFF8E7]/80">No projects yet</div>
              <p className="text-xs text-[#FFF8E7]/50 max-w-sm mx-auto">
                Type a name above and click "Create & Open" to start your first batch.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((proj) => {
                const designCount = proj.pages?.length || 0;
                const projSize = storageBreakdown.projectSizes[proj.id] || 0;
                const formattedDate = new Date(proj.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <div
                    key={proj.id}
                    className="bg-[#17171C] border border-[#262632] hover:border-[#D4AF37]/60 rounded-2xl p-4 flex flex-col justify-between transition-all hover:shadow-xl group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-semibold text-base text-[#FFF8E7] truncate group-hover:text-[#D4AF37] transition-colors">
                          {proj.name}
                        </h4>
                        <button
                          onClick={() => setProjectToDelete(proj)}
                          className="p-1.5 text-[#FFF8E7]/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Delete Project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#FFF8E7]/60 mb-4">
                        <span className="flex items-center gap-1 font-mono">
                          <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
                          {designCount} {designCount === 1 ? 'design' : 'designs'}
                        </span>
                        <span>·</span>
                        <span className="font-mono text-[#D4AF37]/90 font-medium">
                          {formatBytes(projSize)}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#FFF8E7]/40" />
                          {formattedDate}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenProject(proj.id)}
                      className="w-full bg-[#21212A] hover:bg-[#D4AF37] hover:text-[#0B0B0F] text-[#FFF8E7] text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all min-h-[44px]"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>Open Workspace</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Delete Single Project Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171C] border border-[#333342] rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-[#FFF8E7]">Delete Project?</h3>
            </div>
            <p className="text-xs text-[#FFF8E7]/70 leading-relaxed">
              Are you sure you want to delete <span className="text-[#FFF8E7] font-semibold">"{projectToDelete.name}"</span>? All background images and designs will be permanently removed to free up storage space.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#FFF8E7]/70 hover:bg-[#212128] transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 transition-all min-h-[44px]"
              >
                Delete & Free Space
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erase Everything - Confirmation Step 1 */}
      {eraseStep === 1 && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171C] border border-red-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-[#FFF8E7]">Erase All Application Data?</h3>
            </div>
            <p className="text-xs text-[#FFF8E7]/70 leading-relaxed">
              This will permanently wipe all projects, background image files, custom fonts, and offline cache storage from this browser. This cannot be undone.
            </p>
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300">
              Are you sure you want to proceed to the final confirmation?
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEraseStep(0)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#FFF8E7]/70 hover:bg-[#212128] transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => setEraseStep(2)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 transition-all min-h-[44px]"
              >
                Continue to Final Wipe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erase Everything - Final Confirmation Step 2 */}
      {eraseStep === 2 && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171C] border-2 border-red-500 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <ShieldAlert className="w-7 h-7 shrink-0 animate-pulse text-red-500" />
              <div>
                <h3 className="text-base font-bold text-red-400">Final Confirmation: Absolute Wipe</h3>
                <p className="text-[11px] text-[#FFF8E7]/60">Action is non-recoverable</p>
              </div>
            </div>
            <p className="text-xs text-[#FFF8E7]/80 leading-relaxed">
              Confirming will immediately clear IndexedDB, purge cache storage, revoke all active blobs, and reload the application into a fresh zero-byte state.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3">
              <button
                onClick={() => setEraseStep(0)}
                disabled={isErasing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#FFF8E7]/70 hover:bg-[#212128] transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handlePerformEraseEverything}
                disabled={isErasing}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xl shadow-red-600/30 transition-all min-h-[44px] flex items-center gap-2"
              >
                {isErasing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Wiping Storage…</span>
                  </>
                ) : (
                  <span>Yes, Permanently Erase Everything</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
