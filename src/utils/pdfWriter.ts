/**
 * Litdom Batch Studio - minimal PDF writer.
 *
 * One full-page image per PDF page. Three encodings:
 *  - 'jpeg' : RGB JPEG bytes (DCTDecode) - small files for screens
 *  - 'rgb'  : raw RGB pixels, Flate-compressed - lossless
 *  - 'cmyk' : raw CMYK pixels (DeviceCMYK), Flate-compressed - real print colour
 * Page size is given in CSS pixels and written in PDF points (96 px = 72 pt).
 */

export type PdfImageKind = 'jpeg' | 'rgb' | 'cmyk';

export interface PdfPageInput {
  /** Page size in px */
  width: number;
  height: number;
  /** Pixel size of the image */
  pxWidth: number;
  pxHeight: number;
  kind: PdfImageKind;
  /** JPEG file bytes for 'jpeg', raw interleaved pixels for 'rgb' (3 bytes) / 'cmyk' (4 bytes) */
  data: Uint8Array;
}

const enc = new TextEncoder();
const PX_TO_PT = 0.75;
const num = (n: number) => String(Math.round(n * 100) / 100);

async function flate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

export class PdfBuilder {
  private parts: BlobPart[] = [];
  private offsets: number[] = []; // offsets[objNumber - 1]
  private length = 0;
  private pageCount = 0;

  constructor(private title = 'Litdom design') {
    this.push(enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  }

  get pages(): number {
    return this.pageCount;
  }

  private push(bytes: Uint8Array) {
    this.parts.push(bytes as BlobPart);
    this.length += bytes.length;
  }

  private startObject(objNumber: number) {
    this.offsets[objNumber - 1] = this.length;
  }

  private writeObject(objNumber: number, body: string) {
    this.startObject(objNumber);
    this.push(enc.encode(`${objNumber} 0 obj\n${body}\nendobj\n`));
  }

  async addPage(p: PdfPageInput): Promise<void> {
    const base = 3 + this.pageCount * 3; // page, contents, image
    const pageObj = base;
    const contentsObj = base + 1;
    const imageObj = base + 2;
    const wPt = p.width * PX_TO_PT;
    const hPt = p.height * PX_TO_PT;

    let filter: string;
    let stream: Uint8Array;
    if (p.kind === 'jpeg') {
      filter = '/DCTDecode';
      stream = p.data;
    } else {
      const packed = await flate(p.data);
      filter = packed ? '/FlateDecode' : '';
      stream = packed || p.data;
    }
    const colorSpace = p.kind === 'cmyk' ? '/DeviceCMYK' : '/DeviceRGB';

    // Image XObject
    this.startObject(imageObj);
    this.push(
      enc.encode(
        `${imageObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.pxWidth} /Height ${p.pxHeight} ` +
          `/ColorSpace ${colorSpace} /BitsPerComponent 8 ${filter ? `/Filter ${filter} ` : ''}/Length ${stream.length} >>\nstream\n`
      )
    );
    this.push(stream);
    this.push(enc.encode('\nendstream\nendobj\n'));

    // Contents: draw the image over the whole page
    const content = `q ${num(wPt)} 0 0 ${num(hPt)} 0 0 cm /Im0 Do Q`;
    this.writeObject(contentsObj, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

    // Page
    this.writeObject(
      pageObj,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(wPt)} ${num(hPt)}] ` +
        `/Resources << /XObject << /Im0 ${imageObj} 0 R >> >> /Contents ${contentsObj} 0 R >>`
    );
    this.pageCount++;
  }

  build(): Blob {
    const kids = Array.from({ length: this.pageCount }, (_, i) => `${3 + i * 3} 0 R`).join(' ');
    const infoObj = 3 + this.pageCount * 3;
    this.writeObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
    this.writeObject(2, `<< /Type /Pages /Kids [${kids}] /Count ${this.pageCount} >>`);
    const safeTitle = this.title.replace(/[()\\]/g, ' ').replace(/[^\x20-\x7E]/g, '');
    this.writeObject(infoObj, `<< /Title (${safeTitle}) /Producer (Litdom Batch Studio) >>`);

    const total = infoObj;
    const xrefStart = this.length;
    let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let i = 0; i < total; i++) {
      xref += `${String(this.offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${total + 1} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    this.push(enc.encode(xref));
    return new Blob(this.parts, { type: 'application/pdf' });
  }
}

/** RGBA canvas pixels -> RGB bytes */
export function rgbaToRgb(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    out[j] = rgba[i];
    out[j + 1] = rgba[i + 1];
    out[j + 2] = rgba[i + 2];
  }
  return out;
}

/** RGBA canvas pixels -> CMYK bytes (0 = no ink, 255 = full ink), black generated into K */
export function rgbaToCmyk(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] / 255;
    const g = rgba[i + 1] / 255;
    const b = rgba[i + 2] / 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) {
      out[i + 3] = 255; // pure black: only the K plate
      continue;
    }
    const inv = 1 - k;
    out[i] = Math.round(((1 - r - k) / inv) * 255);
    out[i + 1] = Math.round(((1 - g - k) / inv) * 255);
    out[i + 2] = Math.round(((1 - b - k) / inv) * 255);
    out[i + 3] = Math.round(k * 255);
  }
  return out;
}
