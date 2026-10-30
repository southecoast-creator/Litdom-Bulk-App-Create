/**
 * Litdom Batch Studio - Font Management Utility Modal
 * Allows uploading custom .ttf and .otf font files, stores them as Blobs in IndexedDB,
 * and dynamically loads them via the FontFace API with live typography previews.
 */

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
} from 'lucide-react';
import { StoredFontRecord } from '../types';
import {
  uploadAndRegisterFont,
  loadAllStoredFonts,
  removeCustomFont,
} from '../utils/fontManager';
import { formatBytes } from '../utils/db';

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
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState('THE SOVEREIGN CHRONICLE 2026');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFonts = async () => {
    try {
      const records = await loadAllStoredFonts();
      setFonts(records);
    } catch (err) {
      console.error('Failed to load fonts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFonts();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.ttf') && !lower.endsWith('.otf') && !lower.endsWith('.woff') && !lower.endsWith('.woff2')) {
      setErrorMessage('Please choose a valid .ttf or .otf font file.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const newRecord = await uploadAndRegisterFont(file);
      await loadFonts();
      onSelectFont(newRecord.familyName);
    } catch (err: any) {
      console.error('Upload font error:', err);
      setErrorMessage(err.message || 'Failed to upload and load font.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFont = async (id: string, familyName: string) => {
    try {
      await removeCustomFont(id);
      setFonts((prev) => prev.filter((f) => f.id !== id));
      if (selectedFontFamily === familyName) {
        onSelectFont('Plus Jakarta Sans');
      }
    } catch (err) {
      console.error('Failed to delete font:', err);
    }
  };

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
                Custom Font Utility
              </h3>
              <p className="text-[11px] text-[#FFF8E7]/60">
                Upload .ttf or .otf files, stored locally as Blobs in IndexedDB
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
              onChange={handleFileUpload}
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
                {isUploading ? 'Registering Font via FontFace API…' : 'Upload Custom Font (.ttf / .otf)'}
              </div>
              <p className="text-xs text-[#FFF8E7]/50">
                TrueType (.ttf) or OpenType (.otf) · Dynamically loaded before rendering
              </p>
            </button>
          </div>

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

          {/* Installed Fonts List */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
              Installed Custom Fonts ({fonts.length})
            </h4>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((n) => (
                  <div key={n} className="h-16 bg-[#121217] rounded-xl animate-pulse" />
                ))}
              </div>
            ) : fonts.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-[#262632] rounded-xl bg-[#121217]/30 text-xs text-[#FFF8E7]/50">
                No custom fonts uploaded yet. Upload your brand .ttf or .otf file above to use it across all designs.
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
                              <span>Use Font</span>
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteFont(f.id, f.familyName)}
                            className="p-1 text-[#FFF8E7]/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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
    </div>
  );
};
