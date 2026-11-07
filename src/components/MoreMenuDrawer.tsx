/**
 * Litdom Batch Studio - More Menu Drawer
 * Exact visual match to IMG_1495 (2).pdf Pages 19 & 20:
 * - Your Design's Title with inline rename pencil
 * - See all Pages
 * - Branding
 * - Resize Design
 * - Templates
 * - Version History
 * - Show Thumbnails
 * - Add Charts
 * - Add from projects
 * - Delete (red text & trash)
 */

import React, { useState } from 'react';
import {
  X,
  Edit2,
  Grid,
  Sparkles,
  Maximize2,
  Bookmark,
  History,
  Image as ImageIcon,
  BarChart2,
  FolderPlus,
  Trash2,
  Check,
} from 'lucide-react';
import { Project } from '../types';

interface MoreMenuDrawerProps {
  project: Project;
  activePageIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onRenameProject: (newName: string) => void;
  onToggleThumbnails: () => void;
  onDeleteCurrentPage: () => void;
  onOpenTemplates: () => void;
  onOpenDownload: () => void;
}

export const MoreMenuDrawer: React.FC<MoreMenuDrawerProps> = ({
  project,
  activePageIndex,
  isOpen,
  onClose,
  onRenameProject,
  onToggleThumbnails,
  onDeleteCurrentPage,
  onOpenTemplates,
  onOpenDownload,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(project.name);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveTitle = () => {
    const clean = titleInput.trim();
    if (clean) {
      onRenameProject(clean);
      setIsEditingTitle(false);
    }
  };

  const showTempFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white text-black rounded-3xl p-6 shadow-2xl flex flex-col gap-3 relative border-2 border-[#D4AF37] max-h-[90vh] overflow-y-auto">
        {/* Cancel button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-black/60 hover:text-black p-1 rounded-full hover:bg-black/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. Design Title Section (Pages 19-20) */}
        <div className="text-center pt-1 border-b border-black/10 pb-3">
          {isEditingTitle ? (
            <div className="flex items-center justify-center gap-2">
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="bg-black/10 text-black font-bold text-sm px-3 py-1.5 rounded-xl text-center focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleSaveTitle}
                className="p-1.5 bg-black text-white rounded-xl"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5">
              <h2 className="text-base font-bold text-black truncate max-w-[200px]">
                {project.name}
              </h2>
              <button
                onClick={() => setIsEditingTitle(true)}
                className="p-1 text-black/70 hover:text-black"
                title="Edit project title"
              >
                <Edit2 className="w-3.5 h-3.5 text-emerald-600" />
              </button>
            </div>
          )}
          <span className="text-[10px] text-black/50 block mt-0.5">
            Your design's saved feature
          </span>
        </div>

        {feedback && (
          <div className="p-2 bg-black text-white text-xs font-semibold rounded-xl text-center">
            {feedback}
          </div>
        )}

        {/* 2. Menu Item List (Pages 19-20) */}
        <div className="flex flex-col divide-y divide-black/10 text-xs font-semibold text-black">
          {/* See all Pages */}
          <button
            onClick={() => {
              onToggleThumbnails();
              onClose();
            }}
            className="py-2.5 flex items-center justify-between hover:bg-black/5 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <Grid className="w-4 h-4 text-black/70" />
              <span>See all Pages</span>
            </div>
            <span className="text-[10px] text-black/50">For displaying all pages</span>
          </button>

          {/* Branding */}
          <button
            onClick={() => showTempFeedback('Branding colors & fonts loaded in style tools.')}
            className="py-2.5 flex items-center justify-between hover:bg-black/5 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-black/70" />
              <span>Branding</span>
            </div>
            <span className="text-[10px] text-black/50">Brand typography & palette</span>
          </button>

          {/* Resize Design */}
          <button
            onClick={() => {
              onOpenDownload();
              onClose();
            }}
            className="py-2.5 flex items-center justify-between hover:bg-black/5 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <Maximize2 className="w-4 h-4 text-black/70" />
              <span>Resize Design</span>
            </div>
            <span className="text-[10px] text-black/50">Resize & Repurpose</span>
          </button>

          {/* Templates */}
          <button
            onClick={() => {
              onOpenTemplates();
              onClose();
            }}
            className="py-2.5 flex items-center justify-between hover:bg-black/5 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <Bookmark className="w-4 h-4 text-black/70" />
              <span>Templates</span>
            </div>
            <span className="text-[10px] text-black/50">Batch Studio templates</span>
          </button>

          {/* Version History */}
          <button
            onClick={() => showTempFeedback('In-memory Undo / Redo active.')}
            className="py-2.5 flex items-center justify-between hover:bg-black/5 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <History className="w-4 h-4 text-black/70" />
              <span>Version History</span>
            </div>
            <span className="text-[10px] text-black/50">Previous version states</span>
          </button>

          {/* Show Thumbnails */}
          <button
            onClick={() => {
              onToggleThumbnails();
              onClose();
            }}
            className="py-2.5 flex items-center justify-between hover:bg-black/5 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <ImageIcon className="w-4 h-4 text-black/70" />
              <span>Show Thumbnails</span>
            </div>
            <span className="text-[10px] text-black/50">Toggle thumbnail strip</span>
          </button>

          {/* Add Charts */}
          <button
            onClick={() => showTempFeedback('Charts & tables available in Text Tool.')}
            className="py-2.5 flex items-center justify-between hover:bg-black/5 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <BarChart2 className="w-4 h-4 text-black/70" />
              <span>Add Charts</span>
            </div>
            <span className="text-[10px] text-black/50">Insert table elements</span>
          </button>

          {/* Add from projects */}
          <button
            onClick={() => showTempFeedback('Select project from Dashboard.')}
            className="py-2.5 flex items-center justify-between hover:bg-black/5 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <FolderPlus className="w-4 h-4 text-black/70" />
              <span>Add from projects</span>
            </div>
            <span className="text-[10px] text-black/50">Merge page from project</span>
          </button>

          {/* Delete Page */}
          <button
            onClick={() => {
              onDeleteCurrentPage();
              onClose();
            }}
            className="py-2.5 flex items-center justify-between text-red-600 hover:bg-red-50 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Delete</span>
            </div>
            <span className="text-[10px] text-red-500/80">Delete current page</span>
          </button>
        </div>
      </div>
    </div>
  );
};
