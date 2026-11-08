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
    const fontWeight = isBold ? '800' : '400';

    const isItalic = run.italic !== undefined ? run.italic : box.fontStyle === 'italic';
    const fontStyle = isItalic ? 'italic' : 'normal';

    const color = run.color || box.color || '#FFF8E7';
    const baseLetterSpacing = run.letterSpacing !== undefined ? run.letterSpacing : (box.letterSpacing || 0);
    const letterSpacing = baseLetterSpacing * scale;

    const underline = !!run.underline;
    const strike = !!run.strike;

    const mergedEffects: TextRunEffect | undefined = run.effects || box.effects ? {
      ...(box.effects || {}),
      ...(box.shadow ? { shadow: { enabled: true, ...box.shadow } } : {}),
      ...(box.stroke ? { outline: { enabled: true, ...box.stroke } } : {}),
      ...(run.effects || {}),
    } : (box.shadow || box.stroke ? {
      shadow: box.shadow ? { enabled: true, ...box.shadow } : undefined,
      outline: box.stroke ? { enabled: true, ...box.stroke } : undefined,
    } : undefined);
    const effects = mergedEffects;

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
  const boxX = Math.round((box.x / 100) * targetW);
  const boxY = Math.round((box.y / 100) * targetH);
  const boxW = Math.round((box.width / 100) * targetW);
  const scaledPadding = Math.round((box.padding || 0) * scale);
  const innerW = Math.max(10, boxW - scaledPadding * 2);

  // If this element is a Shape, Table, Line, or Image Overlay, return dedicated layout
  if (box.elementType === 'shape' || box.elementType === 'image_overlay') {
    const computedHeightPx = box.height !== undefined
      ? Math.round((box.height / 100) * targetH)
      : Math.round(boxW * (targetW / targetH));
    return {
      lines: [],
      computedHeightPx: Math.max(16, computedHeightPx),
      computedHeightPercent: (computedHeightPx / targetH) * 100,
      boxX,
      boxY,
      boxW,
      scaledPadding: 0,
    };
  }

  if (box.elementType === 'line') {
    const computedHeightPx = Math.max(16, Math.round(20 * scale));
    return {
      lines: [],
      computedHeightPx,
      computedHeightPercent: (computedHeightPx / targetH) * 100,
      boxX,
      boxY,
      boxW,
      scaledPadding: 0,
    };
  }

  if (box.elementType === 'table') {
    const computedHeightPx = box.height !== undefined
      ? Math.round((box.height / 100) * targetH)
      : Math.round(Math.max(120 * scale, targetH * 0.22));
    return {
      lines: [],
      computedHeightPx,
      computedHeightPercent: (computedHeightPx / targetH) * 100,
      boxX,
      boxY,
      boxW,
      scaledPadding: 0,
    };
  }

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

    const lineHeightPx = Math.round(currentMaxFontSize * (box.lineHeight || 1.3));
    lines.push({
      tokens: [...currentTokens],
      width: Math.round(Math.max(0, trimmedWidth)),
      height: lineHeightPx,
      maxFontSize: Math.round(currentMaxFontSize),
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

  // Reserve extra vertical space for effects that flow outside line bounds (drips, melting, shadows, glow)
  let extraEffectPaddingBottom = 0;
  for (const line of lines) {
    for (const token of line.tokens) {
      const ef = token.effects;
      if (ef?.dripping?.enabled) {
        extraEffectPaddingBottom = Math.max(extraEffectPaddingBottom, ((ef.dripping.intensity ?? 50) / 100) * 18 * scale);
      }
      if (ef?.melting?.enabled) {
        extraEffectPaddingBottom = Math.max(extraEffectPaddingBottom, ((ef.melting.intensity ?? 50) / 100) * 16 * scale);
      }
      if (ef?.shadow?.enabled && (ef.shadow.offsetY || 0) > 0) {
        extraEffectPaddingBottom = Math.max(extraEffectPaddingBottom, ((ef.shadow.offsetY || 0) + (ef.shadow.blur || 0)) * scale);
      }
      if (ef?.glow?.enabled) {
        extraEffectPaddingBottom = Math.max(extraEffectPaddingBottom, (ef.glow.strength || 0) * 0.4 * scale);
      }
    }
  }

  const computedHeightPx = Math.round(
    Math.max(16 * scale, totalLinesHeight + scaledPadding * 2 + extraEffectPaddingBottom)
  );
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

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function getSeededRandom(seed: number) {
  let s = (seed % 2147483647) || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Draw a styled word token with all standard, texture, artistic, and liquid effects.
 * Strictly respects draw order and proportional typography scaling from 1000px baseline.
 */
function drawStyledTokenWithEffects(
  ctx: CanvasRenderingContext2D,
  token: LayoutToken,
  tokenX: number,
  baselineY: number,
  scale: number,
  box: TextBoxTemplate
) {
  const effects = {
    ...(box.effects || {}),
    ...(box.shadow ? { shadow: { enabled: true, ...box.shadow } } : {}),
    ...(box.stroke ? { outline: { enabled: true, ...box.stroke } } : {}),
    ...(token.effects || {}),
  };
  const rand = getSeededRandom(hashString(token.text + token.fontSize));

  ctx.save();
  ctx.font = `${token.fontStyle} ${token.fontWeight} ${token.fontSize}px "${token.fontFamily}", sans-serif`;
  if (token.letterSpacing && typeof (ctx as any).letterSpacing !== 'undefined') {
    (ctx as any).letterSpacing = `${token.letterSpacing}px`;
  }

  // 1. BACKGROUND HIGHLIGHT / PILL
  if (effects.highlight?.enabled) {
    ctx.save();
    ctx.fillStyle = effects.highlight.color || '#FACC15';
    ctx.globalAlpha = (effects.highlight.opacity ?? 60) / 100;
    const padX = 4 * scale;
    const hY = baselineY - token.fontSize * 0.88;
    const hH = token.fontSize * 1.15;
    ctx.fillRect(tokenX - padX, hY, token.width + padX * 2, hH);
    ctx.restore();
  }

  if (effects.pill?.enabled) {
    ctx.save();
    ctx.fillStyle = effects.pill.color || '#1A1A22';
    ctx.globalAlpha = (effects.pill.opacity ?? 90) / 100;
    const padX = 6 * scale;
    const padY = 3 * scale;
    const radius = Math.min(12 * scale, (effects.pill.spread ?? 50) * 0.2 * scale);
    const pX = tokenX - padX;
    const pY = baselineY - token.fontSize * 0.85 - padY;
    const pW = token.width + padX * 2;
    const pH = token.fontSize * 1.1 + padY * 2;
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(pX, pY, pW, pH, radius);
    } else {
      ctx.rect(pX, pY, pW, pH);
    }
    ctx.fill();
    ctx.restore();
  }

  // 2. SHADOWS, EXTRUDE, ECHO, GLITCH, CHROMATIC, DOUBLE EXPOSURE
  if (effects.extrude?.enabled) {
    ctx.save();
    const depth = ((effects.extrude.intensity ?? 50) / 100) * 10 * scale + 2 * scale;
    const angleRad = ((effects.extrude.angle ?? 45) * Math.PI) / 180;
    const steps = 6;
    ctx.fillStyle = effects.extrude.color || '#000000';
    ctx.globalAlpha = (effects.extrude.opacity ?? 90) / 100;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * depth;
      ctx.fillText(token.text, tokenX + Math.cos(angleRad) * t, baselineY + Math.sin(angleRad) * t);
    }
    ctx.restore();
  }

  if (effects.echo?.enabled) {
    ctx.save();
    const count = 3;
    const spread = ((effects.echo.spread ?? 50) / 100) * 8 * scale + 2 * scale;
    const angleRad = ((effects.echo.angle ?? 45) * Math.PI) / 180;
    for (let i = 1; i <= count; i++) {
      ctx.fillStyle = effects.echo.color || token.color || '#FFF8E7';
      ctx.globalAlpha = ((effects.echo.opacity ?? 50) / 100) / (i + 0.5);
      ctx.fillText(token.text, tokenX + Math.cos(angleRad) * spread * i, baselineY + Math.sin(angleRad) * spread * i);
    }
    ctx.restore();
  }

  if (effects.glitch?.enabled) {
    ctx.save();
    const dist = (((effects.glitch.intensity ?? 50) / 100) * 6 + 1.5) * scale;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#FF0033';
    ctx.fillText(token.text, tokenX - dist, baselineY);
    ctx.fillStyle = '#00F0FF';
    ctx.fillText(token.text, tokenX + dist, baselineY);
    ctx.restore();
  }

  if (effects.chromatic?.enabled) {
    ctx.save();
    const dist = (((effects.chromatic.intensity ?? 50) / 100) * 5 + 1.5) * scale;
    const angleRad = ((effects.chromatic.angle ?? 0) * Math.PI) / 180;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#FF0000';
    ctx.fillText(token.text, tokenX + Math.cos(angleRad) * dist, baselineY + Math.sin(angleRad) * dist);
    ctx.fillStyle = '#0000FF';
    ctx.fillText(token.text, tokenX - Math.cos(angleRad) * dist, baselineY - Math.sin(angleRad) * dist);
    ctx.restore();
  }

  if (effects.doubleExposure?.enabled) {
    ctx.save();
    const dist = (((effects.doubleExposure.intensity ?? 50) / 100) * 7 + 2) * scale;
    ctx.globalAlpha = (effects.doubleExposure.opacity ?? 60) / 100;
    ctx.fillStyle = effects.doubleExposure.color || '#FF3366';
    ctx.fillText(token.text, tokenX + dist, baselineY + dist * 0.5);
    ctx.restore();
  }

  if (effects.lift?.enabled) {
    ctx.save();
    ctx.shadowColor = effects.lift.color || 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = (effects.lift.blur ?? 12) * scale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6 * scale;
    ctx.fillText(token.text, tokenX, baselineY);
    ctx.restore();
  }

  if (effects.hardShadow?.enabled) {
    ctx.save();
    ctx.fillStyle = effects.hardShadow.color || '#000000';
    ctx.globalAlpha = (effects.hardShadow.opacity ?? 100) / 100;
    const dist = (((effects.hardShadow.intensity ?? 50) / 100) * 6 + 2) * scale;
    const angleRad = ((effects.hardShadow.angle ?? 45) * Math.PI) / 180;
    ctx.fillText(token.text, tokenX + Math.cos(angleRad) * dist, baselineY + Math.sin(angleRad) * dist);
    ctx.restore();
  }

  if (effects.splice?.enabled) {
    ctx.save();
    ctx.fillStyle = effects.splice.color2 || '#E63946';
    const dist = 3.5 * scale;
    ctx.fillText(token.text, tokenX + dist, baselineY + dist);
    ctx.strokeStyle = effects.splice.color || '#000000';
    ctx.lineWidth = 2 * scale;
    ctx.strokeText(token.text, tokenX, baselineY);
    ctx.restore();
  }

  if (effects.shadow?.enabled) {
    ctx.save();
    ctx.shadowColor = effects.shadow.color || '#000000';
    ctx.globalAlpha = (effects.shadow.opacity ?? 100) / 100;
    ctx.shadowBlur = (effects.shadow.blur !== undefined ? effects.shadow.blur : 6) * scale;
    ctx.shadowOffsetX = (effects.shadow.offsetX !== undefined ? effects.shadow.offsetX : 3) * scale;
    ctx.shadowOffsetY = (effects.shadow.offsetY !== undefined ? effects.shadow.offsetY : 3) * scale;
    ctx.fillText(token.text, tokenX, baselineY);
    ctx.restore();
  } else if (box.shadow) {
    ctx.save();
    ctx.shadowColor = box.shadow.color;
    ctx.shadowBlur = box.shadow.blur * scale;
    ctx.shadowOffsetX = box.shadow.offsetX * scale;
    ctx.shadowOffsetY = box.shadow.offsetY * scale;
    ctx.fillText(token.text, tokenX, baselineY);
    ctx.restore();
  }

  // 3. GLOW & NEON
  if (effects.glow?.enabled) {
    ctx.save();
    ctx.shadowColor = effects.glow.color || '#D4AF37';
    ctx.globalAlpha = (effects.glow.opacity ?? 100) / 100;
    const strength =
      effects.glow.strength ||
      effects.glow.blur ||
      (((effects.glow.intensity ?? 50) / 100) * 20 + 6);
    for (let p = 1; p <= 3; p++) {
      ctx.shadowBlur = (strength * scale * p) / 2;
      ctx.fillText(token.text, tokenX, baselineY);
    }
    ctx.restore();
  }

  if (effects.neon?.enabled) {
    ctx.save();
    const neonCol = effects.neon.color || '#00FFCC';
    ctx.shadowColor = neonCol;
    ctx.globalAlpha = (effects.neon.opacity ?? 100) / 100;
    const blur = (effects.neon.blur !== undefined ? effects.neon.blur : 16) * scale;
    ctx.shadowBlur = blur;
    ctx.fillText(token.text, tokenX, baselineY);
    ctx.shadowBlur = blur / 2;
    ctx.fillText(token.text, tokenX, baselineY);
    ctx.strokeStyle = neonCol;
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeText(token.text, tokenX, baselineY);
    ctx.restore();
  }

  // 4. OUTLINE (Under fill so letters stay sharp)
  if (effects.outline?.enabled) {
    ctx.save();
    ctx.strokeStyle = effects.outline.color || '#000000';
    ctx.globalAlpha = (effects.outline.opacity ?? 100) / 100;
    const w =
      effects.outline.width !== undefined
        ? effects.outline.width
        : (((effects.outline.intensity ?? 50) / 100) * 3 + 1);
    ctx.lineWidth = w * scale * 2;
    ctx.strokeText(token.text, tokenX, baselineY);
    ctx.restore();
  } else if (box.stroke && box.stroke.width > 0) {
    ctx.save();
    ctx.strokeStyle = box.stroke.color;
    ctx.lineWidth = box.stroke.width * scale * 2;
    ctx.strokeText(token.text, tokenX, baselineY);
    ctx.restore();
  }

  // 5. FILL (Gradient, Hollow, Wavy, Neon bright core, or normal fill)
  if (effects.hollow?.enabled) {
    ctx.save();
    ctx.strokeStyle = effects.hollow.color || token.color || '#FFF8E7';
    ctx.globalAlpha = (effects.hollow.opacity ?? 100) / 100;
    const w = effects.hollow.width !== undefined ? effects.hollow.width : 2;
    ctx.lineWidth = Math.max(1, Math.round(w * scale));
    ctx.strokeText(token.text, tokenX, baselineY);
    ctx.restore();
  } else if (effects.gradient?.enabled) {
    ctx.save();
    const angleRad = ((effects.gradient.angle ?? 90) * Math.PI) / 180;
    const grad = ctx.createLinearGradient(
      tokenX,
      baselineY - token.fontSize,
      tokenX + Math.cos(angleRad) * token.width,
      baselineY + Math.sin(angleRad) * token.fontSize
    );
    const c1 = effects.gradient.color || token.color || '#D4AF37';
    const c2 = effects.gradient.color2 || '#FFFFFF';
    const c3 = effects.gradient.color3;

    grad.addColorStop(0, c1);
    if (c3) {
      grad.addColorStop(0.5, c2);
      grad.addColorStop(1, c3);
    } else {
      grad.addColorStop(1, c2);
    }
    ctx.fillStyle = grad;
    ctx.fillText(token.text, tokenX, baselineY);
    ctx.restore();
  } else if (effects.wavy?.enabled) {
    ctx.save();
    ctx.fillStyle = token.color || '#FFF8E7';
    const amp = (((effects.wavy.intensity ?? 50) / 100) * 8 + 2) * scale;
    const freq = ((effects.wavy.spread ?? 50) / 100) * 0.4 + 0.2;
    let charX = tokenX;
    for (let c = 0; c < token.text.length; c++) {
      const ch = token.text[c];
      const chW = ctx.measureText(ch).width;
      const waveY = Math.sin(c * freq) * amp;
      ctx.fillText(ch, charX, baselineY + waveY);
      charX += chW;
    }
    ctx.restore();
  } else if (effects.neon?.enabled) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(token.text, tokenX, baselineY);
    ctx.restore();
  } else {
    ctx.fillStyle = token.color || '#FFF8E7';
    ctx.fillText(token.text, tokenX, baselineY);
    if (token.fontWeight === '800') {
      ctx.save();
      ctx.lineWidth = Math.max(0.6 * scale, 0.4);
      ctx.strokeStyle = token.color || '#FFF8E7';
      ctx.strokeText(token.text, tokenX, baselineY);
      ctx.restore();
    }
  }

  // 6. PROCEDURAL TEXTURES (Chalk, Ink, Fabric)
  if (effects.chalk?.enabled) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const count = Math.round((token.text.length * 15 * (effects.chalk.intensity ?? 50)) / 100) + 10;
    for (let i = 0; i < count; i++) {
      const sx = tokenX + rand() * token.width;
      const sy = baselineY - token.fontSize * 0.85 + rand() * token.fontSize;
      const r = rand() * 1.5 * scale + 0.5 * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (effects.ink?.enabled) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const count = Math.round((token.text.length * 8 * (effects.ink.intensity ?? 50)) / 100) + 4;
    for (let i = 0; i < count; i++) {
      const sx = tokenX + rand() * token.width;
      const sy = baselineY - token.fontSize * 0.8 + rand() * token.fontSize;
      const r = rand() * 2 * scale + 1 * scale;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (effects.fabric?.enabled) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = ((effects.fabric.intensity ?? 50) / 100) * 0.45;
    ctx.lineWidth = 1 * scale;
    const spacing = ((effects.fabric.spread ?? 50) / 100) * 6 * scale + 3 * scale;
    for (let x = tokenX; x < tokenX + token.width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, baselineY - token.fontSize);
      ctx.lineTo(x, baselineY + token.fontSize * 0.3);
      ctx.stroke();
    }
    for (let y = baselineY - token.fontSize; y < baselineY + token.fontSize * 0.3; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(tokenX, y);
      ctx.lineTo(tokenX + token.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 7. ARTISTIC & LIQUID (Stencil, Halftone, Droplets, Melting, Dripping)
  if (effects.stencil?.enabled) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const gapW = (((effects.stencil.spread ?? 50) / 100) * 3 + 1.5) * scale;
    const cuts = Math.min(3, Math.max(1, Math.floor(token.text.length / 2)));
    for (let i = 1; i <= cuts; i++) {
      const cutX = tokenX + (token.width / (cuts + 1)) * i;
      ctx.fillRect(cutX - gapW / 2, baselineY - token.fontSize * 0.9, gapW, token.fontSize * 1.2);
    }
    ctx.restore();
  }

  if (effects.halftone?.enabled) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const dotSpacing = (((effects.halftone.spread ?? 50) / 100) * 5 + 3) * scale;
    const dotRadius = Math.max(0.6 * scale, dotSpacing * 0.22);
    for (let x = tokenX; x < tokenX + token.width; x += dotSpacing) {
      for (let y = baselineY - token.fontSize * 0.85; y < baselineY + token.fontSize * 0.25; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  if (effects.droplets?.enabled) {
    ctx.save();
    const count = Math.min(6, Math.max(2, Math.floor(token.text.length * 0.8)));
    for (let i = 0; i < count; i++) {
      const dx = tokenX + rand() * token.width;
      const dy = baselineY - token.fontSize * 0.7 + rand() * (token.fontSize * 0.8);
      const dr = (rand() * 2 + 1.5) * scale;
      // Drop body
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 2 * scale;
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fill();
      // Specular highlight
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(dx - dr * 0.3, dy - dr * 0.3, dr * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (effects.dripping?.enabled || effects.melting?.enabled) {
    ctx.save();
    const dripLen = (((effects.dripping?.intensity || effects.melting?.intensity || 50) / 100) * 14 + 4) * scale;
    const dripColor = token.color || '#FFF8E7';
    ctx.fillStyle = dripColor;
    const numDrips = Math.max(2, Math.floor(token.text.length / 2));
    for (let i = 0; i < numDrips; i++) {
      const dripX = tokenX + rand() * (token.width - 4 * scale) + 2 * scale;
      const len = rand() * dripLen + 2 * scale;
      const radius = (rand() * 1.5 + 1.2) * scale;
      ctx.beginPath();
      ctx.moveTo(dripX - radius * 0.8, baselineY);
      ctx.lineTo(dripX - radius * 0.5, baselineY + len - radius);
      ctx.arc(dripX, baselineY + len, radius, 0, Math.PI);
      ctx.lineTo(dripX + radius * 0.8, baselineY);
      ctx.fill();
    }
    ctx.restore();
  }

  // 8. UNDERLINE & STRIKETHROUGH
  if (token.underline) {
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = token.color || '#FFF8E7';
    ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
    ctx.beginPath();
    ctx.moveTo(tokenX, baselineY + 3 * scale);
    ctx.lineTo(tokenX + token.width, baselineY + 3 * scale);
    ctx.stroke();
    ctx.restore();
  }

  if (token.strike) {
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = token.color || '#FFF8E7';
    ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
    const strikeY = baselineY - token.fontSize * 0.32;
    ctx.beginPath();
    ctx.moveTo(tokenX, strikeY);
    ctx.lineTo(tokenX + token.width, strikeY);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draw Geometric Shape (Rectangle, Square, Circle, Triangle, Star)
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shapeType: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  fillColor: string,
  strokeColor?: string,
  strokeWidth?: number
) {
  ctx.save();
  ctx.fillStyle = fillColor || '#000000';
  if (strokeColor && strokeWidth && strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
  }
  const cx = boxX + boxW / 2;
  const cy = boxY + boxH / 2;

  ctx.beginPath();
  switch (shapeType) {
    case 'square': {
      const side = Math.min(boxW, boxH);
      const sx = cx - side / 2;
      const sy = cy - side / 2;
      ctx.rect(sx, sy, side, side);
      break;
    }
    case 'circle': {
      const r = Math.min(boxW, boxH) / 2;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    }
    case 'triangle': {
      ctx.moveTo(cx, boxY);
      ctx.lineTo(boxX + boxW, boxY + boxH);
      ctx.lineTo(boxX, boxY + boxH);
      ctx.closePath();
      break;
    }
    case 'star': {
      const outerR = Math.min(boxW, boxH) / 2;
      const innerR = outerR * 0.45;
      const spikes = 5;
      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;
      ctx.moveTo(cx, cy - outerR);
      for (let i = 0; i < spikes; i++) {
        let x = cx + Math.cos(rot) * outerR;
        let y = cy + Math.sin(rot) * outerR;
        ctx.lineTo(x, y);
        rot += step;
        x = cx + Math.cos(rot) * innerR;
        y = cy + Math.sin(rot) * innerR;
        ctx.lineTo(x, y);
        rot += step;
      }
      ctx.closePath();
      break;
    }
    case 'rectangle':
    default: {
      ctx.rect(boxX, boxY, boxW, boxH);
      break;
    }
  }
  ctx.fill();
  if (strokeColor && strokeWidth && strokeWidth > 0) {
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw Horizontal Divider Line
 */
export function drawHorizontalLine(
  ctx: CanvasRenderingContext2D,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  color: string,
  lineWidth: number
) {
  ctx.save();
  ctx.strokeStyle = color || '#000000';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  const midY = boxY + boxH / 2;
  ctx.beginPath();
  ctx.moveTo(boxX, midY);
  ctx.lineTo(boxX + boxW, midY);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw Structured Table
 */
export function drawTable(
  ctx: CanvasRenderingContext2D,
  box: TextBoxTemplate,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  scale: number
) {
  const rows = box.tableRows || 3;
  const cols = box.tableCols || 3;
  const cellW = boxW / cols;
  const cellH = boxH / rows;
  const data = box.tableData || [
    ['Header 1', 'Header 2', 'Header 3'],
    ['Row 1, Col 1', 'Row 1, Col 2', 'Row 1, Col 3'],
    ['Row 2, Col 1', 'Row 2, Col 2', 'Row 2, Col 3'],
  ];

  ctx.save();
  ctx.fillStyle = box.fillColor || 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  ctx.strokeStyle = box.strokeColor || '#D4AF37';
  ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  for (let c = 1; c < cols; c++) {
    const x = boxX + c * cellW;
    ctx.beginPath();
    ctx.moveTo(x, boxY);
    ctx.lineTo(x, boxY + boxH);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = boxY + r * cellH;
    ctx.beginPath();
    ctx.moveTo(boxX, y);
    ctx.lineTo(boxX + boxW, y);
    ctx.stroke();
  }

  const fontSize = Math.max(9, Math.round((box.fontSize || 14) * scale));
  ctx.font = `600 ${fontSize}px "${box.fontFamily || 'Plus Jakarta Sans'}", sans-serif`;
  ctx.fillStyle = box.color || '#FFF8E7';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellText = data[r]?.[c] || `Cell ${r + 1},${c + 1}`;
      const cx = boxX + c * cellW + cellW / 2;
      const cy = boxY + r * cellH + cellH / 2;
      ctx.fillText(cellText, cx, cy);
    }
  }
  ctx.restore();
}

export interface RenderCanvasOptions {
  showBoundingBoxes?: boolean;
  selectedBoxId?: string | null;
  editingBoxId?: string | null;
  targetWidth?: number; // Screen-res preview width
  targetHeight?: number;
  dpr?: number; // Optional explicit DPR multiplier (defaults to window.devicePixelRatio)
  isExport?: boolean; // When true, dpr is locked to 1 for exact native file export
}

/**
 * Shared Canvas Renderer: renders design to an HTMLCanvasElement
 * - High-Density (Retina) Canvas Buffer Scaling (window.devicePixelRatio)
 * - Hardware Acceleration & Sub-pixel Antialiasing
 * - Integer Pixel Snapping for crystal-clear text and element edges
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

  // 1. Integer-snapped layout dimensions
  const targetW = Math.round(options.targetWidth || nativeW);
  const targetH = Math.round(options.targetHeight || Math.round(targetW * (nativeH / nativeW)));

  // 2. High-Density (Retina) Buffer Scaling:
  // Scale HTML5 canvas drawing buffers dynamically by window.devicePixelRatio
  const dpr = options.isExport
    ? 1
    : (options.dpr ?? (typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1));

  const bufferW = Math.round(targetW * dpr);
  const bufferH = Math.round(targetH * dpr);

  if (canvas.width !== bufferW || canvas.height !== bufferH) {
    canvas.width = bufferW;
    canvas.height = bufferH;
  }

  // Constrain CSS display size to match layout dimensions
  canvas.style.width = `${targetW}px`;
  canvas.style.height = `${targetH}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not obtain 2D canvas context');

  // Apply context scaling (ctx.scale(dpr, dpr) via setTransform) to normalize coordinate systems and eliminate pixelation
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Sub-pixel antialiasing & image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.clearRect(0, 0, targetW, targetH);

  // 3. Draw Background Image with integer bounds
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const scale = targetW / 1000;

  // 4. Render Elements (Text, Shapes, Tables, Lines, Overlays) with Integer Pixel Snapping
  for (const box of boxesToRender) {
    const layout = computeTextBoxLayout(ctx, box, page, targetW, targetH);
    const { lines, boxX, boxY, boxW, computedHeightPx, scaledPadding } = layout;

    const cx = Math.round(boxX + boxW / 2);
    const cy = Math.round(boxY + computedHeightPx / 2);
    const hasRotation = typeof box.rotation === 'number' && box.rotation !== 0;

    ctx.save();
    if (hasRotation && typeof box.rotation === 'number') {
      ctx.translate(cx, cy);
      ctx.rotate((box.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    if (box.elementType === 'shape') {
      drawShape(
        ctx,
        box.shapeType || 'rectangle',
        boxX,
        boxY,
        boxW,
        computedHeightPx,
        box.fillColor || box.color || '#000000',
        box.strokeColor,
        box.strokeWidth ? box.strokeWidth * scale : undefined
      );
    } else if (box.elementType === 'line') {
      drawHorizontalLine(
        ctx,
        boxX,
        boxY,
        boxW,
        computedHeightPx,
        box.color || '#000000',
        Math.max(2, Math.round((box.strokeWidth || 3) * scale))
      );
    } else if (box.elementType === 'table') {
      drawTable(ctx, box, boxX, boxY, boxW, computedHeightPx, scale);
    } else if (box.elementType === 'image_overlay') {
      if (box.imageOverlayId) {
        const overlayImg = decodedImageCache.get(box.imageOverlayId);
        if (overlayImg && overlayImg.complete) {
          ctx.drawImage(overlayImg, boxX, boxY, boxW, computedHeightPx);
        } else {
          ctx.strokeStyle = '#D4AF37';
          ctx.lineWidth = 1;
          ctx.strokeRect(boxX, boxY, boxW, computedHeightPx);
        }
      }
    } else {
      // Standard Text Box
      // If user is actively editing this box in-place, skip canvas drawing to eliminate double layering!
      if (options.editingBoxId && box.id === options.editingBoxId) {
        ctx.restore();
        continue;
      }

      if (box.fill && box.fill.opacity > 0) {
        ctx.fillStyle = box.fill.color;
        ctx.globalAlpha = box.fill.opacity;
        ctx.fillRect(boxX, boxY, boxW, computedHeightPx);
        ctx.globalAlpha = 1.0;
      }

      let currentY = boxY + scaledPadding;

      for (const line of lines) {
        const baselineY = Math.round(currentY + line.maxFontSize);

        let lineStartX = Math.round(boxX + scaledPadding);
        if (box.textAlign === 'center') {
          lineStartX = Math.round(boxX + (boxW - line.width) / 2);
        } else if (box.textAlign === 'right') {
          lineStartX = Math.round(boxX + boxW - scaledPadding - line.width);
        }

        let tokenX = lineStartX;

        for (const token of line.tokens) {
          if (token.isWhitespace && token.text.trim() === '') {
            tokenX += Math.round(token.width);
            continue;
          }

          drawStyledTokenWithEffects(ctx, token, Math.round(tokenX), baselineY, scale, box);
          tokenX += Math.round(token.width);
        }

        currentY += line.height;
      }
    }

    // 5. Optional Selection Outline: Strictly fits computed element size
    if (options.showBoundingBoxes) {
      const isSelected = options.selectedBoxId === box.id;
      ctx.save();
      ctx.strokeStyle = isSelected ? '#D4AF37' : 'rgba(212, 175, 55, 0.45)';
      ctx.lineWidth = isSelected ? 2 : 1;
      if (!isSelected) {
        ctx.setLineDash([4, 4]);
      }

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
          ctx.arc(Math.round(hx), Math.round(hy), handleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        };

        const drawPillHandle = (px: number, py: number, isVertical: boolean) => {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 3;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#D4AF37';
          ctx.lineWidth = 1.5;
          const pw = Math.round(isVertical ? 6 * scale : 18 * scale);
          const ph = Math.round(isVertical ? 18 * scale : 6 * scale);
          ctx.beginPath();
          ctx.roundRect(Math.round(px - pw / 2), Math.round(py - ph / 2), pw, ph, 3);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        };

        // 4 Edge Midpoint Pill Handles (W, E, N, S)
        drawPillHandle(boxX, boxY + Math.round(computedHeightPx / 2), true); // W
        drawPillHandle(boxX + boxW, boxY + Math.round(computedHeightPx / 2), true); // E
        drawPillHandle(boxX + Math.round(boxW / 2), boxY, false); // N
        drawPillHandle(boxX + Math.round(boxW / 2), boxY + computedHeightPx, false); // S

        // 4 Corner handles
        drawHandle(boxX, boxY); // NW
        drawHandle(boxX + boxW, boxY); // NE
        drawHandle(boxX + boxW, boxY + computedHeightPx); // SE
        drawHandle(boxX, boxY + computedHeightPx); // SW

        // Floating badge
        const badgeLabel = box.elementType === 'shape'
          ? (box.shapeType ? box.shapeType.toUpperCase() : 'SHAPE')
          : box.fieldLabel;
        const badgeText = `${badgeLabel} (${box.width}%)${box.rotation ? ` ${box.rotation}°` : ''}`;
        ctx.font = `600 ${Math.max(10, Math.round(11 * scale))}px "Plus Jakarta Sans", sans-serif`;
        const badgeW = Math.round(ctx.measureText(badgeText).width + 12);
        const badgeH = Math.round(Math.max(16, Math.round(18 * scale)));
        const badgeX = boxX;
        const badgeY = Math.round(Math.max(0, boxY - badgeH - 4));

        ctx.fillStyle = '#17171C';
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#D4AF37';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, badgeX + 6, Math.round(badgeY + badgeH / 2));
      }
      ctx.restore();
    }

    ctx.restore(); // Restore rotation context
  }
}
