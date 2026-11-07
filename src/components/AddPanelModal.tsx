/**
 * Litdom Batch Studio - Add Element Panel
 * Exact visual match to IMG_1495 (2).pdf Page 17:
 * - T Add Text Box
 * - Default Text Styles: Add a heading, Add Subheading, Add some body text
 * - Extras: Add Page Number, Add Table to Page, Add horizontal line
 * - Font Combinations: Curated typography cards
 */

import React from 'react';
import {
  X,
  Type,
  Heading,
  Hash,
  Table,
  Minus,
  Sparkles,
} from 'lucide-react';
import { TextBoxTemplate } from '../types';

interface AddPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTextBox: (type?: 'heading' | 'subheading' | 'body' | 'page_number' | 'table' | 'line') => void;
  onApplyFontCombination: (headingFont: string, bodyFont: string) => void;
}

export const AddPanelModal: React.FC<AddPanelModalProps> = ({
  isOpen,
  onClose,
  onAddTextBox,
  onApplyFontCombination,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-sm sm:max-w-md bg-[#F4D58D] text-black rounded-3xl p-6 shadow-2xl flex flex-col gap-4 relative border-2 border-[#D4AF37] max-h-[90vh] overflow-y-auto">
        {/* Cancel button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-black/60 hover:text-black p-1 rounded-full hover:bg-black/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. Primary "T Add Text Box" button (Page 17) */}
        <div className="pt-2">
          <button
            onClick={() => {
              onAddTextBox();
              onClose();
            }}
            className="w-full bg-[#8C7625] hover:bg-[#73601E] text-white font-bold text-sm py-3 rounded-2xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Type className="w-4 h-4" />
            <span>T Add Text Box</span>
          </button>
        </div>

        {/* 2. Default Text Styles */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-black/80">Default Text Styles</span>
          <button
            onClick={() => {
              onAddTextBox('heading');
              onClose();
            }}
            className="w-full bg-transparent hover:bg-black/5 border-2 border-black rounded-2xl py-2.5 px-4 font-bold text-sm text-black transition-all text-center"
          >
            Add a heading
          </button>
          <button
            onClick={() => {
              onAddTextBox('subheading');
              onClose();
            }}
            className="w-full bg-transparent hover:bg-black/5 border-2 border-black rounded-2xl py-2 px-4 font-semibold text-xs text-black transition-all text-center"
          >
            Add Subheading
          </button>
          <button
            onClick={() => {
              onAddTextBox('body');
              onClose();
            }}
            className="w-full bg-transparent hover:bg-black/5 border border-black/80 rounded-2xl py-1.5 px-4 text-[11px] text-black transition-all text-center"
          >
            Add some body text
          </button>
        </div>

        {/* 3. Extras */}
        <div className="flex flex-col gap-2 border-t border-black/15 pt-3">
          <span className="text-xs font-bold text-black/80">Extras</span>

          <button
            onClick={() => {
              onAddTextBox('page_number');
              onClose();
            }}
            className="w-full bg-transparent hover:bg-black/5 border border-black rounded-2xl py-2 px-4 font-bold text-xs text-black transition-all flex items-center justify-center gap-2"
          >
            <div className="w-5 h-5 rounded-full border border-black flex items-center justify-center text-[10px] font-mono">
              1
            </div>
            <span>Add Page Number</span>
          </button>

          <button
            onClick={() => {
              onAddTextBox('table');
              onClose();
            }}
            className="w-full bg-transparent hover:bg-black/5 border border-black rounded-2xl py-2 px-4 font-bold text-xs text-black transition-all flex items-center justify-center gap-2"
          >
            <Table className="w-4 h-4 text-black" />
            <span>Add Table to Page</span>
          </button>

          <button
            onClick={() => {
              onAddTextBox('line');
              onClose();
            }}
            className="w-full bg-transparent hover:bg-black/5 border border-black rounded-2xl py-2 px-4 font-bold text-xs text-black transition-all flex items-center justify-center gap-2"
          >
            <Minus className="w-5 h-5 text-black" />
            <span>Add horizontal line</span>
          </button>
        </div>

        {/* 4. Font Combinations */}
        <div className="flex flex-col gap-2 border-t border-black/15 pt-3">
          <span className="text-xs font-bold text-black/80">Font Combinations</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                onApplyFontCombination('Cinzel', 'Plus Jakarta Sans');
                onClose();
              }}
              className="bg-black/20 hover:bg-black/30 rounded-2xl p-2.5 text-center flex flex-col items-center justify-center transition-all group"
            >
              <span className="font-serif font-black text-xs text-black leading-tight">
                AES<br />THETIC
              </span>
            </button>

            <button
              onClick={() => {
                onApplyFontCombination('Playfair Display', 'Plus Jakarta Sans');
                onClose();
              }}
              className="bg-indigo-600/30 hover:bg-indigo-600/40 rounded-2xl p-2.5 text-center flex flex-col items-center justify-center transition-all group"
            >
              <span className="italic font-serif font-bold text-xs text-indigo-950 leading-tight">
                Now<br />Open!
              </span>
            </button>

            <button
              onClick={() => {
                onApplyFontCombination('Oswald', 'Plus Jakarta Sans');
                onClose();
              }}
              className="bg-amber-600/30 hover:bg-amber-600/40 rounded-2xl p-2.5 text-center flex flex-col items-center justify-center transition-all group"
            >
              <span className="font-sans font-black text-xs text-orange-950 uppercase tracking-tighter leading-tight">
                BOLD<br />moves
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
