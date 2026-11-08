/**
 * Litdom Batch Studio - Shape Insertion Panel (BUG-007)
 * Tapping [+ Add] opens shape-selection panel:
 * - Rectangle, Square, Circle, Triangle, Star
 * - Default solid black fill (#000000)
 * - Initial size: centered at 25% canvas width
 */

import React from 'react';
import { X, Square, Circle, Triangle, Star, RectangleHorizontal } from 'lucide-react';

export type ShapeType = 'rectangle' | 'square' | 'circle' | 'triangle' | 'star';

interface ShapePanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectShape: (shape: ShapeType) => void;
}

export const ShapePanelModal: React.FC<ShapePanelModalProps> = ({
  isOpen,
  onClose,
  onSelectShape,
}) => {
  if (!isOpen) return null;

  const shapes: { type: ShapeType; label: string; icon: React.ReactNode }[] = [
    {
      type: 'rectangle',
      label: 'Rectangle',
      icon: <RectangleHorizontal className="w-7 h-7 text-white fill-current" />,
    },
    {
      type: 'square',
      label: 'Square',
      icon: <Square className="w-7 h-7 text-white fill-current" />,
    },
    {
      type: 'circle',
      label: 'Circle',
      icon: <Circle className="w-7 h-7 text-white fill-current" />,
    },
    {
      type: 'triangle',
      label: 'Triangle',
      icon: <Triangle className="w-7 h-7 text-white fill-current" />,
    },
    {
      type: 'star',
      label: 'Star',
      icon: <Star className="w-7 h-7 text-white fill-current" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-[#F4D58D] text-black rounded-3xl p-6 shadow-2xl flex flex-col gap-4 relative border-2 border-[#D4AF37]">
        {/* Cancel button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-black/60 hover:text-black p-1 rounded-full hover:bg-black/10 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pt-1">
          <h3 className="font-bold text-base text-black text-center">Add Shape</h3>
          <p className="text-xs text-black/70 text-center mt-0.5">
            Inserts a scalable vector shape into the active design canvas.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 pt-2">
          {shapes.map((s) => (
            <button
              key={s.type}
              onClick={() => {
                onSelectShape(s.type);
                onClose();
              }}
              className="bg-black hover:bg-black/85 text-white rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-all shadow-md active:scale-95 group"
            >
              <div className="group-hover:scale-110 transition-transform flex items-center justify-center">
                {s.icon}
              </div>
              <span className="text-xs font-bold">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
