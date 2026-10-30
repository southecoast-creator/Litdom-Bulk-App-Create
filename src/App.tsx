/**
 * Litdom Batch Studio - Main Application Entry
 * 2-Screen Flow: Dashboard <-> Workspace.
 * Automatically restores active project on page reload.
 */

import React, { useState, useEffect } from 'react';
import { Project } from './types';
import { getProject, saveProject } from './utils/db';
import { Dashboard } from './components/Dashboard';
import { Workspace } from './components/Workspace';

const ACTIVE_PROJECT_KEY = 'litdom_active_project_id';

export default function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_PROJECT_KEY) || null;
  });
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load active project if specified
  useEffect(() => {
    let isCancelled = false;

    const loadActive = async () => {
      if (!activeProjectId) {
        setCurrentProject(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const proj = await getProject(activeProjectId);
        if (!isCancelled) {
          if (proj) {
            setCurrentProject(proj);
          } else {
            // Project might have been deleted
            setActiveProjectId(null);
            localStorage.removeItem(ACTIVE_PROJECT_KEY);
            setCurrentProject(null);
          }
        }
      } catch (err) {
        console.error('Failed to load active project:', err);
        if (!isCancelled) {
          setActiveProjectId(null);
          localStorage.removeItem(ACTIVE_PROJECT_KEY);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadActive();

    return () => {
      isCancelled = true;
    };
  }, [activeProjectId]);

  const handleOpenProject = (id: string) => {
    setActiveProjectId(id);
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  };

  const handleBackToDashboard = () => {
    setActiveProjectId(null);
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    setCurrentProject(null);
  };

  const handleUpdateProject = (updated: Project) => {
    setCurrentProject(updated);
  };

  if (loading && activeProjectId) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[#FFF8E7]/60 font-mono">Loading studio…</span>
        </div>
      </div>
    );
  }

  if (activeProjectId && currentProject) {
    return (
      <Workspace
        project={currentProject}
        onBackToDashboard={handleBackToDashboard}
        onUpdateProject={handleUpdateProject}
      />
    );
  }

  return <Dashboard onOpenProject={handleOpenProject} />;
}
