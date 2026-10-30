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
} from 'lucide-react';
import { Project } from '../types';
import {
  getAllProjects,
  saveProject,
  deleteProject,
  createDefaultTemplate,
  getStorageEstimate,
  formatBytes,
} from '../utils/db';

interface DashboardProps {
  onOpenProject: (projectId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    usedBytes: number;
    quotaBytes: number;
    percentage: number;
  }>({ usedBytes: 0, quotaBytes: 0, percentage: 0 });
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const loadDashboardData = async () => {
    try {
      const [list, storage] = await Promise.all([
        getAllProjects(),
        getStorageEstimate(),
      ]);
      setProjects(list);
      setStorageInfo(storage);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
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
      setIsCreating(false);
      // Immediately open the newly created workspace
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

        {/* Storage Counter */}
        <div className="flex items-center gap-2 bg-[#17171C] border border-[#262630] px-3 py-1.5 rounded-xl text-xs">
          <HardDrive className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span className="text-[#FFF8E7]/70 hidden sm:inline">Storage:</span>
          <span className="font-mono text-[#D4AF37] font-semibold">
            {formatBytes(storageInfo.usedBytes)} used
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Create Project Hero Card */}
        <div className="bg-gradient-to-r from-[#17171C] via-[#1A1A22] to-[#17171C] border border-[#2A2A36] rounded-2xl p-5 sm:p-6 shadow-2xl">
          <div className="max-w-xl">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-[#FFF8E7] mb-1">
              Create New Design Batch
            </h2>
            <p className="text-xs sm:text-sm text-[#FFF8E7]/60 mb-4">
              Upload your backgrounds, attach a CSV or Excel spreadsheet, and generate dozens of pixel-perfect designs in seconds.
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

                      <div className="flex items-center gap-3 text-xs text-[#FFF8E7]/60 mb-4">
                        <span className="flex items-center gap-1 font-mono">
                          <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
                          {designCount} {designCount === 1 ? 'design' : 'designs'}
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

      {/* Delete Confirmation Modal */}
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
    </div>
  );
};
