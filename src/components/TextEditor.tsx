/**
 * Litdom Batch Studio - Quick in-place text editor (Canva / Adobe Express style)
 *
 * - Opens with ALL the text highlighted and the phone keyboard up.
 * - Type to replace everything (whole-box edit), or tap / drag the native handles to select
 *   just some words and format only those (Bold, Italic, Underline, Strike, colour, size,
 *   case, Bullets, Numbers). With only a caret, a button formats the word at the caret.
 * - Enter continues bullet / numbered lists; Backspace right after a marker removes the marker.
 * - "More styles" saves and opens the full font / effects panel (the previous editor).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List as ListIcon,
  ListOrdered,
  Minus,
  Plus,
  Check,
  X,
  Sparkles,
  CaseUpper,
  CaseLower,
  CaseSensitive,
} from 'lucide-react';
import { TextBoxTemplate, DesignPage, TextRun } from '../types';
import {
  applyStylePatch,
  backspaceAtListMarker,
  convertCaseInRange,
  effectiveRange,
  enterKeyEdit,
  normalizeRuns,
  replaceRange,
  runsToText,
  selectionListKind,
  sliceRuns,
  toggleListInRange,
  totalLength,
} from '../utils/richText';
import {
  domToRuns,
  getSelectionOffsets,
  isCleanStructure,
  renderRunsToDom,
  setSelectionOffsets,
} from '../utils/richEditorDom';

interface TextEditorProps {
  box: TextBoxTemplate;
  page: DesignPage;
  scale: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  onSave: (runs: TextRun[], plainText: string) => void;
  onMoreStyles: () => void;
  onClose: () => void;
}

const SWATCHES = ['#FFFFFF', '#000000', '#D4AF37', '#EF4444', '#F97316', '#FACC15', '#22C55E', '#3B82F6', '#A855F7', '#EC4899'];

/** Height the phone keyboard takes from the bottom of the screen (0 when closed). */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const v = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset(v > 60 ? v : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

export const TextEditor: React.FC<TextEditorProps> = ({
  box,
  page,
  scale,
  boxX,
  boxY,
  boxW,
  boxH,
  onSave,
  onMoreStyles,
  onClose,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const runsRef = useRef<TextRun[]>([]);
  const lastSelRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const composingRef = useRef(false);
  const initialRef = useRef<TextRun[]>([]);
  const kbInset = useKeyboardInset();
  const [, setTick] = useState(0);

  const redraw = () => setTick((t) => t + 1);

  // ---- helpers ------------------------------------------------------------------------------
  const paint = useCallback(
    (runs: TextRun[], sel?: { start: number; end: number }) => {
      const root = rootRef.current;
      if (!root) return;
      runsRef.current = normalizeRuns(runs);
      renderRunsToDom(root, runsRef.current, { box, scale });
      if (sel) {
        setSelectionOffsets(root, sel.start, sel.end);
        lastSelRef.current = sel;
      }
      redraw();
    },
    [box, scale]
  );

  const readSelection = (): { start: number; end: number } => {
    const root = rootRef.current;
    const s = root ? getSelectionOffsets(root) : null;
    if (s) lastSelRef.current = s;
    return lastSelRef.current;
  };

  const syncFromDom = () => {
    const root = rootRef.current;
    if (!root) return;
    const sel = readSelection();
    const runs = domToRuns(root);
    if (!isCleanStructure(root)) {
      paint(runs, sel);
    } else {
      runsRef.current = runs;
      redraw();
    }
  };

  // ---- mount: draw, focus, select everything -------------------------------------------------
  useEffect(() => {
    let runs: TextRun[];
    if (page.richValues && page.richValues[box.fieldLabel] && page.richValues[box.fieldLabel].length > 0) {
      runs = page.richValues[box.fieldLabel];
    } else {
      const raw = page.values[box.fieldLabel] !== undefined ? page.values[box.fieldLabel] : box.fieldLabel;
      runs = [{ text: raw }];
    }
    runs = normalizeRuns(runs);
    initialRef.current = runs;
    const root = rootRef.current;
    if (!root) return;
    paint(runs);
    const t = setTimeout(() => {
      root.focus({ preventScroll: true });
      setSelectionOffsets(root, 0, totalLength(runsRef.current));
      lastSelRef.current = { start: 0, end: totalLength(runsRef.current) };
      try {
        root.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {}
      redraw();
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- native events ------------------------------------------------------------------------
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onSelectionChange = () => {
      if (document.activeElement === root) {
        readSelection();
        redraw();
      }
    };

    const onBeforeInput = (ev: Event) => {
      const e = ev as InputEvent;
      if (composingRef.current) return;
      const sel = readSelection();
      const runs = domToRuns(root);
      runsRef.current = runs;

      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        e.preventDefault();
        const out = enterKeyEdit(runs, sel.start, sel.end);
        paint(out.runs, { start: out.caret, end: out.caret });
        return;
      }
      if (e.inputType === 'deleteContentBackward' && sel.start === sel.end) {
        const out = backspaceAtListMarker(runs, sel.start);
        if (out) {
          e.preventDefault();
          paint(out.runs, { start: out.caret, end: out.caret });
        }
      }
    };

    const onInput = () => {
      if (composingRef.current) return;
      syncFromDom();
    };
    const onCompStart = () => {
      composingRef.current = true;
    };
    const onCompEnd = () => {
      composingRef.current = false;
      syncFromDom();
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = (e.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
      if (!text) return;
      const sel = readSelection();
      const runs = domToRuns(root);
      const next = replaceRange(runs, Math.min(sel.start, sel.end), Math.max(sel.start, sel.end), text);
      const caret = Math.min(sel.start, sel.end) + text.length;
      paint(next, { start: caret, end: caret });
    };

    root.addEventListener('beforeinput', onBeforeInput);
    root.addEventListener('input', onInput);
    root.addEventListener('compositionstart', onCompStart);
    root.addEventListener('compositionend', onCompEnd);
    root.addEventListener('paste', onPaste);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      root.removeEventListener('beforeinput', onBeforeInput);
      root.removeEventListener('input', onInput);
      root.removeEventListener('compositionstart', onCompStart);
      root.removeEventListener('compositionend', onCompEnd);
      root.removeEventListener('paste', onPaste);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint]);

  // ---- formatting actions -------------------------------------------------------------------
  const currentRuns = (): TextRun[] => {
    const root = rootRef.current;
    return root && isCleanStructure(root) ? domToRuns(root) : runsRef.current;
  };

  /** Run `fn` on the selected range (or the word at the caret). */
  const onRange = (fn: (runs: TextRun[], s: number, e: number) => TextRun[]) => {
    const root = rootRef.current;
    if (!root) return;
    const sel = readSelection();
    const runs = currentRuns();
    const r = effectiveRange(runsToText(runs), sel.start, sel.end);
    if (!r) return;
    const next = fn(runs, r[0], r[1]);
    paint(next, { start: sel.start, end: sel.end });
    root.focus({ preventScroll: true });
    setSelectionOffsets(root, sel.start, sel.end);
  };

  const allHave = (pred: (r: TextRun) => boolean): boolean => {
    const runs = currentRuns();
    const sel = lastSelRef.current;
    const r = effectiveRange(runsToText(runs), sel.start, sel.end);
    if (!r) return false;
    const piece = sliceRuns(runs, r[0], r[1]);
    return piece.length > 0 && piece.every(pred);
  };

  const toggleFlag = (key: 'bold' | 'italic' | 'underline' | 'strike') => {
    const baseOn = key === 'bold' ? box.fontWeight >= '600' : key === 'italic' ? box.fontStyle === 'italic' : false;
    const on = allHave((r) => (r[key] !== undefined ? !!r[key] : baseOn));
    onRange((runs, s, e) => applyStylePatch(runs, s, e, { [key]: !on }));
  };

  const setColor = (color: string) =>
    onRange((runs, s, e) => applyStylePatch(runs, s, e, { color, gradient: undefined }));

  const changeSize = (delta: number) =>
    onRange((runs, s, e) => {
      const first = sliceRuns(runs, s, e)[0];
      const base = (first && first.fontSize) || box.fontSize || 24;
      return applyStylePatch(runs, s, e, { fontSize: Math.max(8, Math.min(220, Math.round(base + delta))) });
    });

  const setCase = (mode: 'lower' | 'upper' | 'mixed') =>
    onRange((runs, s, e) => convertCaseInRange(runs, s, e, mode));

  const toggleList = (kind: 'bullet' | 'number') => {
    const root = rootRef.current;
    if (!root) return;
    const sel = readSelection();
    const out = toggleListInRange(currentRuns(), sel.start, sel.end, kind);
    paint(out.runs, { start: out.selStart, end: out.selEnd });
    root.focus({ preventScroll: true });
    setSelectionOffsets(root, out.selStart, out.selEnd);
  };

  const selectAll = () => {
    const root = rootRef.current;
    if (!root) return;
    root.focus({ preventScroll: true });
    const total = totalLength(currentRuns());
    setSelectionOffsets(root, 0, total);
    lastSelRef.current = { start: 0, end: total };
    redraw();
  };

  const finish = (save: boolean) => {
    if (save) {
      const runs = normalizeRuns(currentRuns());
      onSave(runs, runsToText(runs));
    }
    onClose();
  };

  const saveThenMore = () => {
    const runs = normalizeRuns(currentRuns());
    onSave(runs, runsToText(runs));
    onMoreStyles();
  };

  // ---- derived UI state ---------------------------------------------------------------------
  const runsNow = runsRef.current;
  const sel = lastSelRef.current;
  const total = totalLength(runsNow);
  const hasRange = sel.end > sel.start;
  const isAll = hasRange && sel.start === 0 && sel.end >= total && total > 0;
  const listKind = selectionListKind(runsNow, sel.start, sel.end);
  const boldOn = allHave((r) => (r.bold !== undefined ? !!r.bold : box.fontWeight >= '600'));
  const italicOn = allHave((r) => (r.italic !== undefined ? !!r.italic : box.fontStyle === 'italic'));
  const underlineOn = allHave((r) => !!r.underline);
  const strikeOn = allHave((r) => !!r.strike);
  const status = isAll ? 'Everything selected' : hasRange ? 'Selected words only' : 'Tap a style to format the word at the cursor';

  const keep = (e: React.SyntheticEvent) => e.preventDefault(); // keeps the keyboard & selection

  const btn = (active: boolean) =>
    `min-w-[40px] h-10 px-2 rounded-xl flex items-center justify-center border text-sm font-bold active:scale-95 ${
      active ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-[#17171C] text-white border-[#333342]'
    }`;

  const pad = Math.round((box.padding || 0) * scale);

  return (
    <>
      {/* The editable text, drawn exactly over the box on the design */}
      <div
        style={{
          position: 'absolute',
          left: boxX,
          top: boxY,
          width: boxW,
          minHeight: boxH,
          zIndex: 40,
          boxSizing: 'border-box',
          outline: '2px dashed #D4AF37',
          outlineOffset: 2,
          borderRadius: 2,
          background: 'rgba(0,0,0,0.18)',
        }}
      >
        <div
          ref={rootRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          autoCapitalize="sentences"
          style={{
            outline: 'none',
            boxSizing: 'border-box',
            width: '100%',
            minHeight: boxH,
            padding: pad,
            fontFamily: `"${box.fontFamily}", sans-serif`,
            fontSize: Math.max(6, box.fontSize * scale),
            fontWeight: box.fontWeight,
            fontStyle: box.fontStyle,
            color: box.color,
            textAlign: box.textAlign,
            lineHeight: box.lineHeight || 1.3,
            letterSpacing: box.letterSpacing ? box.letterSpacing * scale : undefined,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            caretColor: '#D4AF37',
            WebkitUserSelect: 'text',
            userSelect: 'text',
          }}
        />
        <style>{`[contenteditable]::selection, [contenteditable] *::selection { background: rgba(212,175,55,0.55); }`}</style>
      </div>

      {/* Docked tool bar: sits right above the keyboard */}
      <div
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName !== 'INPUT') e.preventDefault();
        }}
        style={{ position: 'fixed', left: 0, right: 0, bottom: kbInset, zIndex: 60 }}
        className="bg-[#0B0B0F] border-t-2 border-[#D4AF37]/60 shadow-2xl text-white px-3 pt-2 pb-3"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-[#E5B224] font-semibold truncate max-w-[45%]">Editing: <b>{box.fieldLabel}</b> · {status}</span>
          <div className="flex items-center gap-2">
            <button onPointerDown={keep} onClick={selectAll} className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-[#D4AF37]/60 text-[#E5B224] active:scale-95">
              Select all
            </button>
            <button onPointerDown={keep} onClick={() => finish(false)} className="p-1.5 rounded-full bg-[#17171C] border border-[#333342] active:scale-95" title="Cancel">
              <X className="w-4 h-4" />
            </button>
            <button onPointerDown={keep} onClick={() => finish(true)} className="px-3 py-1.5 rounded-full bg-[#D4AF37] text-black text-xs font-extrabold flex items-center gap-1 active:scale-95" title="Done">
              <Check className="w-4 h-4" /> Done
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <button onPointerDown={keep} onClick={() => toggleFlag('bold')} className={btn(boldOn)}><Bold className="w-4 h-4" /></button>
          <button onPointerDown={keep} onClick={() => toggleFlag('italic')} className={btn(italicOn)}><Italic className="w-4 h-4" /></button>
          <button onPointerDown={keep} onClick={() => toggleFlag('underline')} className={btn(underlineOn)}><Underline className="w-4 h-4" /></button>
          <button onPointerDown={keep} onClick={() => toggleFlag('strike')} className={btn(strikeOn)}><Strikethrough className="w-4 h-4" /></button>
          <span className="w-px h-6 bg-[#333342] mx-0.5 shrink-0" />
          <button onPointerDown={keep} onClick={() => toggleList('bullet')} className={btn(listKind === 'bullet')} title="Bullets"><ListIcon className="w-4 h-4" /></button>
          <button onPointerDown={keep} onClick={() => toggleList('number')} className={btn(listKind === 'number')} title="Numbers"><ListOrdered className="w-4 h-4" /></button>
          <span className="w-px h-6 bg-[#333342] mx-0.5 shrink-0" />
          <button onPointerDown={keep} onClick={() => changeSize(-2)} className={btn(false)} title="Smaller"><Minus className="w-4 h-4" /></button>
          <button onPointerDown={keep} onClick={() => changeSize(2)} className={btn(false)} title="Bigger"><Plus className="w-4 h-4" /></button>
          <span className="w-px h-6 bg-[#333342] mx-0.5 shrink-0" />
          <button onPointerDown={keep} onClick={() => setCase('upper')} className={btn(false)} title="UPPERCASE"><CaseUpper className="w-4 h-4" /></button>
          <button onPointerDown={keep} onClick={() => setCase('lower')} className={btn(false)} title="lowercase"><CaseLower className="w-4 h-4" /></button>
          <button onPointerDown={keep} onClick={() => setCase('mixed')} className={btn(false)} title="Title Case"><CaseSensitive className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pt-1" style={{ scrollbarWidth: 'none' }}>
          {SWATCHES.map((c) => (
            <button
              key={c}
              onPointerDown={keep}
              onClick={() => setColor(c)}
              className="w-8 h-8 rounded-full border-2 border-white/40 shrink-0 active:scale-90"
              style={{ background: c }}
              title={c}
            />
          ))}
          <label className="w-8 h-8 rounded-full border-2 border-white/40 shrink-0 overflow-hidden relative" title="Custom colour"
            style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}>
            <input
              type="color"
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full"
            />
          </label>
          <button
            onPointerDown={keep}
            onClick={saveThenMore}
            className="ml-auto shrink-0 px-3 h-9 rounded-xl border border-[#D4AF37]/60 text-[#E5B224] text-[11px] font-bold flex items-center gap-1 active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5" /> Fonts &amp; effects
          </button>
        </div>
      </div>
    </>
  );
};
