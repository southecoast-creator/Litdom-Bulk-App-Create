/**
 * Litdom Batch Studio - Canvas Rendering Engine
 * Shared 1:1 renderer for screen-resolution preview and full-resolution export.
 * - Automatic box height fitting wrapped text (like Canva).
 * - Mixed rich-text runs (mixed fonts, sizes, bold, italic, underline, strike, effects).
 * - LRU cache keeping at most 5 decoded images in memory.
 * - Proportional typography scaling from 1000px baseline.
 */

import { TextBoxTemplate, DesignPage, TextRun, TextRunEffect } from '../types';
import { ensureFontLoaded, BUILTIN_GOOGLE_FONTS } from './fontManager';

export interface BuiltinFont {
  name: string;
  category: 'Serif' | 'Sans' | 'Display' | 'Mono' | 'Handwriting';
}

export const BUILTIN_FONTS: BuiltinFont[] = BUILTIN_GOOGLE_FONTS.map((f) => ({
  name: f.name,
  category: f.category,
}));

// LRU Decoded Image Cache: Keep at most 5 decoded images in memory
class DecodedImageLRU {
  private cache = new Map<string, HTMLImageElement>();
  private readonly maxLimit = 5;

  get(key: string): HTMLImageElement | undefined {
    const item = this.cache.get(key);
    if (item) {
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: string, img: HTMLImageElement): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxLimit) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, img);
  }

  clear(): void {
    this.cache.clear();
  }
}

const decodedImageCache = new DecodedImageLRU();

export async function getOrLoadDecodedImage(
  cacheKey: string,
  imageSrcOrBlob: string | Blob
): Promise<HTMLImageElement> {
  const cached = decodedImageCache.get(cacheKey);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }

  const img = new Image();
  let tempUrl = '';

  if (imageSrcOrBlob instanceof Blob) {
    tempUrl = URL.createObjectURL(imageSrcOrBlob);
    img.src = tempUrl;
  } else {
    img.src = imageSrcOrBlob;
  }

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load design background image'));
  });

  if (tempUrl) {
    URL.revokeObjectURL(tempUrl);
  }

  decodedImageCache.set(cacheKey, img);
  return img;
}

export function clearDecodedImageCache(): void {
  decodedImageCache.clear();
}

/**
 * Pre-decode adjacent images in the background (max 5 kept in memory)
 */
export async function predecodeImages(
  entries: { imageId: string; blob: Blob }[]
): Promise<void> {
  for (const entry of entries) {
    try {
      await getOrLoadDecodedImage(entry.imageId, entry.blob);
    } catch {
      // non-blocking
    }
  }
}

/**
 * Explicitly await document.fonts.load for all fonts used in the template or runs
 */
export async function preloadTemplateFonts(
  template: TextBoxTemplate[],
  richValues?: Record<string, TextRun[]>
): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;

  const fontFamilies = new Set<string>();

  for (const box of template) {
    if (box.fontFamily) fontFamilies.add(box.fontFamily);
  }

  if (richValues) {
    for (const runs of Object.values(richValues)) {
      if (Array.isArray(runs)) {
        for (const r of runs) {
          if (r.fontFamily) fontFamilies.add(r.fontFamily);
        }
      }
    }
  }

  const loadPromises = Array.from(fontFamilies).map(async (fontFamily) => {
    try {
      await ensureFontLoaded(fontFamily);
      await document.fonts.load(`32px "${fontFamily}"`);
    } catch {
      // safe fallback
    }
  });

  await Promise.all(loadPromises);
}

/**
 * Single Word/Token for mixed-run layout
 */
export interface LayoutToken {
  text: string;
  isWhitespace: boolean;
  isNewline: boolean;
  width: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  color: string;
  letterSpacing: number;
  underline: boolean;
  strike: boolean;
  effects?: TextRunEffect;
}

export interface LayoutLine {
  tokens: LayoutToken[];
  width: number;
  height: number;
  maxFontSize: number;
}

export interface ComputedLayoutResult {
  lines: LayoutLine[];
  computedHeightPx: number;
  computedHeightPercent: number;
  boxX: number;
  boxY: number;
  boxW: number;
  scaledPadding: number;
}

/**
 * Split text runs into tokens with inheritance from base box
 */
function tokenizeRuns(
  runs: TextRun[],
  box: TextBoxTemplate,
  scale: number,
  ctx?: CanvasRenderingContext2D | null
): LayoutToken[] {
  const tokens: LayoutToken[] = [];

  for (const run of runs) {
    const rawText = run.text;
    if (!rawText) continue;

    const fontFamily = run.fontFamily || box.fontFamily || 'Plus Jakarta Sans';
    const baseFontSize = run.fontSize !== undefined ? run.fontSize : box.fontSize;
    const fontSize = Math.max(6, Math.round(baseFontSize * scale));

    const isBold = run.bold !== undefined ? run.bold : (box.fontWeight === '700' || box.fontWeight === '800');
    const fontWeight = isBold ? '700' : (box.fontWeight || '400');

    const isItalic = run.italic !== undefined ? run.italic : box.fontStyle === 'italic';
    const fontStyle = isItalic ? 'italic' : 'normal';

    const color = run.color || box.color || '#FFF8E7';
    const baseLetterSpacing = run.letterSpacing !== undefined ? run.letterSpacing : (box.letterSpacing || 0);
    const letterSpacing = baseLetterSpacing * scale;

    const underline = !!run.underline;
    const strike = !!run.strike;

    const effects: TextRunEffect | undefined = run.effects || (box.shadow || box.stroke ? {
      shadow: box.shadow ? { enabled: true, ...box.shadow } : undefined,
      outline: box.stroke ? { enabled: true, ...box.stroke } : undefined,
    } : undefined);

    // Apply font to context to measure accurately
    if (ctx) {
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
    }

    // Split text into words, spaces, and explicit newlines
    const regex = /(\r\n|\r|\n|[^\S\r\n]+|[^\s]+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(rawText)) !== null) {
      const part = match[0];
      const isNewline = part === '\n' || part === '\r\n' || part === '\r';
      const isWhitespace = /^[^\S\r\n]+$/.test(part);

      let width = 0;
      if (!isNewline) {
        width = ctx ? ctx.measureText(part).width : part.length * (fontSize * 0.55);
        if (letterSpacing && part.length > 1) {
          width += (part.length - 1) * letterSpacing;
        }
      }

      tokens.push({
        text: part,
        isWhitespace,
        isNewline,
        width,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        color,
        letterSpacing,
        underline,
        strike,
        effects,
      });
    }
  }

  return tokens;
}

/**
 * Layout text box with automatic height calculation based on wrapped lines
 */
export function computeTextBoxLayout(
  ctx: CanvasRenderingContext2D | undefined | null,
  box: TextBoxTemplate,
  page: DesignPage,
  targetW: number,
  targetH: number
): ComputedLayoutResult {
  const scale = targetW / 1000;
  const boxX = (box.x / 100) * targetW;
  const boxY = (box.y / 100) * targetH;
  const boxW = (box.width / 100) * targetW;
  const scaledPadding = (box.padding || 0) * scale;
  const innerW = Math.max(10, boxW - scaledPadding * 2);

  // Determine runs: check richValues first, else values, else fieldLabel
  let runs: TextRun[] = [];
  if (page?.richValues && page.richValues[box.fieldLabel] && page.richValues[box.fieldLabel].length > 0) {
    runs = page.richValues[box.fieldLabel];
  } else {
    const rawContent = page?.values ? page.values[box.fieldLabel] : undefined;
    const text = rawContent !== undefined ? rawContent : box.fieldLabel;
    runs = [{ text }];
  }

  const tokens = tokenizeRuns(runs, box, scale, ctx);

  // Pack tokens into lines
  const lines: LayoutLine[] = [];
  let currentTokens: LayoutToken[] = [];
  let currentLineWidth = 0;
  let currentMaxFontSize = Math.max(6, Math.round(box.fontSize * scale));

  const finishLine = () => {
    // Trim trailing whitespace tokens from line width calculation
    let trimmedWidth = currentLineWidth;
    let endIdx = currentTokens.length - 1;
    while (endIdx >= 0 && currentTokens[endIdx].isWhitespace) {
      trimmedWidth -= currentTokens[endIdx].width;
      endIdx--;
    }

    const lineHeightPx = currentMaxFontSize * (box.lineHeight || 1.3);
    lines.push({
      tokens: [...currentTokens],
      width: Math.max(0, trimmedWidth),
      height: lineHeightPx,
      maxFontSize: currentMaxFontSize,
    });

    currentTokens = [];
    currentLineWidth = 0;
    currentMaxFontSize = Math.max(6, Math.round(box.fontSize * scale));
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.isNewline) {
      finishLine();
      continue;
    }

    if (t.fontSize > currentMaxFontSize) {
      currentMaxFontSize = t.fontSize;
    }

    // Check line wrapping
    if (currentTokens.length > 0 && currentLineWidth + t.width > innerW) {
      if (t.isWhitespace) {
        // Drop leading space on wrap
        continue;
      }
      finishLine();
    }

    // Don't add leading whitespace on a new line
    if (currentTokens.length === 0 && t.isWhitespace) {
      continue;
    }

    currentTokens.push(t);
    currentLineWidth += t.width;
  }

  if (currentTokens.length > 0 || lines.length === 0) {
    finishLine();
  }

  // Calculate total height automatically from all lines + padding
  let totalLinesHeight = 0;
  for (const line of lines) {
    totalLinesHeight += line.height;
  }

  const computedHeightPx = Math.max(16 * scale, totalLinesHeight + scaledPadding * 2);
  const computedHeightPercent = (computedHeightPx / targetH) * 100;

  return {
    lines,
    computedHeightPx,
    computedHeightPercent,
    boxX,
    boxY,
    boxW,
    scaledPadding,
  };
}

export interface RenderCanvasOptions {
  showBoundingBoxes?: boolean;
  selectedBoxId?: string | null;
  targetWidth?: number; // Screen-res preview width
  targetHeight?: number;
}

/**
 * Shared Canvas Renderer: renders design to an HTMLCanvasElement
 * Automatically computes height to fit text, and renders mixed runs with effects.
 */
export async function renderDesignToCanvas(
  canvas: HTMLCanvasElement,
  template: TextBoxTemplate[],
  page: DesignPage,
  imageSrcOrBlob: string | Blob,
  options: RenderCanvasOptions = {}
): Promise<void> {
  const boxesToRender =
    page.textBoxes && page.textBoxes.length > 0 ? page.textBoxes : template;

  // Ensure fonts are explicitly loaded
  await preloadTemplateFonts(boxesToRender, page.richValues);

  // Load decoded background image strictly under page.imageId
  const img = await getOrLoadDecodedImage(page.imageId, imageSrcOrBlob);

  const nativeW = page.width || img.naturalWidth || 1000;
  const nativeH = page.height || img.naturalHeight || 1000;

  const targetW = options.targetWidth || nativeW;
  const targetH = options.targetHeight || Math.round(targetW * (nativeH / nativeW));

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain 2D canvas context');

  ctx.clearRect(0, 0, targetW, targetH);

  // 1. Draw Background Image
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const scale = targetW / 1000;

  // 2. Render Text Boxes with Automatic Height Fitting
  for (const box of boxesToRender) {
    const layout = computeTextBoxLayout(ctx, box, page, targetW, targetH);
    const { lines, boxX, boxY, boxW, computedHeightPx, scaledPadding } = layout;

    ctx.save();

    // Optional Box Fill
    if (box.fill && box.fill.opacity > 0) {
      ctx.fillStyle = box.fill.color;
      ctx.globalAlpha = box.fill.opacity;
      ctx.fillRect(boxX, boxY, boxW, computedHeightPx);
      ctx.globalAlpha = 1.0;
    }

    // Render each line and its mixed tokens
    let currentY = boxY + scaledPadding;

    for (const line of lines) {
      // Baseline calculation within the line height
      const baselineY = currentY + line.maxFontSize;

      // Horizontal Alignment
      let lineStartX = boxX + scaledPadding;
      if (box.textAlign === 'center') {
        lineStartX = boxX + (boxW - line.width) / 2;
      } else if (box.textAlign === 'right') {
        lineStartX = boxX + boxW - scaledPadding - line.width;
      }

      let tokenX = lineStartX;

      for (const token of line.tokens) {
        if (token.isWhitespace && token.text.trim() === '') {
          tokenX += token.width;
          continue;
        }

        ctx.save();
        ctx.font = `${token.fontStyle} ${token.fontWeight} ${token.fontSize}px "${token.fontFamily}", sans-serif`;

        if (token.letterSpacing && typeof (ctx as any).letterSpacing !== 'undefined') {
          (ctx as any).letterSpacing = `${token.letterSpacing}px`;
        }

        // Apply Glow or Shadow Effect
        const effects = token.effects;
        if (effects?.glow?.enabled && effects.glow.strength > 0) {
          ctx.shadowColor = effects.glow.color;
          ctx.shadowBlur = effects.glow.strength * scale;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        } else if (effects?.shadow?.enabled && effects.shadow) {
          ctx.shadowColor = effects.shadow.color;
          ctx.shadowBlur = effects.shadow.blur * scale;
          ctx.shadowOffsetX = effects.shadow.offsetX * scale;
          ctx.shadowOffsetY = effects.shadow.offsetY * scale;
        } else if (box.shadow) {
          ctx.shadowColor = box.shadow.color;
          ctx.shadowBlur = box.shadow.blur * scale;
          ctx.shadowOffsetX = box.shadow.offsetX * scale;
          ctx.shadowOffsetY = box.shadow.offsetY * scale;
        }

        // Optional Outline / Stroke
        if (effects?.outline?.enabled && effects.outline.width > 0) {
          ctx.strokeStyle = effects.outline.color;
          ctx.lineWidth = effects.outline.width * scale;
          ctx.strokeText(token.text, tokenX, baselineY);
        } else if (box.stroke && box.stroke.width > 0) {
          ctx.strokeStyle = box.stroke.color;
          ctx.lineWidth = box.stroke.width * scale;
          ctx.strokeText(token.text, tokenX, baselineY);
        }

        // Fill text
        ctx.fillStyle = token.color || '#FFF8E7';
        ctx.fillText(token.text, tokenX, baselineY);

        // Underline
        if (token.underline) {
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = token.color;
          ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
          ctx.beginPath();
          ctx.moveTo(tokenX, baselineY + 3 * scale);
          ctx.lineTo(tokenX + token.width, baselineY + 3 * scale);
          ctx.stroke();
          ctx.restore();
        }

        // Strikethrough
        if (token.strike) {
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = token.color;
          ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
          const strikeY = baselineY - token.fontSize * 0.32;
          ctx.beginPath();
          ctx.moveTo(tokenX, strikeY);
          ctx.lineTo(tokenX + token.width, strikeY);
          ctx.stroke();
          ctx.restore();
        }

        ctx.restore();
        tokenX += token.width;
      }

      currentY += line.height;
    }

    ctx.restore();

    // 3. Optional Selection Outline: Strictly fits computed text size
    if (options.showBoundingBoxes) {
      const isSelected = options.selectedBoxId === box.id;
      ctx.save();
      ctx.strokeStyle = isSelected ? '#D4AF37' : 'rgba(212, 175, 55, 0.45)';
      ctx.lineWidth = isSelected ? 2 : 1;
      if (!isSelected) {
        ctx.setLineDash([4, 4]);
      }

      // Draw bounding box matching real computed height
      ctx.strokeRect(boxX, boxY, boxW, computedHeightPx);

      if (isSelected) {
        const handleRadius = Math.max(6, Math.min(10, Math.round(8 * scale)));

        const drawHandle = (hx: number, hy: number) => {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 4;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#D4AF37';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(hx, hy, handleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        };

        // Left and Right width handles (automatic height: top/bottom handles removed!)
        drawHandle(boxX, boxY + computedHeightPx / 2); // W
        drawHandle(boxX + boxW, boxY + computedHeightPx / 2); // E

        // 4 Corner handles for width & position adjustment
        drawHandle(boxX, boxY); // NW
        drawHandle(boxX + boxW, boxY); // NE
        drawHandle(boxX + boxW, boxY + computedHeightPx); // SE
        drawHandle(boxX, boxY + computedHeightPx); // SW

        // Floating field badge
        const badgeText = `${box.fieldLabel} (${box.width}%)`;
        ctx.font = `600 ${Math.max(10, Math.round(11 * scale))}px "Plus Jakarta Sans", sans-serif`;
        const badgeW = ctx.measureText(badgeText).width + 12;
        const badgeH = Math.max(16, Math.round(18 * scale));
        const badgeX = boxX;
        const badgeY = Math.max(0, boxY - badgeH - 4);

        ctx.fillStyle = '#17171C';
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#D4AF37';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, badgeX + 6, badgeY + badgeH / 2);
      }
      ctx.restore();
    }
  }
}
