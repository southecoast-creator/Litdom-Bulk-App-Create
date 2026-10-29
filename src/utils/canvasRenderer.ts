/**
 * Litdom Batch Studio - Canvas Rendering Engine
 * High-resolution 1:1 render fidelity, font loader, text wrapping, and overflow detection.
 */
import { PageDesign, TextBox, CustomFont } from '../types';

export const BUILTIN_FONTS = [
  { name: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans', sans-serif", category: 'Modern Sans' },
  { name: 'Cinzel (Luxury Serif)', family: "'Cinzel', serif", category: 'Display Serif' },
  { name: 'Playfair Display', family: "'Playfair Display', serif", category: 'Editorial Serif' },
  { name: 'Montserrat', family: "'Montserrat', sans-serif", category: 'Clean Sans' },
  { name: 'Space Mono', family: "'Space Mono', monospace", category: 'Monospace' },
  { name: 'Georgia', family: 'Georgia, serif', category: 'Classic Serif' },
  { name: 'Arial', family: 'Arial, sans-serif', category: 'System Sans' },
  { name: 'Times New Roman', family: "'Times New Roman', serif", category: 'System Serif' },
  { name: 'Courier New', family: "'Courier New', monospace", category: 'System Mono' },
  { name: 'Impact', family: 'Impact, sans-serif', category: 'Bold Display' },
];

/**
 * Register custom font with the browser's FontFace API
 */
export async function registerCustomFont(font: CustomFont): Promise<boolean> {
  if (!font.dataUrl) return false;

  try {
    const fontFace = new FontFace(font.familyName, `url(${font.dataUrl})`);
    const loadedFace = await fontFace.load();
    document.fonts.add(loadedFace);
    return true;
  } catch (err) {
    console.warn(`Could not load custom font ${font.familyName}:`, err);
    return false;
  }
}

/**
 * Load image as HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load background image: ${src}`));
    img.src = src;
  });
}

/**
 * Wrap text into lines based on box width
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [''];

  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }

    const words = para.split(' ');
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = `${currentLine} ${word}`;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Render a design page onto an HTML5 Canvas at full 1:1 original resolution
 */
export async function renderPageToCanvas(
  page: PageDesign,
  options?: {
    showBoundingBoxes?: boolean;
    activeBoxId?: string;
    scale?: number;
  }
): Promise<{
  canvas: HTMLCanvasElement;
  overflowingBoxIds: string[];
}> {
  const canvas = document.createElement('canvas');
  const scale = options?.scale || 1;

  const targetWidth = Math.max(100, Math.round((page.originalWidth || 1080) * scale));
  const targetHeight = Math.max(100, Math.round((page.originalHeight || 1350) * scale));

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Fill dark background first in case image is loading or transparent
  ctx.fillStyle = '#0B0B0F';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Draw background image if available
  if (page.imageUrl) {
    try {
      const img = await loadImage(page.imageUrl);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    } catch (err) {
      console.warn('Could not render background image:', err);
      // Fallback elegant background
      ctx.fillStyle = '#17171C';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.strokeStyle = '#8C7625';
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(20 * scale, 20 * scale, targetWidth - 40 * scale, targetHeight - 40 * scale);
    }
  }

  const overflowingBoxIds: string[] = [];

  // Wait for all fonts if possible
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Continue anyway
    }
  }

  // Draw each text box
  for (const box of page.textBoxes) {
    const boxX = (box.x / 100) * targetWidth;
    const boxY = (box.y / 100) * targetHeight;
    const boxW = (box.width / 100) * targetWidth;
    const boxH = (box.height / 100) * targetHeight;
    const padding = (box.padding || 8) * scale;
    const innerW = Math.max(10, boxW - padding * 2);
    const innerH = Math.max(10, boxH - padding * 2);

    // Optional background fill for box
    if (box.backgroundColor && box.backgroundColor !== 'transparent') {
      ctx.save();
      ctx.fillStyle = box.backgroundColor;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.restore();
    }

    // Measure and render text
    const scaledFontSize = Math.max(8, box.fontSize * scale);
    const fontStyleStr = box.fontStyle === 'italic' ? 'italic' : 'normal';
    const fontWeightStr = box.fontWeight || '400';
    const fontFamilyStr = box.fontFamily || 'Plus Jakarta Sans';

    ctx.save();
    ctx.font = `${fontStyleStr} ${fontWeightStr} ${scaledFontSize}px ${fontFamilyStr}, sans-serif`;
    ctx.textBaseline = 'top';

    const lines = wrapText(ctx, box.content || '', innerW);
    const lineSpacing = scaledFontSize * (box.lineHeight || 1.3);
    const totalTextHeight = lines.length * lineSpacing;

    // Check overflow
    const isOverflowing = totalTextHeight > innerH + 4 * scale;
    if (isOverflowing) {
      overflowingBoxIds.push(box.id);
    }

    // Configure shadow
    if (box.shadow && (box.shadow.blur > 0 || box.shadow.offsetX !== 0 || box.shadow.offsetY !== 0)) {
      ctx.shadowColor = box.shadow.color;
      ctx.shadowBlur = box.shadow.blur * scale;
      ctx.shadowOffsetX = box.shadow.offsetX * scale;
      ctx.shadowOffsetY = box.shadow.offsetY * scale;
    }

    // Render each line
    lines.forEach((line, index) => {
      const lineY = boxY + padding + index * lineSpacing;

      // Skip lines that overflow if we aren't showing bounding boxes (or allow them to render softly)
      let lineX = boxX + padding;
      if (box.textAlign === 'center') {
        ctx.textAlign = 'center';
        lineX = boxX + boxW / 2;
      } else if (box.textAlign === 'right') {
        ctx.textAlign = 'right';
        lineX = boxX + boxW - padding;
      } else {
        ctx.textAlign = 'left';
        lineX = boxX + padding;
      }

      // Stroke outline if present
      if (box.stroke && box.stroke.width > 0) {
        ctx.save();
        ctx.strokeStyle = box.stroke.color;
        ctx.lineWidth = box.stroke.width * 2 * scale;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, lineX, lineY);
        ctx.restore();
      }

      // Main text fill
      ctx.fillStyle = box.color || '#FFF8E7';
      ctx.fillText(line, lineX, lineY);
    });

    ctx.restore();

    // Editor bounding boxes (for preview editor mode)
    if (options?.showBoundingBoxes) {
      ctx.save();
      const isActive = options.activeBoxId === box.id;
      ctx.strokeStyle = isActive ? '#D4AF37' : 'rgba(212, 175, 55, 0.45)';
      ctx.lineWidth = (isActive ? 2 : 1) * scale;
      ctx.setLineDash(isActive ? [] : [4 * scale, 3 * scale]);
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Label tag above box
      ctx.font = `600 ${Math.max(10, 11 * scale)}px sans-serif`;
      const labelText = box.fieldLabel || 'UNTITLED';
      const labelMetrics = ctx.measureText(labelText);
      const labelBadgeW = labelMetrics.width + 12 * scale;
      const labelBadgeH = 18 * scale;

      ctx.fillStyle = isActive ? '#D4AF37' : '#17171C';
      ctx.fillRect(boxX, Math.max(0, boxY - labelBadgeH), labelBadgeW, labelBadgeH);

      ctx.fillStyle = isActive ? '#0B0B0F' : '#F4D58D';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(labelText, boxX + 6 * scale, Math.max(0, boxY - labelBadgeH) + labelBadgeH / 2);

      // Overflow indicator badge if text exceeds box height
      if (isOverflowing) {
        ctx.fillStyle = '#EF4444';
        const warnText = '! OVERFLOW';
        const warnMetrics = ctx.measureText(warnText);
        const warnW = warnMetrics.width + 10 * scale;
        ctx.fillRect(boxX + boxW - warnW, Math.max(0, boxY - labelBadgeH), warnW, labelBadgeH);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(warnText, boxX + boxW - warnW + 5 * scale, Math.max(0, boxY - labelBadgeH) + labelBadgeH / 2);
      }

      ctx.restore();
    }
  }

  return { canvas, overflowingBoxIds };
}

/**
 * Check if any font used in the project is missing in the browser
 */
export function checkFontAvailability(fontFamily: string): boolean {
  if (!fontFamily) return true;
  // If font contains standard system fonts, it's available
  const common = ['Arial', 'Georgia', 'Times New Roman', 'Impact', 'Courier New', 'sans-serif', 'serif', 'monospace'];
  if (common.some((c) => fontFamily.includes(c))) return true;

  if (document.fonts && document.fonts.check) {
    try {
      return document.fonts.check(`16px "${fontFamily}"`);
    } catch {
      return true;
    }
  }
  return true;
}
