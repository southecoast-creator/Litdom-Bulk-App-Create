/**
 * Litdom Batch Studio - In-Place Rich Text Editor Overlay
 * Real contenteditable editor positioned directly over the canvas text box with native
 * phone selection handles, Selection API toolbar, mixed-run formatting, and
 * "Style this word in all designs" capability.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Check,
  X,
  Palette,
  Sparkles,
  Sliders,
  Type,
  Plus,
  Minus,
  Globe,
} from 'lucide-react';
import { TextBoxTemplate, DesignPage, TextRun, TextRunEffect, StoredFontRecord } from '../types';
import { BUILTIN_GOOGLE_FONTS, loadAllStoredFonts } from '../utils/fontManager';

interface RichTextOverlayProps {
  box: TextBoxTemplate;
  page: DesignPage;
  scale: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  onSave: (runs: TextRun[], plainText: string) => void;
  onStyleWordInAllDesigns: (word: string, styleOverrides: Partial<TextRun>) => void;
  onClose: () => void;
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
  const editorRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [hasSelection, setHasSelection] = useState<boolean>(false);
  const [isEffectsOpen, setIsEffectsOpen] = useState(false);
  const [customFonts, setCustomFonts] = useState<string[]>([]);

  // Selection formatting states
  const [activeColor, setActiveColor] = useState<string>(box.color || '#FFF8E7');
  const [activeFont, setActiveFont] = useState<string>(box.fontFamily || 'Plus Jakarta Sans');
  const [activeFontSize, setActiveFontSize] = useState<number>(box.fontSize || 36);
  const [activeLetterSpacing, setActiveLetterSpacing] = useState<number>(box.letterSpacing || 0);

  // Effects states
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [shadowColor, setShadowColor] = useState('#000000');
  const [shadowBlur, setShadowBlur] = useState(4);
  const [shadowOffsetX, setShadowOffsetX] = useState(2);
  const [shadowOffsetY, setShadowOffsetY] = useState(2);

  const [outlineEnabled, setOutlineEnabled] = useState(false);
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [outlineWidth, setOutlineWidth] = useState(2);

  const [glowEnabled, setGlowEnabled] = useState(false);
  const [glowColor, setGlowColor] = useState('#D4AF37');
  const [glowStrength, setGlowStrength] = useState(8);

  // Load custom fonts for font selector
  useEffect(() => {
    loadAllStoredFonts().then((records: StoredFontRecord[]) => {
      setCustomFonts(records.map((r: StoredFontRecord) => r.familyName));
    });
  }, []);

  // Initialize contenteditable with spans representing existing runs
  useEffect(() => {
    if (!editorRef.current) return;

    let runs: TextRun[] = [];
    if (page.richValues && page.richValues[box.fieldLabel] && page.richValues[box.fieldLabel].length > 0) {
      runs = page.richValues[box.fieldLabel];
    } else {
      const raw = page.values[box.fieldLabel] !== undefined ? page.values[box.fieldLabel] : box.fieldLabel;
      runs = [{ text: raw }];
    }

    // Build initial HTML
    const htmlParts = runs.map((run) => {
      const isBold = run.bold !== undefined ? run.bold : (box.fontWeight === '700' || box.fontWeight === '800');
      const isItalic = run.italic !== undefined ? run.italic : box.fontStyle === 'italic';
      const color = run.color || box.color || '#FFF8E7';
      const fontFamily = run.fontFamily || box.fontFamily || 'Plus Jakarta Sans';
      const fontSizePx = Math.max(8, Math.round((run.fontSize ?? box.fontSize) * scale));

      const styles: string[] = [
        `font-weight: ${isBold ? 'bold' : 'normal'}`,
        `font-style: ${isItalic ? 'italic' : 'normal'}`,
        `color: ${color}`,
        `font-family: "${fontFamily}", sans-serif`,
        `font-size: ${fontSizePx}px`,
      ];

      const textDecos: string[] = [];
      if (run.underline) textDecos.push('underline');
      if (run.strike) textDecos.push('line-through');
      if (textDecos.length > 0) {
        styles.push(`text-decoration: ${textDecos.join(' ')}`);
      }

      const escaped = run.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');

      return `<span style="${styles.join('; ')}">${escaped}</span>`;
    });

    editorRef.current.innerHTML = htmlParts.join('') || '<br/>';

    // Focus editor
    editorRef.current.focus();
  }, [box, page, scale]);

  // Monitor text selection via browser Selection API
  const updateSelectionState = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) {
      setHasSelection(false);
      setSelectedText('');
      return;
    }

    if (editorRef.current.contains(sel.anchorNode)) {
      const text = sel.toString();
      if (text.length > 0 && !sel.isCollapsed) {
        setHasSelection(true);
        setSelectedText(text);
      } else {
        setHasSelection(false);
        setSelectedText('');
      }
    } else {
      setHasSelection(false);
      setSelectedText('');
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateSelectionState);
    return () => {
      document.removeEventListener('selectionchange', updateSelectionState);
    };
  }, [updateSelectionState]);

  // Apply inline style to selected range or toggle formatting
  const applyStyleToSelection = (styleObj: Record<string, string>) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !editorRef.current) {
      return;
    }

    const range = sel.getRangeAt(0);
    const span = document.createElement('span');

    for (const [key, val] of Object.entries(styleObj)) {
      (span.style as any)[key] = val;
    }

    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);

    // Re-select span
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
    updateSelectionState();
  };

  const handleToggleBold = () => {
    if (hasSelection) {
      document.execCommand('bold', false);
    }
  };

  const handleToggleItalic = () => {
    if (hasSelection) {
      document.execCommand('italic', false);
    }
  };

  const handleToggleUnderline = () => {
    if (hasSelection) {
      document.execCommand('underline', false);
    }
  };

  const handleToggleStrike = () => {
    if (hasSelection) {
      document.execCommand('strikeThrough', false);
    }
  };

  const handleColorChange = (hex: string) => {
    setActiveColor(hex);
    if (hasSelection) {
      applyStyleToSelection({ color: hex });
    }
  };

  const handleFontFamilyChange = (fam: string) => {
    setActiveFont(fam);
    if (hasSelection) {
      applyStyleToSelection({ fontFamily: `"${fam}", sans-serif` });
    }
  };

  const handleFontSizeChange = (delta: number) => {
    const next = Math.max(10, Math.min(180, activeFontSize + delta));
    setActiveFontSize(next);
    if (hasSelection) {
      applyStyleToSelection({ fontSize: `${Math.round(next * scale)}px` });
    }
  };

  const handleLetterSpacingChange = (spacing: number) => {
    setActiveLetterSpacing(spacing);
    if (hasSelection) {
      applyStyleToSelection({ letterSpacing: `${spacing * scale}px` });
    }
  };

  // Convert HTML DOM back to TextRun[] and plain text
  const parseEditorToRuns = (): { runs: TextRun[]; plainText: string } => {
    if (!editorRef.current) return { runs: [], plainText: '' };

    const runs: TextRun[] = [];

    const traverse = (node: Node, inherited: Partial<TextRun>) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) {
          runs.push({
            text,
            ...inherited,
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;

        if (el.tagName === 'BR') {
          runs.push({ text: '\n' });
          return;
        }

        const currentStyle: Partial<TextRun> = { ...inherited };

        if (el.tagName === 'B' || el.tagName === 'STRONG' || el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight, 10) >= 700) {
          currentStyle.bold = true;
        }
        if (el.tagName === 'I' || el.tagName === 'EM' || el.style.fontStyle === 'italic') {
          currentStyle.italic = true;
        }
        if (el.tagName === 'U' || el.style.textDecoration?.includes('underline')) {
          currentStyle.underline = true;
        }
        if (el.tagName === 'S' || el.tagName === 'STRIKE' || el.style.textDecoration?.includes('line-through')) {
          currentStyle.strike = true;
        }
        if (el.style.color) {
          currentStyle.color = el.style.color;
        }
        if (el.style.fontFamily) {
          currentStyle.fontFamily = el.style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
        }

        for (let i = 0; i < el.childNodes.length; i++) {
          traverse(el.childNodes[i], currentStyle);
        }
      }
    };

    for (let i = 0; i < editorRef.current.childNodes.length; i++) {
      traverse(editorRef.current.childNodes[i], {});
    }

    // Coalesce adjacent identical runs
    const mergedRuns: TextRun[] = [];
    for (const r of runs) {
      if (mergedRuns.length > 0) {
        const prev = mergedRuns[mergedRuns.length - 1];
        const same =
          prev.bold === r.bold &&
          prev.italic === r.italic &&
          prev.underline === r.underline &&
          prev.strike === r.strike &&
          prev.color === r.color &&
          prev.fontFamily === r.fontFamily &&
          prev.fontSize === r.fontSize;
        if (same) {
          prev.text += r.text;
          continue;
        }
      }
      mergedRuns.push({ ...r });
    }

    const plainText = mergedRuns.map((r) => r.text).join('');
    return { runs: mergedRuns, plainText };
  };

  const handleCommit = () => {
    const { runs, plainText } = parseEditorToRuns();
    onSave(runs, plainText);
    onClose();
  };

  const handleApplyWordToAll = () => {
    if (!selectedText.trim()) return;
    const cleanWord = selectedText.trim();

    const overrides: Partial<TextRun> = {
      color: activeColor,
      fontFamily: activeFont,
      fontSize: activeFontSize,
    };

    if (shadowEnabled) {
      overrides.effects = {
        shadow: { enabled: true, color: shadowColor, blur: shadowBlur, offsetX: shadowOffsetX, offsetY: shadowOffsetY },
      };
    } else if (glowEnabled) {
      overrides.effects = {
        glow: { enabled: true, color: glowColor, strength: glowStrength },
      };
    } else if (outlineEnabled) {
      overrides.effects = {
        outline: { enabled: true, color: outlineColor, width: outlineWidth },
      };
    }

    onStyleWordInAllDesigns(cleanWord, overrides);
  };

  const scaledPadding = (box.padding || 0) * scale;

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto">
      {/* Semi-transparent backdrop for focus */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={handleCommit}
      />

      {/* Floating Rich-Text Toolbar */}
      <div
        className="absolute z-50 bg-[#17171C]/95 backdrop-blur-md border border-[#333342] rounded-2xl p-2 shadow-2xl flex flex-wrap items-center gap-1.5 max-w-[95vw] animate-in fade-in slide-in-from-top-2"
        style={{
          left: Math.max(10, Math.min(window.innerWidth - 380, boxX)),
          top: Math.max(10, boxY - 56),
        }}
        onMouseDown={(e) => e.preventDefault()} // Prevent contenteditable blur on toolbar tap
      >
        {/* Basic formatting */}
        <button
          type="button"
          onClick={handleToggleBold}
          className="p-1.5 rounded-lg text-xs hover:bg-[#262632] text-[#FFF8E7] min-h-[36px] min-w-[36px] flex items-center justify-center"
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleToggleItalic}
          className="p-1.5 rounded-lg text-xs hover:bg-[#262632] text-[#FFF8E7] min-h-[36px] min-w-[36px] flex items-center justify-center"
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleToggleUnderline}
          className="p-1.5 rounded-lg text-xs hover:bg-[#262632] text-[#FFF8E7] min-h-[36px] min-w-[36px] flex items-center justify-center"
          title="Underline"
        >
          <Underline className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleToggleStrike}
          className="p-1.5 rounded-lg text-xs hover:bg-[#262632] text-[#FFF8E7] min-h-[36px] min-w-[36px] flex items-center justify-center"
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-[#333342]" />

        {/* Font Family selector */}
        <select
          value={activeFont}
          onChange={(e) => handleFontFamilyChange(e.target.value)}
          className="bg-[#121217] border border-[#333342] text-xs font-semibold text-[#FFF8E7] rounded-lg px-2 py-1 max-w-[110px] truncate"
        >
          <optgroup label="Curated Fonts">
            {BUILTIN_GOOGLE_FONTS.slice(0, 8).map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </optgroup>
          {customFonts.length > 0 && (
            <optgroup label="Custom Fonts">
              {customFonts.map((f) => (
                <option key={f} value={f}>
                  ★ {f}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {/* Font Size stepper */}
        <div className="flex items-center bg-[#121217] border border-[#333342] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => handleFontSizeChange(-2)}
            className="px-1.5 py-1 text-[#FFF8E7]/70 hover:text-white"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="px-1.5 text-xs font-mono font-bold text-[#D4AF37]">
            {activeFontSize}
          </span>
          <button
            type="button"
            onClick={() => handleFontSizeChange(2)}
            className="px-1.5 py-1 text-[#FFF8E7]/70 hover:text-white"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-1 pl-1">
          {['#D4AF37', '#FFF8E7', '#EF4444', '#FFFFFF'].map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => handleColorChange(hex)}
              className="w-5 h-5 rounded-full border border-black/40 hover:scale-110 transition-transform"
              style={{ backgroundColor: hex }}
            />
          ))}
          <input
            type="color"
            value={activeColor}
            onChange={(e) => handleColorChange(e.target.value)}
            className="w-5 h-5 rounded-full bg-transparent border-0 cursor-pointer"
          />
        </div>

        <div className="h-5 w-px bg-[#333342]" />

        {/* "Style this word in all designs" button */}
        {hasSelection && (
          <button
            type="button"
            onClick={handleApplyWordToAll}
            className="bg-[#D4AF37]/15 hover:bg-[#D4AF37]/30 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-bold px-2 py-1.5 rounded-lg flex items-center gap-1 min-h-[34px] transition-all"
            title={`Apply active styling to "${selectedText.trim()}" in every design`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Style "{selectedText.trim().slice(0, 10)}" everywhere</span>
          </button>
        )}

        {/* Done / Commit Button */}
        <button
          type="button"
          onClick={handleCommit}
          className="bg-[#D4AF37] hover:bg-[#F4D58D] text-[#0B0B0F] font-bold text-xs p-1.5 rounded-lg flex items-center justify-center min-h-[36px] min-w-[36px] ml-auto transition-transform active:scale-95"
          title="Done Editing (Commit)"
        >
          <Check className="w-4 h-4 stroke-[3]" />
        </button>
      </div>

      {/* Positioned ContentEditable Element over Canvas Text Box */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={updateSelectionState}
        onKeyUp={updateSelectionState}
        onMouseUp={updateSelectionState}
        onTouchEnd={updateSelectionState}
        className="absolute z-40 outline-none border-2 border-[#D4AF37] bg-black/60 rounded-xl shadow-2xl overflow-visible text-[#FFF8E7] select-text"
        style={{
          left: boxX,
          top: boxY,
          width: boxW,
          minHeight: Math.max(32, boxH),
          padding: `${scaledPadding}px`,
          textAlign: box.textAlign || 'center',
          lineHeight: box.lineHeight || 1.3,
          touchAction: 'manipulation',
        }}
      />
    </div>
  );
};
