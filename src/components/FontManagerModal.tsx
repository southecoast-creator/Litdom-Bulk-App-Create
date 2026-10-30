import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Type,
  Trash2,
  Check,
  FileCode,
  Sparkles,
  AlertCircle,
  Loader2,
  Edit2,
  AlertTriangle,
} from 'lucide-react';
import { StoredFontRecord, Project } from '../types';
import {
  uploadMultipleFonts,
  loadAllStoredFonts,
  removeCustomFont,
  renameCustomFont,
  deleteAllCustomFonts,
  isFontUsedInProjects,
} from '../utils/fontManager';
import { getAllProjects, formatBytes } from '../utils/db';

interface FontManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFontFamily?: string;
  onSelectFont: (familyName: string) => void;
}

export const FontManagerModal: React.FC<FontManagerModalProps> = ({
  isOpen,
  onClose,
  selectedFontFamily,
  onSelectFont,
}) => {
  const [fonts, setFonts] = useState<StoredFontRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState('THE SOVEREIGN CHRONICLE 2026');

  // Renaming state
  const [renamingFont, setRenamingFont] = useState<StoredFontRecord | null>(null);
  const [newNameInput, setNewNameInput] = useState('');

  // Delete warning state
  const [deleteWarning, setDeleteWarning] = useState<{
    font: StoredFontRecord;
    usedProjects: string[];
  } | null>(null);

  // Delete all confirmation state
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      const [records, projs] = await Promise.all([
        loadAllStoredFonts(),
        getAllProjects(),
      ]);
      setFonts(records);
      setProjects(projs);
    } catch (err) {
      console.error('Failed to load fonts or projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleMultipleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setErrorMessage(null);
    setUploadFeedback(null);

    try {
      const { added, errors } = await uploadMultipleFonts(files);
      await loadData();

      if (added.length > 0) {
        setUploadFeedback(`Added ${added.length} custom font(s) to your global library.`);
        onSelectFont(added[added.length - 1].familyName);
      }
      if (errors.length > 0) {
        setErrorMessage(errors.join('; '));
      }
      setTimeout(() => setUploadFeedback(null), 4000);
    } catch (err: any) {
      console.error('Batch font upload error:', err);
      setErrorMessage(err.message || 'Failed to upload fonts.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStartDelete = (font: StoredFontRecord) => {
    const check = isFontUsedInProjects(font.familyName, projects);
    if (check.used) {
      setDeleteWarning({ font, usedProjects: check.projectNames });
    } else {
      executeDelete(font.id, font.familyName);
    }
  };

  const executeDelete = async (id: string, familyName: string) => {
    try {
      await removeCustomFont(id);
      setFonts((prev) => prev.filter((f) => f.id !== id));
      setDeleteWarning(null);
      if (selectedFontFamily === familyName) {
        onSelectFont('Plus Jakarta Sans');
      }
    } catch (err) {
      console.error('Failed to delete font:', err);
    }
  };

  const handleStartRename = (font: StoredFontRecord) => {
    setRenamingFont(font);
    setNewNameInput(font.familyName);
  };

  const handleSaveRename = async () => {
    if (!renamingFont || !newNameInput.trim()) return;
    try {
      await renameCustomFont(renamingFont.id, newNameInput.trim());
      await loadData();
      if (selectedFontFamily === renamingFont.familyName) {
        onSelectFont(newNameInput.trim());
      }
      setRenamingFont(null);
    } catch (err) {
      console.error('Failed to rename font:', err);
      setErrorMessage('Could not rename font.');
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllCustomFonts();
      setFonts([]);
      setShowDeleteAllConfirm(false);
      onSelectFont('Plus Jakarta Sans');
    } catch (err) {
      console.error('Failed to delete all fonts:', err);
    }
  };

  const totalFontBytes = fonts.reduce((sum, f) => sum + (f.fileSize || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#17171C] border border-[#2D2D38] w-full max-w-xl rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#262632] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
              <Type className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base text-[#FFF8E7]">
                Global Font Library
              </h3>
              <p className="text-[11px] text-[#FFF8E7]/60">
                Custom .ttf, .otf, .woff, .woff2 · Stored locally in IndexedDB
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#FFF8E7]/50 hover:text-white hover:bg-[#212128] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Upload Drop Area */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ttf, .otf, .woff, .woff2"
              multiple
              onChange={handleMultipleFilesUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full border-2 border-dashed border-[#3A3A4A] hover:border-[#D4AF37] rounded-2xl p-5 text-center transition-all bg-[#121217]/50 hover:bg-[#121217] group flex flex-col items-center justify-center gap-2 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-[#21212A] group-hover:bg-[#D4AF37]/20 flex items-center justify-center transition-colors">
                {isUploading ? (
                  <Loader2 className="w-5 h-5 text-[#D4AF37] animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 text-[#D4AF37]" />
                )}
              </div>
              <div className="text-sm font-semibold text-[#FFF8E7]">
                {isUploading ? 'Registering Font via FontFace API…' : 'Upload Font Files (.ttf, .otf, .woff, .woff2)'}
              </div>
              <p className="text-xs text-[#FFF8E7]/50">
                Select one or multiple fonts · Family names parsed automatically from binary SFNT headers
              </p>
            </button>
          </div>

          {uploadFeedback && (
            <div className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl text-xs text-[#D4AF37] flex items-center gap-2">
              <Check className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>{uploadFeedback}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Preview Text Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider">
              Preview Text
            </label>
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Type to test fonts…"
              className="w-full bg-[#121217] border border-[#2D2D38] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-xs text-[#FFF8E7] focus:outline-none"
            />
          </div>

          {/* Installed Fonts List Header & Size */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
                  Installed Custom Fonts ({fonts.length})
                </h4>
                {fonts.length > 0 && (
                  <span className="text-[10px] text-[#FFF8E7]/50 font-mono">
                    ({formatBytes(totalFontBytes)})
                  </span>
                )}
              </div>

              {fonts.length > 0 && (
                <button
                  onClick={() => setShowDeleteAllConfirm(true)}
                  className="text-[11px] text-red-400 hover:text-red-300 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete all fonts</span>
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((n) => (
                  <div key={n} className="h-16 bg-[#121217] rounded-xl animate-pulse" />
                ))}
              </div>
            ) : fonts.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-[#262632] rounded-xl bg-[#121217]/30 text-xs text-[#FFF8E7]/50">
                No custom fonts uploaded yet. Upload your brand font file above to use it across all projects.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {fonts.map((f) => {
                  const isSelected = selectedFontFamily === f.familyName;

                  return (
                    <div
                      key={f.id}
                      className={`p-3 rounded-xl border transition-all flex flex-col gap-2 ${
                        isSelected
                          ? 'border-[#D4AF37] bg-[#21212A]'
                          : 'border-[#262632] bg-[#121217]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-[#FFF8E7]">
                            {f.familyName}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#0B0B0F] border border-[#333342] text-[#D4AF37]">
                            {f.format}
                          </span>
                          <span className="text-[10px] text-[#FFF8E7]/40">
                            {formatBytes(f.fileSize)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleStartRename(f)}
                            className="p-1.5 text-[#FFF8E7]/40 hover:text-[#D4AF37] hover:bg-[#262632] rounded-lg transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                            title="Rename Font"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onSelectFont(f.familyName)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                              isSelected
                                ? 'bg-[#D4AF37] text-[#0B0B0F]'
                                : 'bg-[#1C1C24] hover:bg-[#D4AF37] hover:text-[#0B0B0F] text-[#FFF8E7]'
                            }`}
                          >
                            {isSelected ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Active</span>
                              </>
                            ) : (
                              <span>Use</span>
                            )}
                          </button>

                          <button
                            onClick={() => handleStartDelete(f)}
                            className="p-1.5 text-[#FFF8E7]/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                            title="Delete Font"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Live Typography Preview in that specific custom font */}
                      <div
                        className="text-base text-[#D4AF37] truncate py-1 px-2 rounded bg-[#0B0B0F]/60"
                        style={{ fontFamily: `"${f.familyName}", sans-serif` }}
                      >
                        {previewText || f.familyName}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#262632] flex items-center justify-end">
          <button
            onClick={onClose}
            className="bg-[#21212A] hover:bg-[#D4AF37] hover:text-[#0B0B0F] text-[#FFF8E7] font-bold text-xs px-5 py-2.5 rounded-xl transition-all min-h-[44px]"
          >
            Done
          </button>
        </div>
      </div>

      {/* Rename Font Modal */}
      {renamingFont && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171C] border border-[#333342] rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <h4 className="font-serif font-bold text-sm text-[#FFF8E7]">
              Rename Font Family
            </h4>
            <input
              type="text"
              value={newNameInput}
              onChange={(e) => setNewNameInput(e.target.value)}
              className="w-full bg-[#0B0B0F] border border-[#333342] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-xs text-[#FFF8E7] focus:outline-none"
              placeholder="New family name"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setRenamingFont(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-[#FFF8E7]/70 hover:bg-[#212128]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRename}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#D4AF37] text-[#0B0B0F] hover:bg-[#F4D58D]"
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Use Delete Warning Modal */}
      {deleteWarning && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171C] border border-amber-500/40 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="font-bold text-sm text-[#FFF8E7]">Font Currently in Use</h4>
            </div>
            <p className="text-xs text-[#FFF8E7]/70 leading-relaxed">
              <strong className="text-[#FFF8E7]">"{deleteWarning.font.familyName}"</strong> is used in {deleteWarning.usedProjects.length} project(s):{' '}
              <span className="text-[#D4AF37]">{deleteWarning.usedProjects.slice(0, 3).join(', ')}{deleteWarning.usedProjects.length > 3 ? '…' : ''}</span>.
            </p>
            <p className="text-xs text-[#FFF8E7]/60">
              Deleting it will cause designs using this font to fall back to the system typeface. Are you sure you want to delete it?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteWarning(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-[#FFF8E7]/70 hover:bg-[#212128]"
              >
                Cancel
              </button>
              <button
                onClick={() => executeDelete(deleteWarning.font.id, deleteWarning.font.familyName)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white"
              >
                Delete Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Custom Fonts Confirmation Modal */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#17171C] border border-red-500/40 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h4 className="font-bold text-sm text-[#FFF8E7]">Delete All Custom Fonts?</h4>
            </div>
            <p className="text-xs text-[#FFF8E7]/70 leading-relaxed">
              This will remove all custom fonts from your local font library ({formatBytes(totalFontBytes)}). Standard Google and system fonts will remain unaffected.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-[#FFF8E7]/70 hover:bg-[#212128]"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAll}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white"
              >
                Delete All Fonts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

