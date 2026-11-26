/**
 * Litdom Batch Studio - Local background removal (no network, no API keys, no cost).
 *
 * How it works (for flat or near-flat backgrounds, e.g. drawings, logos, product shots):
 *  1. Sample the outer ring of the image and find its dominant colour(s).
 *  2. Flood-fill inward from the border, removing only pixels that are CONNECTED to the border
 *     and close to those colours. White (or background-coloured) pixels enclosed inside the
 *     subject are never reached, so they are kept.
 *  3. Soft edges: pixels within 2px of the removed area get "colour to alpha" treatment, so
 *     anti-aliased edges become smooth partial transparency instead of a white halo.
 *
 * Limits: this is not an AI segmentation model. Photos with busy or gradient backgrounds are
 * reported as "not removable locally" instead of being damaged. Nothing is ever flattened onto
 * white: the result has a real alpha channel.
 */

export interface BgRemovalOptions {
  /** Max RGB distance (0-441) for a pixel to count as background. Default 40. */
  tolerance?: number;
  /** How many pixels in from the cut line get soft-edge treatment. Default 2. */
  edgeBand?: number;
  /** Minimum share of the image border that must be background-coloured. Default 0.6. */
  minBorderShare?: number;
  /** Working size cap in pixels (the page is drawn scaled anyway). Default 12,000,000. */
  maxPixels?: number;
}

export interface BgRemovalResult {
  applied: boolean;
  /** Plain-language reason when applied is false. */
  reason?: string;
  /** True when the image already had a transparent background (nothing needed doing). */
  alreadyTransparent?: boolean;
  removedPixels: number;
  totalPixels: number;
  /** The background colour that was removed (first/main one). */
  background?: [number, number, number];
}

const DEFAULT_TOLERANCE = 40;
const DEFAULT_EDGE_BAND = 2;
const DEFAULT_MIN_BORDER_SHARE = 0.6;
export const BG_REMOVAL_MAX_PIXELS = 12_000_000;

type RGB = [number, number, number];

function dist2(r: number, g: number, b: number, c: RGB): number {
  const dr = r - c[0];
  const dg = g - c[1];
  const db = b - c[2];
  return dr * dr + dg * dg + db * db;
}

/** Visit every pixel of the outer ring (2px thick). */
function forEachBorderIndex(w: number, h: number, fn: (i: number) => void): void {
  const ring = Math.min(2, Math.floor(Math.min(w, h) / 2));
  for (let y = 0; y < h; y++) {
    const inRingY = y < ring || y >= h - ring;
    if (inRingY) {
      for (let x = 0; x < w; x++) fn(y * w + x);
    } else {
      for (let x = 0; x < ring; x++) fn(y * w + x);
      for (let x = w - ring; x < w; x++) fn(y * w + x);
    }
  }
}

/** Find up to 3 dominant border colours. Returns the colours and the share of border they cover. */
function findBackgroundColours(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tol2: number
): { colours: RGB[]; share: number } {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  forEachBorderIndex(w, h, (i) => {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key);
    if (e) {
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
    } else {
      bins.set(key, { n: 1, r, g, b });
    }
    total++;
  });
  if (total === 0) return { colours: [], share: 0 };

  const sorted = Array.from(bins.values()).sort((a, b) => b.n - a.n);
  const colours: RGB[] = [];
  for (const bin of sorted) {
    if (colours.length >= 3) break;
    const c: RGB = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
    // Skip bins that are just a neighbour of a colour we already have
    if (colours.some((k) => dist2(c[0], c[1], c[2], k) <= tol2)) continue;
    // A secondary colour must be a real part of the border, not stray noise
    if (colours.length > 0 && bin.n / total < 0.05) break;
    colours.push(c);
  }

  let covered = 0;
  forEachBorderIndex(w, h, (i) => {
    const o = i * 4;
    for (const c of colours) {
      if (dist2(data[o], data[o + 1], data[o + 2], c) <= tol2) {
        covered++;
        break;
      }
    }
  });
  return { colours, share: covered / total };
}

/**
 * Remove the background IN PLACE on RGBA pixel data (caller passes a copy of the image).
 * Returns what happened; when applied is false the data is left untouched.
 */
export function removeBackgroundInPlace(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  options: BgRemovalOptions = {}
): BgRemovalResult {
  const total = w * h;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const tol2 = tolerance * tolerance;
  const band = Math.max(0, Math.min(4, options.edgeBand ?? DEFAULT_EDGE_BAND));
  const minShare = options.minBorderShare ?? DEFAULT_MIN_BORDER_SHARE;

  if (w < 3 || h < 3 || data.length < total * 4) {
    return { applied: false, reason: 'The image is too small to process.', removedPixels: 0, totalPixels: total };
  }

  // Already-transparent border: nothing for us to do (a PNG that already has no background)
  let transparentBorder = 0;
  let borderCount = 0;
  forEachBorderIndex(w, h, (i) => {
    borderCount++;
    if (data[i * 4 + 3] < 16) transparentBorder++;
  });
  if (transparentBorder / borderCount > 0.5) {
    return {
      applied: false,
      reason: 'This image already has a transparent background.',
      alreadyTransparent: true,
      removedPixels: 0,
      totalPixels: total,
    };
  }

  const { colours, share } = findBackgroundColours(data, w, h, tol2);
  if (colours.length === 0 || share < minShare) {
    return {
      applied: false,
      reason:
        'The background of this image is too busy or varied to remove reliably without an AI model. ' +
        'It was left untouched instead of being damaged.',
      removedPixels: 0,
      totalPixels: total,
    };
  }

  const matches = (o: number): boolean => {
    for (const c of colours) {
      if (dist2(data[o], data[o + 1], data[o + 2], c) <= tol2) return true;
    }
    return false;
  };

  // --- 1. Flood fill from the border: only background connected to the edge is removed ---
  const mask = new Uint8Array(total); // 1 = background (to be removed)
  const stack = new Int32Array(total);
  let sp = 0;
  const push = (i: number) => {
    if (mask[i] === 0 && matches(i * 4)) {
      mask[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    push(y * w);
    push(y * w + (w - 1));
  }
  let removed = 0;
  while (sp > 0) {
    const i = stack[--sp];
    removed++;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }

  if (removed === 0) {
    return { applied: false, reason: 'No removable background was found.', removedPixels: 0, totalPixels: total };
  }
  if (removed / total > 0.995) {
    return {
      applied: false,
      reason: 'Almost the whole image is background, so there is no subject to keep.',
      removedPixels: removed,
      totalPixels: total,
    };
  }

  // --- 2. Soft edges: colour-to-alpha on the band just inside the cut line ---
  // band[i] = 1 for pixels touching the removed area, 2 for the next ring, and so on
  const ring = new Uint8Array(total);
  if (band > 0) {
    for (let layer = 1; layer <= band; layer++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (mask[i] === 1 || ring[i] !== 0) continue;
          // Layer 1 touches removed pixels; later layers touch the previous layer
          let touches = false;
          for (let dy = -1; dy <= 1 && !touches; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              if (nx < 0 || nx >= w) continue;
              const j = ny * w + nx;
              if (layer === 1 ? mask[j] === 1 : ring[j] === layer - 1) {
                touches = true;
                break;
              }
            }
          }
          if (touches) ring[i] = layer;
        }
      }
    }
  }

  const pickBg = (r: number, g: number, b: number): RGB => {
    let best = colours[0];
    let bd = dist2(r, g, b, best);
    for (let k = 1; k < colours.length; k++) {
      const d = dist2(r, g, b, colours[k]);
      if (d < bd) {
        bd = d;
        best = colours[k];
      }
    }
    return best;
  };

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (mask[i] === 1) {
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 0;
      continue;
    }
    if (ring[i] === 0) continue;

    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const bg = pickBg(r, g, b);

    // "Colour to alpha": how much of this pixel is subject, and what colour is that subject?
    let a = 0;
    const px = [r, g, b];
    for (let c = 0; c < 3; c++) {
      const bc = bg[c];
      const pc = px[c];
      let ac = 0;
      if (pc < bc) ac = bc > 0 ? (bc - pc) / bc : 0;
      else if (pc > bc) ac = 255 - bc > 0 ? (pc - bc) / (255 - bc) : 0;
      if (ac > a) a = ac;
    }
    if (a < 0.02) {
      // Same colour as the background and right at the cut line: it is background
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 0;
      removed++;
      continue;
    }
    if (a >= 0.999) continue; // fully the subject
    data[o] = Math.max(0, Math.min(255, Math.round(bg[0] + (r - bg[0]) / a)));
    data[o + 1] = Math.max(0, Math.min(255, Math.round(bg[1] + (g - bg[1]) / a)));
    data[o + 2] = Math.max(0, Math.min(255, Math.round(bg[2] + (b - bg[2]) / a)));
    data[o + 3] = Math.round(a * 255);
  }

  return {
    applied: true,
    removedPixels: removed,
    totalPixels: total,
    background: [Math.round(colours[0][0]), Math.round(colours[0][1]), Math.round(colours[0][2])],
  };
}

// ---------------------------------------------------------------------------------------------
// Browser helpers (canvas). Everything works on a COPY: the stored original is never touched.
// ---------------------------------------------------------------------------------------------

async function decodeBlob(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(blob);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not read the image to remove its background.'));
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decode an image blob into a NEW canvas with its background removed (real alpha channel).
 * The canvas is scaled down only if the image is larger than maxPixels; the page renderer
 * scales it to the export size anyway.
 */
export async function removeBackgroundFromBlob(
  blob: Blob,
  options: BgRemovalOptions & { maxEdge?: number } = {}
): Promise<{ canvas: HTMLCanvasElement; result: BgRemovalResult }> {
  const decoded = await decodeBlob(blob);
  try {
    const maxPixels = options.maxPixels ?? BG_REMOVAL_MAX_PIXELS;
    let scale = 1;
    if (decoded.width * decoded.height > maxPixels) {
      scale = Math.sqrt(maxPixels / (decoded.width * decoded.height));
    }
    if (options.maxEdge) {
      scale = Math.min(scale, options.maxEdge / Math.max(decoded.width, decoded.height));
    }
    const w = Math.max(1, Math.round(decoded.width * Math.min(1, scale)));
    const h = Math.max(1, Math.round(decoded.height * Math.min(1, scale)));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This device could not prepare the image for background removal.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const result = removeBackgroundInPlace(imageData.data, w, h, options);
    if (result.applied) ctx.putImageData(imageData, 0, 0);
    return { canvas, result };
  } finally {
    decoded.close();
  }
}

/** Small PNG data URL of the processed image, for the preview in the Edit popup. */
export async function makeBackgroundRemovalPreview(
  blob: Blob,
  maxEdge = 360
): Promise<{ dataUrl: string | null; result: BgRemovalResult }> {
  const { canvas, result } = await removeBackgroundFromBlob(blob, { maxEdge });
  const dataUrl = result.applied ? canvas.toDataURL('image/png') : null;
  canvas.width = 1;
  canvas.height = 1;
  return { dataUrl, result };
}
