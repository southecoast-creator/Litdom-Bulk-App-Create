/**
 * Litdom Batch Studio - Canvas Rendering Engine
 * Shared 1:1 renderer for screen-resolution preview and full-resolution export.
 * Scales typography from 1000px baseline, explicitly preloads fonts,
 * caches decoded background images, and renders with precise letterSpacing and styling.
 */

import { TextBoxTemplate, DesignPage } from '../types';
import { ensureFontLoaded } from './fontManager';

export interface BuiltinFont {
  name: string;
  category: 'Serif' | 'Sans' | 'Display' | 'Mono';
}

export const BUILTIN_FONTS: BuiltinFont[] = [
  { name: 'Plus Jakarta Sans', category: 'Sans' },
  { name: 'Cinzel', category: 'Display' },
  { name: 'Montserrat', category: 'Sans' },
  { name: 'Playfair Display', category: 'Serif' },
  { name: 'DM Sans', category: 'Sans' },
  { name: 'Outfit', category: 'Sans' },
  { name: 'Manrope', category: 'Sans' },
  { name: 'Cormorant Garamond', category: 'Serif' },
  { name: 'Oswald', category: 'Display' },
  { name: 'JetBrains Mono', category: 'Mono' },
];

// Decoded Image Cache for 60fps interaction during dragging
const decodedImageCache = new Map<string, HTMLImageElement>();

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
 * Explicitly await document.fonts.load for all fonts used in the template
 */
export async function preloadTemplateFonts(template: TextBoxTemplate[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;

  const loadPromises = template.map(async (box) => {
    try {
      await ensureFontLoaded(box.fontFamily);
      const style = box.fontStyle || 'normal';
      const weight = box.fontWeight || '400';
      const fontSpec = `${style} ${weight} 32px "${box.fontFamily}"`;
      await document.fonts.load(fontSpec);
    } catch {
      // safe fallback if offline or local font loading
    }
  });

  await Promise.all(loadPromises);
}


/**
 * Word wrap helper calculating line segments within maxWidth
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];

  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

export interface RenderCanvasOptions {
  showBoundingBoxes?: boolean;
  selectedBoxId?: string | null;
  targetWidth?: number; // Screen-res preview width
  targetHeight?: number;
}

/**
 * Shared Canvas Renderer: renders design to an HTMLCanvasElement
 */
export async function renderDesignToCanvas(
  canvas: HTMLCanvasElement,
  template: TextBoxTemplate[],
  page: DesignPage,
  imageSrcOrBlob: string | Blob,
  options: RenderCanvasOptions = {}
): Promise<void> {
  // Ensure fonts are explicitly loaded
  await preloadTemplateFonts(template);

  // Load decoded background image
  const img = await getOrLoadDecodedImage(page.imageId, imageSrcOrBlob);

  const nativeW = page.width || img.naturalWidth || 1000;
  const nativeH = page.height || img.naturalHeight || 1000;

  // Determine target canvas dimensions
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

  // 2. Proportional Scaling Baseline: fonts authored for 1000px wide
  const scale = targetW / 1000;

  // 3. Render Text Boxes
  for (const box of template) {
    const rawContent = page.values[box.fieldLabel];
    // If undefined, default to fieldLabel or placeholder; if empty string, render nothing
    const content = rawContent !== undefined ? rawContent : box.fieldLabel;

    const boxX = (box.x / 100) * targetW;
    const boxY = (box.y / 100) * targetH;
    const boxW = (box.width / 100) * targetW;
    const boxH = (box.height / 100) * targetH;

    const scaledFontSize = Math.max(6, Math.round(box.fontSize * scale));
    const scaledPadding = (box.padding || 0) * scale;
    const innerW = Math.max(10, boxW - scaledPadding * 2);

    ctx.save();

    // Optional Box Fill
    if (box.fill && box.fill.opacity > 0) {
      ctx.fillStyle = box.fill.color;
      ctx.globalAlpha = box.fill.opacity;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.globalAlpha = 1.0;
    }

    // Set font typography
    const fontStyle = box.fontStyle === 'italic' ? 'italic' : 'normal';
    const fontWeight = box.fontWeight || '400';
    ctx.font = `${fontStyle} ${fontWeight} ${scaledFontSize}px "${box.fontFamily}", sans-serif`;

    // Apply Letter Spacing
    if (box.letterSpacing && typeof (ctx as any).letterSpacing !== 'undefined') {
      (ctx as any).letterSpacing = `${box.letterSpacing * scale}px`;
    }

    // Optional Shadow
    if (box.shadow) {
      ctx.shadowColor = box.shadow.color;
      ctx.shadowBlur = box.shadow.blur * scale;
      ctx.shadowOffsetX = box.shadow.offsetX * scale;
      ctx.shadowOffsetY = box.shadow.offsetY * scale;
    }

    // Wrap Text into lines
    const lines = content ? wrapText(ctx, content, innerW) : [];
    const lineHeightPx = scaledFontSize * (box.lineHeight || 1.3);

    ctx.fillStyle = box.color || '#FFF8E7';

    // Vertical Positioning
    let startY = boxY + scaledPadding + scaledFontSize;

    // Horizontal Alignment
    for (const line of lines) {
      const lineMeasure = ctx.measureText(line).width;
      let lineX = boxX + scaledPadding;

      if (box.textAlign === 'center') {
        lineX = boxX + (boxW - lineMeasure) / 2;
      } else if (box.textAlign === 'right') {
        lineX = boxX + boxW - scaledPadding - lineMeasure;
      }

      // Optional Text Stroke / Outline
      if (box.stroke && box.stroke.width > 0) {
        ctx.strokeStyle = box.stroke.color;
        ctx.lineWidth = box.stroke.width * scale;
        ctx.strokeText(line, lineX, startY);
      }

      ctx.fillText(line, lineX, startY);
      startY += lineHeightPx;
    }

    ctx.restore();

    // Optional Interactive Bounding Box for Workspace
    if (options.showBoundingBoxes) {
      const isSelected = options.selectedBoxId === box.id;
      ctx.save();
      ctx.strokeStyle = isSelected ? '#D4AF37' : 'rgba(212, 175, 55, 0.45)';
      ctx.lineWidth = isSelected ? 2 : 1;
      if (!isSelected) {
        ctx.setLineDash([4, 4]);
      }
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      if (isSelected) {
        // Draw 4 Corner Handles with drop-shadow and white-gold contrast
        const cornerSize = Math.max(10, Math.min(16, Math.round(12 * scale)));
        const edgeSize = Math.max(8, Math.min(14, Math.round(10 * scale)));

        const drawHandle = (hx: number, hy: number, isCorner: boolean) => {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 4;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#D4AF37';
          ctx.lineWidth = 2.5;

          const size = isCorner ? cornerSize : edgeSize;
          ctx.beginPath();
          if (isCorner) {
            // Circle handle for corners
            ctx.arc(hx, hy, size / 2, 0, Math.PI * 2);
          } else {
            // Rounded rect/pill for edges
            ctx.arc(hx, hy, size / 2.5, 0, Math.PI * 2);
          }
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        };

        // 4 Corners (NW, NE, SE, SW)
        drawHandle(boxX, boxY, true); // NW
        drawHandle(boxX + boxW, boxY, true); // NE
        drawHandle(boxX + boxW, boxY + boxH, true); // SE
        drawHandle(boxX, boxY + boxH, true); // SW

        // 4 Edge Midpoints (N, E, S, W)
        drawHandle(boxX + boxW / 2, boxY, false); // N
        drawHandle(boxX + boxW, boxY + boxH / 2, false); // E
        drawHandle(boxX + boxW / 2, boxY + boxH, false); // S
        drawHandle(boxX, boxY + boxH / 2, false); // W

        // Small top badge with field label and dimensions
        const badgeText = `${box.fieldLabel} (${box.width}% × ${box.height}%)`;
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

