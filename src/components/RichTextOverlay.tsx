/**
 * Litdom Batch Studio - Canva-Style Word Formatting Bottom Panel & Word Picker
 * 1. ZERO native selection fighting: Words are discrete tappable spans with user-select: none,
 *    -webkit-touch-callout: none, and preventDefault contextmenu.
 * 2. FIXED BOTTOM DOCKED PANEL: Formatting controls never float or fight Android menus.
 * 3. NON-NATIVE SLIDING FONT PICKER: Shows all fonts in their own typeface with live search.
 * 4. WORD-LEVEL TARGETING: Formats strictly the selected word(s). Buttons greyed out when no word is picked.
 * 5. SLIDING EFFECTS DRAWER: 8 presets (None, Shadow, Glow, Outline, Neon, Hollow, Highlight, Glitch) + sliders.
 * 6. BAKED IN: Auto-saves into page.richValues and draws directly on design canvas.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
  Sparkles,
  Type,
  Check,
  X,
  RotateCcw,
  Globe,
  Search,
  CheckSquare,
  Square,
  Minus,
  Plus,
  Sliders,
  ChevronUp,
  Layers,
} from 'lucide-react';
import {
  TextBoxTemplate,
  DesignPage,
  TextRun,
  TextRunEffect,
  EffectItemSettings,
  StoredFontRecord,
} from '../types';
import { BUILTIN_GOOGLE_FONTS, loadAllStoredFonts } from '../utils/fontManager';

interface RichTextOverlayProps {
  box: TextBoxTemplate;
  page: DesignPage;
  scale: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  containerWidth?: number;
  containerHeight?: number;
  onSave: (runs: TextRun[], plainText: string) => void;
  onStyleWordInAllDesigns: (word: string, styleOverrides: Partial<TextRun>) => void;
  onClose: () => void;
}

interface WordToken {
  id: string;
  text: string;
  isWord: boolean;
  wordIndex: number; // sequential index for words, -1 for whitespace/newlines
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  letterSpacing?: number;
  effects?: TextRunEffect;
}

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const RichTextOverlay: React.FC<RichTextOverlayProps> = ({
  box,
  page,
  scale,
  boxX,
  boxY,
  boxW,
  boxH,
  onSave,
  onStyleWordInAllDesigns,
  onClose,
}) => {
  // 1. Tokenize initial runs into discrete word tokens
  const initialTokens = useMemo<WordToken[]>(() => {
    let runs: TextRun[] = [];
    if (page.richValues && page.richValues[box.fieldLabel] && page.richValues[box.fieldLabel].length > 0) {
      runs = page.richValues[box.fieldLabel];
    } else {
      const raw = page.values[box.fieldLabel] !== undefined ? page.values[box.fieldLabel] : box.fieldLabel;
      runs = [{ text: raw }];
    }

    const tokens: WordToken[] = [];
    let wordCounter = 0;
    let tokenCounter = 0;

    for (const run of runs) {
      const parts = run.text.split(/(\r\n|\r|\n|[^\S\r\n]+|[^\s]+)/g);
      for (const part of parts) {
        if (!part) continue;
        const isNewline = part === '\n' || part === '\r\n' || part === '\r';
        const isWhitespace = /^[^\S\r\n]+$/.test(part);
        const isWord = !isNewline && !isWhitespace;

        tokens.push({
          id: `token_${tokenCounter++}`,
          text: part,
          isWord,
          wordIndex: isWord ? wordCounter++ : -1,
          bold: run.bold !== undefined ? run.bold : (box.fontWeight === '700' || box.fontWeight === '800'),
          italic: run.italic !== undefined ? run.italic : box.fontStyle === 'italic',
          underline: run.underline,
          strike: run.strike,
          color: run.color || box.color || '#FFF8E7',
          fontFamily: run.fontFamily || box.fontFamily || 'Plus Jakarta Sans',
          fontSize: run.fontSize !== undefined ? run.fontSize : box.fontSize,
          letterSpacing: run.letterSpacing !== undefined ? run.letterSpacing : (box.letterSpacing || 0),
          effects: run.effects ? JSON.parse(JSON.stringify(run.effects)) : undefined,
        });
      }
    }

    return tokens;
  }, [box, page.id]);

  const [tokens, setTokens] = useState<WordToken[]>(initialTokens);

  // Selected word indices (e.g. Set(2) for word index 2)
  const [selectedWordIndices, setSelectedWordIndices] = useState<Set<number>>(new Set());
  const [lastTappedWordIndex, setLastTappedWordIndex] = useState<number | null>(null);
  const [isRangeMode, setIsRangeMode] = useState<boolean>(false);

  // Sub-sheets inside the docked bottom panel
  const [isFontSheetOpen, setIsFontSheetOpen] = useState(false);
  const [isEffectsSheetOpen, setIsEffectsSheetOpen] = useState(false);
  const [fontSearch, setFontSearch] = useState('');

  // Fonts list
  const [customFonts, setCustomFonts] = useState<StoredFontRecord[]>([]);

  // Load custom fonts on mount
  useEffect(() => {
    loadAllStoredFonts().then((records) => {
      setCustomFonts(records);
    });
  }, []);

  // Filtered fonts for font sheet
  const filteredFonts = useMemo(() => {
    const q = fontSearch.toLowerCase().trim();
    const google = BUILTIN_GOOGLE_FONTS.filter((f) => !q || f.name.toLowerCase().includes(q));
    const custom = customFonts.filter((f) => !q || f.familyName.toLowerCase().includes(q));
    return { google, custom };
  }, [fontSearch, customFonts]);

  // Total word count in this box
  const totalWords = useMemo(() => {
    return tokens.filter((t) => t.isWord).length;
  }, [tokens]);

  // Selected tokens
  const selectedTokens = useMemo(() => {
    return tokens.filter((t) => t.isWord && selectedWordIndices.has(t.wordIndex));
  }, [tokens, selectedWordIndices]);

  const hasSelection = selectedTokens.length > 0;

  // Selected word text summary
  const selectedWordSummary = useMemo(() => {
    if (selectedTokens.length === 0) return '';
    if (selectedTokens.length === 1) return selectedTokens[0].text;
    if (selectedTokens.length === totalWords && totalWords > 1) return 'All words';
    return `${selectedTokens.length} words`;
  }, [selectedTokens, totalWords]);

  // Selected styles inspection
  const isSelectedBold = hasSelection && selectedTokens.every((t) => t.bold);
  const isSelectedItalic = hasSelection && selectedTokens.every((t) => t.italic);
  const isSelectedUnderline = hasSelection && selectedTokens.every((t) => t.underline);
  const isSelectedStrike = hasSelection && selectedTokens.every((t) => t.strike);

  const selectedFont = hasSelection ? selectedTokens[0].fontFamily || box.fontFamily : box.fontFamily;
  const selectedColor = hasSelection ? selectedTokens[0].color || box.color : box.color;
  const selectedFontSize = hasSelection ? selectedTokens[0].fontSize || box.fontSize : box.fontSize;
  const selectedLetterSpacing = hasSelection ? selectedTokens[0].letterSpacing || 0 : (box.letterSpacing || 0);

  // Active effect on selection
  const selectedEffectType = useMemo(() => {
    if (!hasSelection) return 'none';
    const firstEffects = selectedTokens[0].effects;
    if (!firstEffects || Object.keys(firstEffects).length === 0) return 'none';
    return Object.keys(firstEffects)[0] || 'none';
  }, [hasSelection, selectedTokens]);

  const [activeEffectParams, setActiveEffectParams] = useState<EffectItemSettings>({
    intensity: 60,
    color: '#D4AF37',
    blur: 12,
    opacity: 85,
  });

  // Convert current tokens back to TextRun[] and plainText, and live bake to canvas
  const commitTokens = useCallback(
    (currentTokens: WordToken[]) => {
      const runs: TextRun[] = [];
      for (const token of currentTokens) {
        if (!token.text) continue;
        if (runs.length > 0) {
          const prev = runs[runs.length - 1];
          const same =
            (prev.bold ?? false) === (token.bold ?? false) &&
            (prev.italic ?? false) === (token.italic ?? false) &&
            (prev.underline ?? false) === (token.underline ?? false) &&
            (prev.strike ?? false) === (token.strike ?? false) &&
            (prev.color || box.color) === (token.color || box.color) &&
            (prev.fontFamily || box.fontFamily) === (token.fontFamily || box.fontFamily) &&
            (prev.fontSize || box.fontSize) === (token.fontSize || box.fontSize) &&
            (prev.letterSpacing || 0) === (token.letterSpacing || 0) &&
            JSON.stringify(prev.effects || {}) === JSON.stringify(token.effects || {});

          if (same) {
            prev.text += token.text;
            continue;
          }
        }

        runs.push({
          text: token.text,
          bold: token.bold,
          italic: token.italic,
          underline: token.underline,
          strike: token.strike,
          color: token.color,
          fontFamily: token.fontFamily,
          fontSize: token.fontSize,
          letterSpacing: token.letterSpacing,
          effects: token.effects ? JSON.parse(JSON.stringify(token.effects)) : undefined,
        });
      }

      const plainText = runs.map((r) => r.text).join('');
      onSave(runs, plainText);
    },
    [box, onSave]
  );

  // Word selection handlers
  const handleWordTap = (wordIndex: number) => {
    if (isRangeMode && lastTappedWordIndex !== null) {
      // Range selection: from lastTapped to wordIndex
      const start = Math.min(lastTappedWordIndex, wordIndex);
      const end = Math.max(lastTappedWordIndex, wordIndex);
      const newSet = new Set<number>();
      for (let i = start; i <= end; i++) {
        newSet.add(i);
      }
      setSelectedWordIndices(newSet);
      setIsRangeMode(false);
    } else {
      // Single word select
      setSelectedWordIndices(new Set([wordIndex]));
      setLastTappedWordIndex(wordIndex);
    }
  };

  const handleSelectAll = () => {
    const all = new Set<number>();
    for (let i = 0; i < totalWords; i++) {
      all.add(i);
    }
    setSelectedWordIndices(all);
    setLastTappedWordIndex(0);
  };

  const handleClearSelection = () => {
    setSelectedWordIndices(new Set());
    setLastTappedWordIndex(null);
    setIsRangeMode(false);
  };

  // Format updater: modifies ONLY selected word tokens
  const updateSelectedTokens = (modifier: (token: WordToken) => Partial<WordToken>) => {
    if (!hasSelection) return;
    const nextTokens = tokens.map((t) => {
      if (t.isWord && selectedWordIndices.has(t.wordIndex)) {
        return {
          ...t,
          ...modifier(t),
        };
      }
      return t;
    });

    setTokens(nextTokens);
    commitTokens(nextTokens);
  };

  // Toggles
  const handleToggleBold = () => {
    const nextBold = !isSelectedBold;
    updateSelectedTokens(() => ({ bold: nextBold }));
  };

  const handleToggleItalic = () => {
    const nextItalic = !isSelectedItalic;
    updateSelectedTokens(() => ({ italic: nextItalic }));
  };

  const handleToggleUnderline = () => {
    const nextUnderline = !isSelectedUnderline;
    updateSelectedTokens(() => ({ underline: nextUnderline }));
  };

  const handleToggleStrike = () => {
    const nextStrike = !isSelectedStrike;
    updateSelectedTokens(() => ({ strike: nextStrike }));
  };

  const handleApplyColor = (colorHex: string) => {
    updateSelectedTokens(() => ({ color: colorHex }));
  };

  const handleApplyFont = (fontName: string) => {
    updateSelectedTokens(() => ({ fontFamily: fontName }));
    setIsFontSheetOpen(false);
  };

  const handleApplyFontSize = (delta: number) => {
    updateSelectedTokens((t) => ({
      fontSize: Math.max(10, Math.min(250, (t.fontSize || box.fontSize) + delta)),
    }));
  };

  const handleApplyLetterSpacing = (delta: number) => {
    updateSelectedTokens((t) => ({
      letterSpacing: Math.max(-5, Math.min(35, (t.letterSpacing || 0) + delta)),
    }));
  };

  // Apply Effect Preset
  const handleApplyEffectPreset = (type: string) => {
    if (type === 'none') {
      updateSelectedTokens(() => ({ effects: undefined }));
      return;
    }

    const effectObj: TextRunEffect = {};
    const base: EffectItemSettings = {
      enabled: true,
      intensity: activeEffectParams.intensity ?? 60,
      color: activeEffectParams.color || '#D4AF37',
      blur: activeEffectParams.blur ?? 12,
      opacity: activeEffectParams.opacity ?? 85,
    };

    switch (type) {
      case 'shadow':
        effectObj.shadow = { ...base, offsetX: 3, offsetY: 3 };
        break;
      case 'glow':
        effectObj.glow = { ...base, strength: Math.round(((activeEffectParams.intensity ?? 60) / 100) * 20 + 6) };
        break;
      case 'outline':
        effectObj.outline = { ...base, width: Math.max(1, Math.round(((activeEffectParams.intensity ?? 60) / 100) * 4 + 1.5)) };
        break;
      case 'neon':
        effectObj.neon = { ...base, color: activeEffectParams.color || '#00FFCC', blur: activeEffectParams.blur || 14 };
        break;
      case 'hollow':
        effectObj.hollow = { ...base, width: Math.max(1, Math.round(((activeEffectParams.intensity ?? 60) / 100) * 3 + 1.5)) };
        break;
      case 'highlight':
        effectObj.highlight = { ...base, color: activeEffectParams.color || '#FACC15' };
        break;
      case 'glitch':
        effectObj.glitch = { ...base, color: '#FF0033' };
        break;
    }

    updateSelectedTokens(() => ({ effects: effectObj }));
  };

  const handleUpdateEffectSlider = (field: 'intensity' | 'blur' | 'opacity', val: number) => {
    const next = { ...activeEffectParams, [field]: val };
    setActiveEffectParams(next);

    if (selectedEffectType !== 'none') {
      updateSelectedTokens((t) => {
        if (!t.effects || !t.effects[selectedEffectType]) return {};
        const eff = { ...t.effects };
        eff[selectedEffectType] = {
          ...eff[selectedEffectType],
          [field]: val,
        };
        return { effects: eff };
      });
    }
  };

  const handleUpdateEffectColor = (hex: string) => {
    const next = { ...activeEffectParams, color: hex };
    setActiveEffectParams(next);

    if (selectedEffectType !== 'none') {
      updateSelectedTokens((t) => {
        if (!t.effects || !t.effects[selectedEffectType]) return {};
        const eff = { ...t.effects };
        eff[selectedEffectType] = {
          ...eff[selectedEffectType],
          color: hex,
        };
        return { effects: eff };
      });
    }
  };

  const handleResetEffects = () => {
    setActiveEffectParams({
      intensity: 60,
      color: '#D4AF37',
      blur: 12,
      opacity: 85,
    });
    updateSelectedTokens(() => ({ effects: undefined }));
  };

  const handleStyleWordEverywhere = () => {
    if (!selectedTokens.length) return;
    const word = selectedTokens[0].text.trim();
    if (!word) return;

    onStyleWordInAllDesigns(word, {
      bold: selectedTokens[0].bold,
      italic: selectedTokens[0].italic,
      underline: selectedTokens[0].underline,
      strike: selectedTokens[0].strike,
      color: selectedTokens[0].color,
      fontFamily: selectedTokens[0].fontFamily,
      fontSize: selectedTokens[0].fontSize,
      letterSpacing: selectedTokens[0].letterSpacing,
      effects: selectedTokens[0].effects,
    });
  };

  const scaledPadding = (box.padding || 0) * scale;
  const recentColors = ['#D4AF37', '#FFF8E7', '#EF4444', '#10B981', '#3B82F6', '#FFFFFF', '#000000'];

  return (
    <>
      {/* 1. ON-CANVAS TAPPABLE WORD OVERLAY (Zero native selection fighting) */}
      <div
        onContextMenu={(e) => e.preventDefault()}
        className="absolute z-40 select-none overflow-visible rounded-sm border border-dashed border-[#D4AF37]/50"
        style={{
          left: boxX,
          top: boxY,
          width: boxW,
          minHeight: Math.max(32, boxH),
          padding: `${scaledPadding}px`,
          textAlign: box.textAlign || 'center',
          lineHeight: box.lineHeight || 1.3,
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        {tokens.map((token) => {
          if (!token.isWord) {
            if (token.text === '\n') {
              return <br key={token.id} />;
            }
            return (
              <span
                key={token.id}
                className="inline select-none whitespace-pre"
                style={{
                  fontSize: `${Math.round((token.fontSize || box.fontSize) * scale)}px`,
                  fontFamily: `"${token.fontFamily || box.fontFamily}", sans-serif`,
                }}
              >
                {token.text}
              </span>
            );
          }

          const isSelected = selectedWordIndices.has(token.wordIndex);
          const isB = token.bold;
          const isI = token.italic;
          const isU = token.underline;
          const isS = token.strike;
          const color = token.color || box.color || '#FFF8E7';
          const fontFamily = token.fontFamily || box.fontFamily || 'Plus Jakarta Sans';
          const fontSizePx = Math.round((token.fontSize || box.fontSize) * scale);
          const letterSpacingPx = (token.letterSpacing || 0) * scale;

          return (
            <span
              key={token.id}
              onClick={(e) => {
                e.stopPropagation();
                handleWordTap(token.wordIndex);
              }}
              className={`inline-block cursor-pointer select-none rounded-md px-1 py-0.5 transition-all active:scale-95 ${
                isSelected
                  ? 'bg-[#D4AF37]/35 ring-2 ring-[#D4AF37] shadow-lg shadow-[#D4AF37]/20 text-white font-bold'
                  : 'hover:bg-[#FFF8E7]/10'
              }`}
              style={{
                color,
                fontFamily: `"${fontFamily}", sans-serif`,
                fontSize: `${fontSizePx}px`,
                fontWeight: isB ? '800' : '400',
                fontStyle: isI ? 'italic' : 'normal',
                textDecoration: `${isU ? 'underline ' : ''}${isS ? 'line-through' : ''}`.trim() || 'none',
                letterSpacing: `${letterSpacingPx}px`,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
              }}
              title={`Tap to style "${token.text}"`}
            >
              {token.text}
            </span>
          );
        })}
      </div>

      {/* 2. FIXED BOTTOM DOCKED PANEL (Canva-style, never floats or fights phone menus) */}
      <div
        onContextMenu={(e) => e.preventDefault()}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#121217]/98 backdrop-blur-xl border-t border-[#262632] shadow-2xl flex flex-col text-[#FFF8E7] animate-in slide-in-from-bottom-4 duration-200 select-none pb-safe"
      >
        {/* Header Bar: Status & Selection Mode */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#212128] bg-[#17171C]/90 text-xs gap-2">
          {/* Active Word Tag */}
          <div className="flex items-center gap-1.5 min-w-0">
            {hasSelection ? (
              <span className="flex items-center gap-1.5 bg-[#D4AF37]/20 border border-[#D4AF37]/40 px-2.5 py-1 rounded-full text-[#D4AF37] font-bold truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
                <span className="truncate max-w-[150px]">
                  {selectedWordSummary}
                </span>
              </span>
            ) : (
              <span className="text-[#FFF8E7]/60 italic flex items-center gap-1">
                👉 Tap a word above to style it
              </span>
            )}
          </div>

          {/* Quick Select Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsRangeMode(!isRangeMode)}
              className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all min-h-[34px] flex items-center gap-1 ${
                isRangeMode
                  ? 'bg-[#D4AF37] text-[#0B0B0F] border-[#D4AF37] font-bold'
                  : 'bg-[#21212A] border-[#333342] text-[#FFF8E7]/70 hover:text-white'
              }`}
              title="Tap a word, then hold Range and tap another word"
            >
              <span>Range</span>
            </button>

            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2 py-1 bg-[#21212A] hover:bg-[#2B2B38] border border-[#333342] text-[11px] font-semibold text-[#FFF8E7]/80 rounded-lg transition-colors min-h-[34px]"
            >
              All
            </button>

            {hasSelection && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-2 py-1 text-[11px] text-[#FFF8E7]/50 hover:text-white min-h-[34px]"
              >
                Clear
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1 min-h-[34px] transition-all ml-1 shadow-md shadow-[#D4AF37]/20"
              title="Done Styling Words"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Done</span>
            </button>
          </div>
        </div>

        {/* Primary Formatting Controls Row */}
        <div
          className={`flex items-center gap-2 p-2.5 overflow-x-auto scrollbar-none transition-opacity ${
            !hasSelection ? 'opacity-40 pointer-events-none' : 'opacity-100'
          }`}
        >
          {/* Bold Button */}
          <button
            type="button"
            onClick={handleToggleBold}
            className={`px-3 py-2 rounded-xl text-xs font-bold min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 transition-all ${
              isSelectedBold
                ? 'bg-[#D4AF37] text-[#0B0B0F] shadow-md shadow-[#D4AF37]/20'
                : 'bg-[#1C1C24] hover:bg-[#262632] text-[#FFF8E7]'
            }`}
            title="Toggle Bold (800 Extra Bold)"
          >
            <Bold className="w-4 h-4 stroke-[3]" />
            <span className="hidden sm:inline">Bold</span>
          </button>

          {/* Italic Button */}
          <button
            type="button"
            onClick={handleToggleItalic}
            className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 transition-all ${
              isSelectedItalic
                ? 'bg-[#D4AF37] text-[#0B0B0F]'
                : 'bg-[#1C1C24] hover:bg-[#262632] text-[#FFF8E7]'
            }`}
            title="Toggle Italic"
          >
            <Italic className="w-4 h-4" />
            <span className="hidden sm:inline">Italic</span>
          </button>

          {/* Underline Button */}
          <button
            type="button"
            onClick={handleToggleUnderline}
            className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 transition-all ${
              isSelectedUnderline
                ? 'bg-[#D4AF37] text-[#0B0B0F]'
                : 'bg-[#1C1C24] hover:bg-[#262632] text-[#FFF8E7]'
            }`}
            title="Toggle Underline"
          >
            <Underline className="w-4 h-4" />
          </button>

          {/* Strikethrough Button */}
          <button
            type="button"
            onClick={handleToggleStrike}
            className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 transition-all ${
              isSelectedStrike
                ? 'bg-[#D4AF37] text-[#0B0B0F]'
                : 'bg-[#1C1C24] hover:bg-[#262632] text-[#FFF8E7]'
            }`}
            title="Toggle Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-[#262632] mx-0.5 shrink-0" />

          {/* Sliding Font Selector Button (Fixes "Cinzel" native select freeze) */}
          <button
            type="button"
            onClick={() => {
              setIsFontSheetOpen(!isFontSheetOpen);
              setIsEffectsSheetOpen(false);
            }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[44px] flex items-center gap-2 transition-all border whitespace-nowrap ${
              isFontSheetOpen
                ? 'bg-[#D4AF37] text-[#0B0B0F] border-[#D4AF37] font-bold'
                : 'bg-[#1C1C24] hover:bg-[#262632] border-[#333342] text-[#FFF8E7]'
            }`}
            title="Choose Font"
          >
            <Type className="w-4 h-4 text-[#D4AF37]" />
            <span className="max-w-[110px] truncate" style={{ fontFamily: `"${selectedFont}", sans-serif` }}>
              {selectedFont}
            </span>
            <ChevronUp className={`w-3.5 h-3.5 transition-transform ${isFontSheetOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Font Size Stepper */}
          <div className="flex items-center bg-[#1C1C24] border border-[#333342] rounded-xl overflow-hidden min-h-[44px] shrink-0">
            <button
              type="button"
              onClick={() => handleApplyFontSize(-2)}
              className="px-2.5 py-2 text-[#FFF8E7]/70 hover:text-white min-h-[44px] flex items-center justify-center text-xs font-bold"
              title="Decrease Font Size"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-xs font-mono font-bold text-[#D4AF37] min-w-[28px] text-center">
              {selectedFontSize}
            </span>
            <button
              type="button"
              onClick={() => handleApplyFontSize(2)}
              className="px-2.5 py-2 text-[#FFF8E7]/70 hover:text-white min-h-[44px] flex items-center justify-center text-xs font-bold"
              title="Increase Font Size"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Letter Spacing Stepper */}
          <div className="flex items-center bg-[#1C1C24] border border-[#333342] rounded-xl overflow-hidden min-h-[44px] shrink-0">
            <button
              type="button"
              onClick={() => handleApplyLetterSpacing(-1)}
              className="px-2 py-2 text-[#FFF8E7]/70 hover:text-white min-h-[44px] flex items-center justify-center text-[10px] font-mono"
              title="Decrease Spacing"
            >
              A|V-
            </button>
            <span className="px-1 text-xs font-mono font-bold text-[#FFF8E7] min-w-[20px] text-center">
              {selectedLetterSpacing}
            </span>
            <button
              type="button"
              onClick={() => handleApplyLetterSpacing(1)}
              className="px-2 py-2 text-[#FFF8E7]/70 hover:text-white min-h-[44px] flex items-center justify-center text-[10px] font-mono"
              title="Increase Spacing"
            >
              A|V+
            </button>
          </div>

          {/* Colour Swatches & Picker */}
          <div className="flex items-center gap-1.5 px-2 bg-[#1C1C24] border border-[#333342] rounded-xl min-h-[44px] shrink-0">
            <Palette className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <div className="flex items-center gap-1">
              {recentColors.slice(0, 3).map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => handleApplyColor(hex)}
                  className={`w-5 h-5 rounded-full border transition-transform ${
                    selectedColor.toUpperCase() === hex.toUpperCase()
                      ? 'border-white scale-110 shadow-md ring-2 ring-[#D4AF37]'
                      : 'border-black/40 hover:scale-105'
                  }`}
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))}
            </div>
            <input
              type="color"
              value={selectedColor.startsWith('#') && selectedColor.length === 7 ? selectedColor : '#D4AF37'}
              onChange={(e) => handleApplyColor(e.target.value)}
              className="w-6 h-6 rounded-full bg-transparent border-0 cursor-pointer shrink-0"
              title="Custom Colour"
            />
          </div>

          {/* Effects Drawer Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsEffectsSheetOpen(!isEffectsSheetOpen);
              setIsFontSheetOpen(false);
            }}
            className={`px-3 py-2 rounded-xl text-xs font-bold min-h-[44px] flex items-center gap-1.5 transition-all whitespace-nowrap border ${
              isEffectsSheetOpen || selectedEffectType !== 'none'
                ? 'bg-[#D4AF37] text-[#0B0B0F] border-[#D4AF37]'
                : 'bg-[#1C1C24] hover:bg-[#262632] border-[#333342] text-[#FFF8E7]'
            }`}
            title="Text Effects (Shadow, Glow, Neon, etc.)"
          >
            <Sparkles className="w-4 h-4" />
            <span>Effects</span>
            <ChevronUp className={`w-3.5 h-3.5 transition-transform ${isEffectsSheetOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Style word everywhere in all designs button */}
          {selectedTokens.length === 1 && (
            <button
              type="button"
              onClick={handleStyleWordEverywhere}
              className="bg-[#D4AF37]/15 hover:bg-[#D4AF37]/30 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-bold px-2.5 py-2 rounded-xl flex items-center gap-1 min-h-[44px] transition-all whitespace-nowrap"
              title={`Apply style of "${selectedTokens[0].text}" to all designs`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Style everywhere</span>
            </button>
          )}
        </div>

        {/* 3. SLIDING FONT PICKER (Custom slide-up sheet, NOT a native select) */}
        {isFontSheetOpen && (
          <div className="border-t border-[#262632] bg-[#17171C] p-3 max-h-64 flex flex-col space-y-2.5 animate-in slide-in-from-bottom-2 duration-150">
            {/* Search Box */}
            <div className="flex items-center gap-2 bg-[#121217] border border-[#333342] rounded-xl px-2.5 py-1.5">
              <Search className="w-4 h-4 text-[#D4AF37]" />
              <input
                type="text"
                value={fontSearch}
                onChange={(e) => setFontSearch(e.target.value)}
                placeholder="Search fonts..."
                className="bg-transparent text-xs text-[#FFF8E7] w-full focus:outline-none"
              />
              {fontSearch && (
                <button
                  type="button"
                  onClick={() => setFontSearch('')}
                  className="text-xs text-[#FFF8E7]/40 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Scrollable list of fonts */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {filteredFonts.custom.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#D4AF37] px-2 py-0.5">
                    ★ Custom Uploaded Fonts
                  </div>
                  {filteredFonts.custom.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleApplyFont(f.familyName)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center justify-between transition-colors ${
                        selectedFont === f.familyName
                          ? 'bg-[#D4AF37] text-[#0B0B0F] font-bold'
                          : 'text-[#FFF8E7] hover:bg-[#21212A]'
                      }`}
                      style={{ fontFamily: `"${f.familyName}", sans-serif` }}
                    >
                      <span>{f.familyName}</span>
                      {selectedFont === f.familyName && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase font-bold text-[#FFF8E7]/40 px-2 py-0.5">
                  Curated Typefaces
                </div>
                {filteredFonts.google.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => handleApplyFont(f.name)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center justify-between transition-colors ${
                      selectedFont === f.name
                        ? 'bg-[#D4AF37] text-[#0B0B0F] font-bold'
                        : 'text-[#FFF8E7] hover:bg-[#21212A]'
                    }`}
                    style={{ fontFamily: `"${f.name}", sans-serif` }}
                  >
                    <span>{f.name}</span>
                    {selectedFont === f.name && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 4. SLIDING EFFECTS DRAWER */}
        {isEffectsSheetOpen && (
          <div className="border-t border-[#262632] bg-[#17171C] p-3 max-h-72 overflow-y-auto space-y-3 animate-in slide-in-from-bottom-2 duration-150">
            {/* Presets: None, Shadow, Glow, Outline, Neon, Hollow, Highlight, Glitch */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase font-bold text-[#D4AF37] tracking-wider">
                  Effect Presets
                </span>
                <button
                  type="button"
                  onClick={handleResetEffects}
                  className="text-[10px] text-[#FFF8E7]/50 hover:text-red-400 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'none', label: 'None' },
                  { id: 'shadow', label: 'Shadow' },
                  { id: 'glow', label: 'Glow' },
                  { id: 'outline', label: 'Outline' },
                  { id: 'neon', label: 'Neon' },
                  { id: 'hollow', label: 'Hollow' },
                  { id: 'highlight', label: 'Highlight' },
                  { id: 'glitch', label: 'Glitch' },
                ].map((eff) => (
                  <button
                    key={eff.id}
                    type="button"
                    onClick={() => handleApplyEffectPreset(eff.id)}
                    className={`px-2 py-1.5 text-xs font-semibold rounded-xl border transition-all text-center ${
                      selectedEffectType === eff.id
                        ? 'bg-[#D4AF37] text-[#0B0B0F] border-[#D4AF37] font-bold shadow-md'
                        : 'bg-[#121217] hover:bg-[#21212A] text-[#FFF8E7] border-[#2D2D38]'
                    }`}
                  >
                    {eff.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedEffectType !== 'none' && (
              <div className="space-y-2 pt-2 border-t border-[#262632] text-xs">
                {/* Intensity */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#FFF8E7]/70 w-16">Intensity:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={activeEffectParams.intensity ?? 60}
                    onChange={(e) => handleUpdateEffectSlider('intensity', parseInt(e.target.value, 10))}
                    className="flex-1 accent-[#D4AF37] h-1.5 bg-[#121217] rounded-lg"
                  />
                  <span className="font-mono text-[#D4AF37] w-8 text-right font-bold">
                    {activeEffectParams.intensity ?? 60}
                  </span>
                </div>

                {/* Colour */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#FFF8E7]/70 w-16">Colour:</span>
                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <input
                      type="color"
                      value={activeEffectParams.color || '#D4AF37'}
                      onChange={(e) => handleUpdateEffectColor(e.target.value)}
                      className="w-5 h-5 rounded-full bg-transparent border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={(activeEffectParams.color || '#D4AF37').replace(/^#/, '')}
                      onChange={(e) => handleUpdateEffectColor(`#${e.target.value}`)}
                      className="w-16 bg-[#121217] border border-[#2D2D38] text-[11px] font-mono text-[#D4AF37] px-1 rounded uppercase"
                    />
                  </div>
                </div>

                {/* Blur */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#FFF8E7]/70 w-16">Blur:</span>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={activeEffectParams.blur ?? 12}
                    onChange={(e) => handleUpdateEffectSlider('blur', parseInt(e.target.value, 10))}
                    className="flex-1 accent-[#D4AF37] h-1.5 bg-[#121217] rounded-lg"
                  />
                  <span className="font-mono text-[#D4AF37] w-8 text-right font-bold">
                    {activeEffectParams.blur ?? 12}
                  </span>
                </div>

                {/* Opacity */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#FFF8E7]/70 w-16">Opacity:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={activeEffectParams.opacity ?? 85}
                    onChange={(e) => handleUpdateEffectSlider('opacity', parseInt(e.target.value, 10))}
                    className="flex-1 accent-[#D4AF37] h-1.5 bg-[#121217] rounded-lg"
                  />
                  <span className="font-mono text-[#D4AF37] w-8 text-right font-bold">
                    {activeEffectParams.opacity ?? 85}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
