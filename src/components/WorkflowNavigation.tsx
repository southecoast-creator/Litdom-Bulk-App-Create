/**
 * Litdom Batch Studio - 7-Stage Workflow Navigation Bar
 * Optimized for mobile touch ergonomics with 44px+ hit targets.
 */
import React from 'react';
import {
  FolderKanban,
  Upload,
  Layers,
  Sliders,
  FileSpreadsheet,
  Eye,
  DownloadCloud,
} from 'lucide-react';
import { WorkflowStep } from '../types';

interface WorkflowNavigationProps {
  currentStep: WorkflowStep;
  onSelectStep: (step: WorkflowStep) => void;
  pageCount: number;
  hasSpreadsheet: boolean;
}

const STEPS: { id: WorkflowStep; number: string; title: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'projects', number: '1', title: 'Projects', icon: FolderKanban },
  { id: 'upload', number: '2', title: 'Upload', icon: Upload },
  { id: 'edit', number: '3', title: 'Edit Page', icon: Layers },
  { id: 'settings', number: '4', title: 'Typography', icon: Sliders },
  { id: 'spreadsheet', number: '5', title: 'Spreadsheet', icon: FileSpreadsheet },
  { id: 'preview', number: '6', title: 'Preview & QC', icon: Eye },
  { id: 'download', number: '7', title: 'Download', icon: DownloadCloud },
];

export const WorkflowNavigation: React.FC<WorkflowNavigationProps> = ({
  currentStep,
  onSelectStep,
  pageCount,
  hasSpreadsheet,
}) => {
  return (
    <nav className="bg-[#17171C] border-b border-[#212128] sticky top-[57px] z-30 overflow-x-auto no-scrollbar shadow-sm">
      <div className="max-w-7xl mx-auto px-2 md:px-6 flex items-center min-w-max gap-1 py-1.5">
        {STEPS.map((step) => {
          const isActive = currentStep === step.id;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              onClick={() => onSelectStep(step.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all min-h-[44px] whitespace-nowrap active:scale-95 ${
                isActive
                  ? 'bg-[#D4AF37] text-[#0B0B0F] font-semibold shadow-sm shadow-[#D4AF37]/20'
                  : 'text-[#FFF8E7]/70 hover:text-[#FFF8E7] hover:bg-[#212128]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? 'bg-[#0B0B0F] text-[#D4AF37]' : 'bg-[#212128] text-[#8C7625]'
                }`}
              >
                {step.number}
              </div>
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#0B0B0F]' : 'text-[#D4AF37]'}`} />
              <span>{step.title}</span>

              {step.id === 'upload' && pageCount > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-[#0B0B0F]/20 text-[#0B0B0F]' : 'bg-[#212128] text-[#F4D58D]'
                  }`}
                >
                  {pageCount}
                </span>
              )}

              {step.id === 'spreadsheet' && hasSpreadsheet && (
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                    isActive ? 'bg-[#0B0B0F]/20 text-[#0B0B0F]' : 'bg-[#8C7625]/30 text-[#D4AF37]'
                  }`}
                >
                  LINKED
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
