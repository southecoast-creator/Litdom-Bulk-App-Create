/**
 * Litdom Batch Studio - Stage 4: Typography & Styling Studio
 * Font system (built-in & custom TTF/OTF upload), Litdom brand & custom hex colors,
 * text shadows, outlines, line spacing, and application scope.
 */
import React, { useState, useRef } from 'react';
import {
  Type,
  Upload,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Sliders,
  Check,
  AlertTriangle,
  ChevronDown,
  Palette,
  Sparkles,
} from 'lucide-react';
import { Project, TextBox, CustomFont } from '../types';
import { BUILTIN_FONTS, registerCustomFont, checkFontAvailability } from '../utils/canvasRenderer';
import { saveCustomFont } from '../utils/db';

interface TextSettingsViewProps {
  project: Project;
  activePageIndex: number;
  selectedBoxId: string | null;
  onUpdateProject: (updated: Project) => void;
  onSelectBoxId: (boxId: string) => void;
}

const LITDOM_SWATCHES = [
  { name: 'Dark Obsidian', hex: '#0B0B0F' },
  { name: 'Surface Noir', hex: '#17171C' },
  { name: 'Litdom Gold', hex: '#D4AF37' },
  { name: 'Soft Gold Cream', hex: '#F4D58D' },
  { name: 'Warm Cream', hex: '#FFF8E7' },
  { name: 'Antique Bronze', hex: '#8C7625' },
  { name: 'Deep Black', hex: '#000000' },
  { name: 'Pure White', hex: '#FFFFFF' },
];

export const TextSettingsView: React.FC<TextSettingsViewProps> = ({
  project,
  activePageIndex,
  selectedBoxId,
  onUpdateProject,
  onSelectBoxId,
}) => {
  const activePage = project.pages[activePageIndex];
  const selectedBox =
    activePage?.textBoxes.find((b) => b.id === selectedBoxId) || activePage?.textBoxes[0];

  const fontFileInputRef = useRef<HTMLInputElement>(null);
  const [customFontLoading, setCustomFontLoading] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);

  // Application scope: 'box' | 'page' | 'project'
  const [applyScope, setApplyScope] = useState<'box' | 'page' | 'project'>('box');
  const [hexInput, setHexInput] = useState(selectedBox?.color || '#FFF8E7');

  if (!activePage || !selectedBox) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-3">
        <h3 className="text-base font-semibold text-[#FFF8E7]">No text box available</h3>
        <p className="text-xs text-[#FFF8E7]/60">
          Please add a text box in the Edit Page stage to configure typography and styling.
        </p>
      </div>
    );
  }

  const isFontAvailable = checkFontAvailability(selectedBox.fontFamily);

  // Apply style updates with respected scope
  const handleApplyStyle = (updates: Partial<TextBox>) => {
    let updatedPages = [...project.pages];

    if (applyScope === 'box') {
      updatedPages = project.pages.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return {
          ...p,
          textBoxes: p.textBoxes.map((b) => (b.id === selectedBox.id ? { ...b, ...updates } : b)),
        };
      });
    } else if (applyScope === 'page') {
      updatedPages = project.pages.map((p, pIdx) => {
        if (pIdx !== activePageIndex) return p;
        return {
          ...p,
          textBoxes: p.textBoxes.map((b) => ({ ...b, ...updates })),
        };
      });
    } else if (applyScope === 'project') {
      updatedPages = project.pages.map((p) => ({
        ...p,
        textBoxes: p.textBoxes.map((b) => ({ ...b, ...updates })),
      }));
    }

    onUpdateProject({ ...project, pages: updatedPages, updatedAt: Date.now() });
  };

  // Color change with hex validation
  const handleColorChange = (newHex: string) => {
    setHexInput(newHex);
    if (/^#([0-9A-F]{3}){1,2}$/i.test(newHex)) {
      handleApplyStyle({ color: newHex });
    }
  };

  // Custom local TTF / OTF font upload
  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFontError(null);
    setCustomFontLoading(true);

    try {
      const familyName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim();

      const format = file.name.endsWith('.otf') ? 'opentype' : 'truetype';

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const newFont: CustomFont = {
        id: `font_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: familyName,
        familyName,
        fileName: file.name,
        format,
        dataUrl,
      };

      const loaded = await registerCustomFont(newFont);
      if (!loaded) {
        throw new Error('Browser could not parse or load this font file.');
      }

      await saveCustomFont(newFont);

      // Add to project
      const updatedFonts = [...(project.customFonts || []), newFont];
      const updatedProject = {
        ...project,
        customFonts: updatedFonts,
        updatedAt: Date.now(),
      };
      onUpdateProject(updatedProject);

      // Apply to selected box
      handleApplyStyle({ fontFamily: familyName });
    } catch (err: any) {
      setFontError(`Font loading error: ${err.message || 'Unsupported format'}`);
    } finally {
      setCustomFontLoading(false);
      if (fontFileInputRef.current) fontFileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner & Scope Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#212128]">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#FFF8E7]">
            Typography & Style Studio
          </h2>
          <p className="text-xs text-[#F4D58D]/70 mt-0.5">
            Precision font controls, custom TTF/OTF font engine, and Litdom color grading.
          </p>
        </div>

        {/* Scope Selector */}
        <div className="bg-[#17171C] border border-[#212128] rounded-xl p-1.5 flex items-center gap-1">
          <span className="text-[11px] font-semibold text-[#8C7625] px-2 whitespace-nowrap">
            Apply Scope:
          </span>
          <button
            onClick={() => setApplyScope('box')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              applyScope === 'box'
                ? 'bg-[#D4AF37] text-[#0B0B0F]'
                : 'text-[#FFF8E7]/70 hover:text-[#FFF8E7]'
            }`}
          >
            Selected Box ({selectedBox.fieldLabel})
          </button>
          <button
            onClick={() => setApplyScope('page')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              applyScope === 'page'
                ? 'bg-[#D4AF37] text-[#0B0B0F]'
                : 'text-[#FFF8E7]/70 hover:text-[#FFF8E7]'
            }`}
          >
            Current Page
          </button>
          <button
            onClick={() => setApplyScope('project')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              applyScope === 'project'
                ? 'bg-[#D4AF37] text-[#0B0B0F]'
                : 'text-[#FFF8E7]/70 hover:text-[#FFF8E7]'
            }`}
          >
            All Pages
          </button>
        </div>
      </div>

      {/* Box Switcher Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs text-[#8C7625] shrink-0">Select Box:</span>
        {activePage.textBoxes.map((box) => (
          <button
            key={box.id}
            onClick={() => {
              onSelectBoxId(box.id);
              setHexInput(box.color);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              box.id === selectedBox.id
                ? 'bg-[#D4AF37] text-[#0B0B0F] shadow-sm'
                : 'bg-[#17171C] border border-[#212128] text-[#FFF8E7]/80 hover:border-[#8C7625]'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full border border-black/30"
              style={{ backgroundColor: box.color }}
            />
            <span>{box.fieldLabel}</span>
          </button>
        ))}
      </div>

      {/* Main Grid: Fonts, Colors, Text Effects */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Font Family & Custom Font Upload (lg: 6 cols) */}
        <div className="lg:col-span-6 bg-[#17171C] border border-[#212128] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#212128]">
            <h3 className="text-xs font-bold text-[#FFF8E7] flex items-center gap-2">
              <Type className="w-4 h-4 text-[#D4AF37]" />
              <span>Font Family & Upload</span>
            </h3>

            <button
              onClick={() => fontFileInputRef.current?.click()}
              disabled={customFontLoading}
              className="px-3 py-1.5 rounded-lg bg-[#212128] hover:bg-[#2a2a35] border border-[#8C7625]/40 hover:border-[#D4AF37] text-[#F4D58D] text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{customFontLoading ? 'Loading Font...' : 'Upload Font (TTF/OTF)'}</span>
            </button>
            <input
              ref={fontFileInputRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              onChange={handleFontUpload}
              className="hidden"
            />
          </div>

          {fontError && (
            <div className="p-3 bg-red-950/40 border border-red-800 text-red-200 rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{fontError}</span>
            </div>
          )}

          {!isFontAvailable && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-800 text-amber-200 rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Font "{selectedBox.fontFamily}" may not be available on this device; fallback will be used.</span>
            </div>
          )}

          {/* Built-in Fonts Grid */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-[#8C7625] block">Built-in Typography</span>
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {BUILTIN_FONTS.map((f) => {
                const isSelected = selectedBox.fontFamily === f.name;
                return (
                  <button
                    key={f.name}
                    onClick={() => handleApplyStyle({ fontFamily: f.name })}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#FFF8E7]'
                        : 'border-[#212128] hover:border-[#8C7625] text-[#FFF8E7]/70'
                    }`}
                  >
                    <div className="text-xs font-semibold truncate" style={{ fontFamily: f.family }}>
                      {f.name}
                    </div>
                    <div className="text-[10px] text-[#8C7625] mt-0.5">{f.category}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Fonts Section */}
          {project.customFonts && project.customFonts.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-[#212128]">
              <span className="text-[11px] font-semibold text-[#D4AF37] block">
                Custom Uploaded Fonts ({project.customFonts.length})
              </span>
              <div className="grid grid-cols-2 gap-2">
                {project.customFonts.map((cf) => {
                  const isSelected = selectedBox.fontFamily === cf.familyName;
                  return (
                    <button
                      key={cf.id}
                      onClick={() => handleApplyStyle({ fontFamily: cf.familyName })}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#FFF8E7]'
                          : 'border-[#212128] hover:border-[#8C7625] text-[#FFF8E7]/70'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{cf.familyName}</div>
                      <div className="text-[10px] text-[#8C7625] uppercase mt-0.5">{cf.format}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Font Size, Weight, Alignment */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#212128]">
            <div>
              <div className="flex justify-between text-[11px] text-[#FFF8E7]/70 mb-1">
                <span>Font Size (px)</span>
                <span className="font-mono text-[#D4AF37]">{selectedBox.fontSize}px</span>
              </div>
              <input
                type="range"
                min="12"
                max="140"
                value={selectedBox.fontSize}
                onChange={(e) =>
                  handleApplyStyle({ fontSize: parseInt(e.target.value, 10) })
                }
                className="w-full accent-[#D4AF37] h-1.5 bg-[#0B0B0F] rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#FFF8E7]/70 mb-1">Font Weight</label>
              <select
                value={selectedBox.fontWeight}
                onChange={(e) => handleApplyStyle({ fontWeight: e.target.value })}
                className="w-full bg-[#0B0B0F] border border-[#212128] text-xs text-[#FFF8E7] rounded-lg px-2.5 py-1.5 focus:border-[#D4AF37]"
              >
                <option value="400">Regular (400)</option>
                <option value="500">Medium (500)</option>
                <option value="600">SemiBold (600)</option>
                <option value="700">Bold (700)</option>
                <option value="800">ExtraBold (800)</option>
              </select>
            </div>
          </div>

          {/* Alignment & Style toggles */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1 bg-[#0B0B0F] border border-[#212128] rounded-lg p-1">
              <button
                onClick={() => handleApplyStyle({ textAlign: 'left' })}
                className={`p-1.5 rounded ${
                  selectedBox.textAlign === 'left' ? 'bg-[#D4AF37] text-[#0B0B0F]' : 'text-[#FFF8E7]/60'
                }`}
                title="Left Align"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleApplyStyle({ textAlign: 'center' })}
                className={`p-1.5 rounded ${
                  selectedBox.textAlign === 'center' ? 'bg-[#D4AF37] text-[#0B0B0F]' : 'text-[#FFF8E7]/60'
                }`}
                title="Center Align"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleApplyStyle({ textAlign: 'right' })}
                className={`p-1.5 rounded ${
                  selectedBox.textAlign === 'right' ? 'bg-[#D4AF37] text-[#0B0B0F]' : 'text-[#FFF8E7]/60'
                }`}
                title="Right Align"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleApplyStyle({ textAlign: 'justify' })}
                className={`p-1.5 rounded ${
                  selectedBox.textAlign === 'justify' ? 'bg-[#D4AF37] text-[#0B0B0F]' : 'text-[#FFF8E7]/60'
                }`}
                title="Justify Align"
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() =>
                handleApplyStyle({
                  fontStyle: selectedBox.fontStyle === 'italic' ? 'normal' : 'italic',
                })
              }
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold italic transition-all ${
                selectedBox.fontStyle === 'italic'
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0B0B0F]'
                  : 'border-[#212128] text-[#FFF8E7]/70 hover:text-[#FFF8E7]'
              }`}
            >
              Italic Style
            </button>
          </div>
        </div>

        {/* Right Column: Colors & Text Effects (lg: 6 cols) */}
        <div className="lg:col-span-6 bg-[#17171C] border border-[#212128] rounded-2xl p-5 space-y-5">
          <div className="pb-3 border-b border-[#212128]">
            <h3 className="text-xs font-bold text-[#FFF8E7] flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#D4AF37]" />
              <span>Color Engine & Litdom Palette</span>
            </h3>
          </div>

          {/* Quick Swatches */}
          <div>
            <span className="text-[11px] font-semibold text-[#8C7625] block mb-2">
              Litdom Signature Brand Swatches
            </span>
            <div className="grid grid-cols-4 gap-2">
              {LITDOM_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  onClick={() => handleColorChange(swatch.hex)}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                    selectedBox.color.toLowerCase() === swatch.hex.toLowerCase()
                      ? 'border-[#D4AF37] ring-1 ring-[#D4AF37] bg-[#212128]'
                      : 'border-[#212128] hover:border-[#8C7625]'
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                    style={{ backgroundColor: swatch.hex }}
                  />
                  <span className="text-[10px] text-[#FFF8E7]/70 font-mono truncate w-full text-center">
                    {swatch.hex}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Hex Color Input + Native Color Picker */}
          <div className="p-3 bg-[#0B0B0F] border border-[#212128] rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={selectedBox.color.startsWith('#') ? selectedBox.color : '#FFF8E7'}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                title="Color Picker"
              />
              <div>
                <label className="text-[10px] font-semibold text-[#FFF8E7]/50 block">
                  Custom Hex Code
                </label>
                <input
                  type="text"
                  value={hexInput}
                  onChange={(e) => handleColorChange(e.target.value)}
                  placeholder="#FF5733"
                  className="bg-transparent text-xs font-mono font-bold text-[#FFF8E7] focus:outline-none uppercase w-24"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg border border-[#212128]"
                style={{ backgroundColor: selectedBox.color }}
              />
              <span className="text-[10px] text-[#D4AF37] font-semibold">Active Color</span>
            </div>
          </div>

          {/* Spacing & Line Height */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#212128]">
            <div>
              <div className="flex justify-between text-[11px] text-[#FFF8E7]/70 mb-1">
                <span>Line Spacing</span>
                <span className="font-mono text-[#D4AF37]">{selectedBox.lineHeight}x</span>
              </div>
              <input
                type="range"
                min="0.9"
                max="2.5"
                step="0.05"
                value={selectedBox.lineHeight}
                onChange={(e) =>
                  handleApplyStyle({ lineHeight: parseFloat(e.target.value) })
                }
                className="w-full accent-[#D4AF37] h-1.5 bg-[#0B0B0F] rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-[#FFF8E7]/70 mb-1">
                <span>Letter Spacing</span>
                <span className="font-mono text-[#D4AF37]">{selectedBox.letterSpacing || 0}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={selectedBox.letterSpacing || 0}
                onChange={(e) =>
                  handleApplyStyle({ letterSpacing: parseFloat(e.target.value) })
                }
                className="w-full accent-[#D4AF37] h-1.5 bg-[#0B0B0F] rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Shadows and Strokes */}
          <div className="space-y-3 pt-3 border-t border-[#212128]">
            <span className="text-[11px] font-semibold text-[#8C7625] block">
              Text Effects (Shadow & Stroke)
            </span>

            <div className="grid grid-cols-2 gap-3">
              {/* Shadow toggle / blur */}
              <div>
                <div className="flex justify-between text-[11px] text-[#FFF8E7]/70 mb-1">
                  <span>Shadow Blur</span>
                  <span className="font-mono text-[#D4AF37]">
                    {selectedBox.shadow?.blur || 0}px
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={selectedBox.shadow?.blur || 0}
                  onChange={(e) =>
                    handleApplyStyle({
                      shadow: {
                        color: selectedBox.shadow?.color || 'rgba(0,0,0,0.8)',
                        blur: parseInt(e.target.value, 10),
                        offsetX: selectedBox.shadow?.offsetX || 0,
                        offsetY: selectedBox.shadow?.offsetY || 3,
                      },
                    })
                  }
                  className="w-full accent-[#D4AF37] h-1.5 bg-[#0B0B0F] rounded-lg cursor-pointer"
                />
              </div>

              {/* Stroke / Outline */}
              <div>
                <div className="flex justify-between text-[11px] text-[#FFF8E7]/70 mb-1">
                  <span>Outline Width</span>
                  <span className="font-mono text-[#D4AF37]">
                    {selectedBox.stroke?.width || 0}px
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={selectedBox.stroke?.width || 0}
                  onChange={(e) =>
                    handleApplyStyle({
                      stroke: {
                        color: selectedBox.stroke?.color || '#0B0B0F',
                        width: parseFloat(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-[#D4AF37] h-1.5 bg-[#0B0B0F] rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
