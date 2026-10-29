/**
 * Litdom Batch Studio - Top Navigation Bar
 * Follows the Top Bar Contract: Zone 1 Wordmark, Zone 2 Navigation, Zone 3 Primary Action
 */
import React from 'react';
import { Shield, Sparkles, FolderKanban } from 'lucide-react';
import { Project } from '../types';

interface HeaderProps {
  currentProject: Project | null;
  onOpenProjects: () => void;
  onOpenPrivacy: () => void;
  onLoadSampleProject: () => void;
  onLoadMinimalTest: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProject,
  onOpenProjects,
  onOpenPrivacy,
  onLoadSampleProject,
  onLoadMinimalTest,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0B0B0F]/95 backdrop-blur-md border-b border-[#212128] px-4 md:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D4AF37] to-[#8C7625] flex items-center justify-center shadow-md shadow-[#D4AF37]/10">
            <span className="font-serif font-black text-[#0B0B0F] text-base leading-none">L</span>
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-tight text-[#FFF8E7] whitespace-nowrap">
              Litdom <span className="text-[#D4AF37] font-medium text-xs md:text-sm tracking-normal">Batch Studio</span>
            </h1>
          </div>
        </div>

        {/* Zone 2: Project status & links */}
        <div className="hidden md:flex items-center gap-6 text-xs font-medium text-[#FFF8E7]/70">
          {currentProject ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-[#17171C] rounded-md border border-[#212128]">
              <span className="text-[#D4AF37]">Active Project:</span>
              <span className="text-[#FFF8E7] font-semibold truncate max-w-[200px]">
                {currentProject.name}
              </span>
              <span className="text-[#8C7625]">({currentProject.pages.length} pages)</span>
            </div>
          ) : (
            <span className="text-stone-400">No project active</span>
          )}
          <button
            onClick={onOpenPrivacy}
            className="hover:text-[#D4AF37] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
            Privacy & Hosting
          </button>
        </div>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onLoadMinimalTest}
            className="px-3 py-2 text-xs font-semibold text-[#D4AF37] bg-[#17171C] border border-[#D4AF37]/50 rounded-lg hover:border-[#D4AF37] hover:bg-[#212128] transition-all flex items-center gap-1.5 active:scale-95"
            title="Load minimal test: 1 page with 4 labelled boxes (TITLE, SUBTITLE, PARAGRAPH 1, CTA)"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="hidden sm:inline">1-Page 4-Boxes Test</span>
            <span className="sm:hidden">1-Page Test</span>
          </button>

          <button
            onClick={onLoadSampleProject}
            className="hidden lg:flex px-3 py-2 text-xs font-medium text-[#F4D58D] bg-[#17171C] border border-[#8C7625]/40 rounded-lg hover:border-[#D4AF37] hover:bg-[#212128] transition-all items-center gap-1.5 active:scale-95"
            title="Load benchmark test project with 2 layouts and test data"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>2-Layout Suite</span>
          </button>

          <button
            onClick={onOpenProjects}
            className="px-3.5 py-2 text-xs font-semibold text-[#0B0B0F] bg-[#D4AF37] hover:bg-[#F4D58D] rounded-lg transition-all flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>Projects</span>
          </button>
        </div>
      </div>
    </header>
  );
};
