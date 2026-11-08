import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Upload,
  Search,
  Check,
  Loader2,
  AlertCircle,
  X,
  Type,
  Trash2,
} from 'lucide-react';
import { StoredFontRecord } from '../types';
import {
  BUILTIN_GOOGLE_FONTS,
  loadAllStoredFonts,
  uploadMultipleFonts,
  removeCustomFont,
  ensureFontLoaded,
} from '../utils/fontManager';

export interface FontPanelProps {
  selectedFontFamily?: string;
  onSelectFont: (familyName: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

export const FontPanel: React.FC<FontPanelProps> = ({
  selectedFontFamily,
  onSelectFont,
  onClose,
  compact = false,
}) => {
  const [customFonts, setCustomFonts] = useState<StoredFontRecord[]>([]);
  const [fontSearch, setFontSearch] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFonts = async () => {
    try {
      const records = await loadAllStoredFonts();
      setCustomFonts(records);
    } catch (err) {
      console.error('Failed to load custom fonts in FontPanel:', err);
    }
  };

  useEffect(() => {
    loadFonts();

    // Listen to font-library-updated events dispatched across the app
    const handleUpdate = () => {
      loadFonts();
    };
    window.addEventListener('font-library-updated', handleUpdate);
    return () => {
      window.removeEventListener('font-library-updated', handleUpdate);
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setErrorMessage(null);
    setUploadFeedback(null);

    try {
      const { added, errors } = await uploadMultipleFonts(files);
      await loadFonts();

      if (added.length > 0) {
        const newest = added[added.length - 1];
        setUploadFeedback(`Added "${newest.familyName}"!`);
        onSelectFont(newest.familyName);
      }
      if (errors.length > 0) {
        setErrorMessage(errors.join('; '));
      }
      setTimeout(() => setUploadFeedback(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload font file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteCustom = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeCustomFont(id);
      await loadFonts();
    } catch (err) {
      console.error('Failed to delete custom font:', err);
    }
  };

  const filtered = useMemo(() => {
    const q = fontSearch.toLowerCase().trim();
    const custom = customFonts.filter((f) => !q || f.familyName.toLowerCase().includes(q));
    const google = BUILTIN_GOOGLE_FONTS.filter((f) => !q || f.name.toLowerCase().includes(q));
    return { custom, google };
  }, [fontSearch, customFonts]);

  return (
    <div className="flex flex-col space-y-2.5 text-[#FFF8E7] w-full">
      {/* 1. Upload Font Button at Top */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ttf, .otf, .woff, .woff2"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-[#D4AF37]/50 hover:border-[#D4AF37] bg-[#121217] hover:bg-[#1C1C24] text-xs font-bold text-[#D4AF37] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
          ) : (
            <Upload className="w-4 h-4 text-[#D4AF37]" />
          )}
          <span>{isUploading ? 'Registering Font…' : 'Upload Font (.ttf, .otf, .woff, .woff2)'}</span>
        </button>
      </div>

      {uploadFeedback && (
        <div className="p-2 bg-[#D4AF37]/15 border border-[#D4AF37]/40 rounded-xl text-xs text-[#D4AF37] flex items-center gap-1.5 animate-in fade-in">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{uploadFeedback}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-2 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-1.5 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span className="truncate">{errorMessage}</span>
        </div>
      )}

      {/* 2. Search Box */}
      <div className="flex items-center gap-2 bg-[#121217] border border-[#333342] rounded-xl px-2.5 py-1.5">
        <Search className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
        <input
          type="text"
          value={fontSearch}
          onChange={(e) => setFontSearch(e.target.value)}
          placeholder="Search fonts..."
          className="bg-transparent text-xs text-[#FFF8E7] w-full focus:outline-none placeholder-white/40"
        />
        {fontSearch && (
          <button
            type="button"
            onClick={() => setFontSearch('')}
            className="text-xs text-[#FFF8E7]/40 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 3. Full Scrollable List (Custom Fonts & Built-in Fonts together) */}
      <div className={`overflow-y-auto space-y-1 pr-1 ${compact ? 'max-h-56' : 'max-h-72'}`}>
        {filtered.custom.length > 0 && (
          <div>
            <div className="text-[10px] uppercase font-bold text-[#D4AF37] px-2 py-0.5 tracking-wider">
              ★ Uploaded Custom Fonts ({filtered.custom.length})
            </div>
            {filtered.custom.map((f) => {
              const isSelected = selectedFontFamily === f.familyName;
              return (
                <div
                  key={f.id}
                  onClick={() => {
                    ensureFontLoaded(f.familyName);
                    onSelectFont(f.familyName);
                    if (onClose) onClose();
                  }}
                  className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#D4AF37] text-[#0B0B0F] font-bold shadow-md'
                      : 'text-[#FFF8E7] hover:bg-[#21212A] bg-[#121217]/50'
                  }`}
                >
                  <span
                    className="truncate max-w-[200px]"
                    style={{ fontFamily: `"${f.familyName}", sans-serif`, fontSize: '14px' }}
                  >
                    {f.familyName}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCustom(f.id, e)}
                      className={`p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors ${isSelected ? 'text-black/40 hover:text-red-600' : ''}`}
                      title="Delete font"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase font-bold text-[#FFF8E7]/50 px-2 py-0.5 tracking-wider">
            Built-in Typefaces ({filtered.google.length})
          </div>
          {filtered.google.map((f) => {
            const isSelected = selectedFontFamily === f.name;
            return (
              <button
                key={f.name}
                type="button"
                onClick={() => {
                  ensureFontLoaded(f.name);
                  onSelectFont(f.name);
                  if (onClose) onClose();
                }}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-[#D4AF37] text-[#0B0B0F] font-bold shadow-md'
                    : 'text-[#FFF8E7] hover:bg-[#21212A]'
                }`}
              >
                <span
                  className="truncate max-w-[220px]"
                  style={{ fontFamily: `"${f.name}", sans-serif`, fontSize: '14px' }}
                >
                  {f.name}
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
