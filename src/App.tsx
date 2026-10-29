/**
 * Litdom Batch Studio - Main Application Root
 * Client-side batch multi-page design generator and spreadsheet text population studio.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Project, WorkflowStep } from './types';
import { getAllProjects, saveProject, getProject } from './utils/db';
import { createSampleTestProject, createMinimalOnePageFourBoxesProject } from './utils/sampleData';
import { registerCustomFont } from './utils/canvasRenderer';
import { Header } from './components/Header';
import { WorkflowNavigation } from './components/WorkflowNavigation';
import { ProjectsView } from './components/ProjectsView';
import { UploadDesignsView } from './components/UploadDesignsView';
import { EditPageView } from './components/EditPageView';
import { TextSettingsView } from './components/TextSettingsView';
import { ImportSpreadsheetView } from './components/ImportSpreadsheetView';
import { PreviewView } from './components/PreviewView';
import { DownloadView } from './components/DownloadView';
import { PrivacyInfoModal } from './components/PrivacyInfoModal';

export default function App() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('projects');
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState<boolean>(false);
  const [initialLoaded, setInitialLoaded] = useState<boolean>(false);

  // Initialize and load latest project or sample suite
  useEffect(() => {
    const init = async () => {
      try {
        const projects = await getAllProjects();
        if (projects.length > 0) {
          const latest = projects[0];
          setCurrentProject(latest);
          // Register any custom fonts for this project
          if (latest.customFonts) {
            for (const font of latest.customFonts) {
              await registerCustomFont(font);
            }
          }
          if (latest.pages.length > 0) {
            setCurrentStep('edit');
          }
        } else {
          // Auto-seed with benchmark test project so user has immediate working designs
          const sample = createSampleTestProject();
          await saveProject(sample);
          setCurrentProject(sample);
          setCurrentStep('edit');
        }
      } catch (err) {
        console.error('Initialization error in IndexedDB:', err);
      } finally {
        setInitialLoaded(true);
      }
    };

    init();
  }, []);

  // Update project in state and persist to IndexedDB
  const handleUpdateProject = useCallback(async (updated: Project) => {
    setCurrentProject(updated);
    try {
      await saveProject(updated);
    } catch (err) {
      console.error('Failed to save project to IndexedDB:', err);
    }
  }, []);

  // One-click load Benchmark Suite
  const handleLoadSample = useCallback(async () => {
    const sample = createSampleTestProject();
    sample.name = `Litdom Benchmark Suite (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    await saveProject(sample);
    setCurrentProject(sample);
    setActivePageIndex(0);
    setCurrentStep('edit');
    if (sample.pages[0]?.textBoxes[0]) {
      setSelectedBoxId(sample.pages[0].textBoxes[0].id);
    }
  }, []);

  // One-click load minimal test (1 page, 4 labelled boxes)
  const handleLoadMinimalTest = useCallback(async () => {
    const minimal = createMinimalOnePageFourBoxesProject();
    await saveProject(minimal);
    setCurrentProject(minimal);
    setActivePageIndex(0);
    setCurrentStep('spreadsheet');
    if (minimal.pages[0]?.textBoxes[0]) {
      setSelectedBoxId(minimal.pages[0].textBoxes[0].id);
    }
  }, []);

  const handleSelectProject = (project: Project) => {
    setCurrentProject(project);
    setActivePageIndex(0);
    if (project.pages.length > 0) {
      setCurrentStep('edit');
      if (project.pages[0].textBoxes.length > 0) {
        setSelectedBoxId(project.pages[0].textBoxes[0].id);
      }
    } else {
      setCurrentStep('upload');
    }
  };

  const handleNavigateToEdit = (pageIndex: number) => {
    setActivePageIndex(pageIndex);
    setCurrentStep('edit');
  };

  const handleNavigateToTypography = (boxId: string) => {
    setSelectedBoxId(boxId);
    setCurrentStep('settings');
  };

  return (
    <div className="min-h-screen bg-[#0B0B0F] text-[#FFF8E7] flex flex-col font-sans selection:bg-[#D4AF37] selection:text-[#0B0B0F]">
      {/* 1. Litdom Brand Header */}
      <Header
        currentProject={currentProject}
        onOpenProjects={() => setCurrentStep('projects')}
        onOpenPrivacy={() => setIsPrivacyModalOpen(true)}
        onLoadSampleProject={handleLoadSample}
        onLoadMinimalTest={handleLoadMinimalTest}
      />

      {/* 2. 7-Stage Workflow Navigation Bar */}
      <WorkflowNavigation
        currentStep={currentStep}
        onSelectStep={setCurrentStep}
        pageCount={currentProject?.pages.length || 0}
        hasSpreadsheet={Boolean(currentProject?.lastSpreadsheetName)}
      />

      {/* 3. Main Stage Content */}
      <main className="flex-1 pb-16">
        {currentStep === 'projects' && (
          <ProjectsView
            currentProject={currentProject}
            onSelectProject={handleSelectProject}
            onLoadSample={handleLoadSample}
            onLoadMinimalTest={handleLoadMinimalTest}
          />
        )}

        {currentStep === 'upload' && currentProject && (
          <UploadDesignsView
            project={currentProject}
            onUpdateProject={handleUpdateProject}
            onNavigateToEdit={handleNavigateToEdit}
            onLoadSample={handleLoadSample}
          />
        )}

        {currentStep === 'edit' && currentProject && (
          <EditPageView
            project={currentProject}
            activePageIndex={activePageIndex}
            onSelectPageIndex={setActivePageIndex}
            onUpdateProject={handleUpdateProject}
            onNavigateToTypography={handleNavigateToTypography}
          />
        )}

        {currentStep === 'settings' && currentProject && (
          <TextSettingsView
            project={currentProject}
            activePageIndex={activePageIndex}
            selectedBoxId={selectedBoxId}
            onUpdateProject={handleUpdateProject}
            onSelectBoxId={setSelectedBoxId}
          />
        )}

        {currentStep === 'spreadsheet' && currentProject && (
          <ImportSpreadsheetView
            project={currentProject}
            activePageIndex={activePageIndex}
            onSelectPageIndex={setActivePageIndex}
            onUpdateProject={handleUpdateProject}
            onNavigateToPreview={() => setCurrentStep('preview')}
            onNavigateToEdit={() => setCurrentStep('edit')}
          />
        )}

        {currentStep === 'preview' && currentProject && (
          <PreviewView
            project={currentProject}
            activePageIndex={activePageIndex}
            onSelectPageIndex={setActivePageIndex}
            onNavigateToDownload={() => setCurrentStep('download')}
            onNavigateToEditBox={(boxId) => {
              setSelectedBoxId(boxId);
              setCurrentStep('edit');
            }}
          />
        )}

        {currentStep === 'download' && currentProject && (
          <DownloadView
            project={currentProject}
            activePageIndex={activePageIndex}
          />
        )}
      </main>

      {/* 4. Privacy & Independent Hosting Documentation Modal */}
      <PrivacyInfoModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />
    </div>
  );
}
