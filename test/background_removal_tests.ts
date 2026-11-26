/**
 * Tests: local background removal (pure pixel logic; no canvas needed).
 */
import assert from 'node:assert';
import { removeBackgroundInPlace } from '../src/utils/backgroundRemoval';

type RGB = [number, number, number];

function makeImage(w: number, h: number, bg: RGB): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = bg[0];
    d[i * 4 + 1] = bg[1];
    d[i * 4 + 2] = bg[2];
    d[i * 4 + 3] = 255;
  }
  return d;
}

/** Anti-aliased disc/ring drawn by coverage, blended over whatever is already there. */
function drawRing(d: Uint8ClampedArray, w: number, cx: number, cy: number, rOuter: number, rInner: number, colour: RGB) {
  const h = d.length / 4 / w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      // coverage 0..1 with a 1px soft edge on both radii
      const outer = Math.max(0, Math.min(1, rOuter - dist + 0.5));
      const inner = rInner > 0 ? Math.max(0, Math.min(1, dist - rInner + 0.5)) : 1;
      const cov = Math.min(outer, inner);
      if (cov <= 0) continue;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = Math.round(d[o + c] * (1 - cov) + colour[c] * cov);
    }
  }
}

const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => {
  const o = (y * w + x) * 4;
  return { r: d[o], g: d[o + 1], b: d[o + 2], a: d[o + 3] };
};

function main() {
  console.log('--- BACKGROUND REMOVAL TESTS ---');
  const W = 120;
  const H = 120;

  console.log('\n[BG 1] Black ring on white: outside removed, subject kept, enclosed white kept');
  {
    const d = makeImage(W, H, [255, 255, 255]);
    drawRing(d, W, 60, 60, 40, 28, [0, 0, 0]); // a "head": black ring with a white inside
    const res = removeBackgroundInPlace(d, W, H);
    assert.strictEqual(res.applied, true);
    assert.strictEqual(px(d, W, 2, 2).a, 0, 'corner must be transparent');
    assert.strictEqual(px(d, W, 117, 60).a, 0, 'edge must be transparent');
    const ringPx = px(d, W, 60, 60 - 34); // middle of the black stroke
    assert.strictEqual(ringPx.a, 255, 'stroke must stay opaque');
    assert.ok(ringPx.r < 10 && ringPx.g < 10 && ringPx.b < 10, 'stroke must stay black');
    const inside = px(d, W, 60, 60);
    assert.strictEqual(inside.a, 255, 'white INSIDE the subject must be kept');
    assert.ok(inside.r > 245 && inside.g > 245 && inside.b > 245, 'inside stays white');
    console.log('✅ PASS: outside gone, stroke black, enclosed white preserved');
  }

  console.log('\n[BG 2] Anti-aliased edge becomes soft alpha with no white halo');
  {
    const d = makeImage(W, H, [255, 255, 255]);
    drawRing(d, W, 60, 60, 40, 28, [0, 0, 0]);
    removeBackgroundInPlace(d, W, H);
    let partial = 0;
    for (let i = 0; i < W * H; i++) {
      const a = d[i * 4 + 3];
      if (a > 0 && a < 255) {
        partial++;
        // a partly transparent edge pixel of a BLACK subject must itself be dark (not grey/white)
        assert.ok(d[i * 4] < 40, `edge pixel colour should be near black, got ${d[i * 4]}`);
      }
    }
    assert.ok(partial > 50, `expected soft edge pixels, got ${partial}`);
    console.log(`✅ PASS: ${partial} soft edge pixels, all dark (no halo)`);
  }

  console.log('\n[BG 3] JPG-style noise on the background is still removed');
  {
    const d = makeImage(W, H, [255, 255, 255]);
    drawRing(d, W, 60, 60, 40, 28, [0, 0, 0]);
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 14; // +-7
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      if (d[o] > 200) for (let c = 0; c < 3; c++) d[o + c] = Math.max(0, Math.min(255, d[o + c] + rnd()));
    }
    const res = removeBackgroundInPlace(d, W, H);
    assert.strictEqual(res.applied, true);
    assert.strictEqual(px(d, W, 5, 5).a, 0);
    assert.strictEqual(px(d, W, 60, 60).a, 255, 'enclosed noisy white stays');
    console.log('✅ PASS: noisy background removed, subject intact');
  }

  console.log('\n[BG 4] Coloured background, coloured subject');
  {
    const d = makeImage(W, H, [200, 230, 250]);
    drawRing(d, W, 60, 60, 30, 0, [220, 20, 40]); // solid red disc
    const res = removeBackgroundInPlace(d, W, H);
    assert.strictEqual(res.applied, true);
    assert.strictEqual(px(d, W, 3, 3).a, 0);
    const c = px(d, W, 60, 60);
    assert.strictEqual(c.a, 255);
    assert.ok(c.r > 200 && c.g < 40, 'red subject keeps its colour');
    console.log('✅ PASS: blue background removed, red subject kept');
  }

  console.log('\n[BG 5] Busy background is refused and the pixels are left untouched');
  {
    const d = makeImage(W, H, [0, 0, 0]);
    let s = 99;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < W * H; i++) {
      d[i * 4] = Math.floor(rnd() * 256);
      d[i * 4 + 1] = Math.floor(rnd() * 256);
      d[i * 4 + 2] = Math.floor(rnd() * 256);
    }
    const before = Uint8ClampedArray.from(d);
    const res = removeBackgroundInPlace(d, W, H);
    assert.strictEqual(res.applied, false);
    assert.ok(res.reason && res.reason.length > 10, 'must explain why');
    assert.deepStrictEqual(Array.from(d), Array.from(before), 'data must be unchanged');
    console.log('✅ PASS: refused with reason:', res.reason);
  }

  console.log('\n[BG 6] Already-transparent and all-one-colour images are not "processed"');
  {
    const t = makeImage(W, H, [255, 255, 255]);
    for (let i = 0; i < W * H; i++) t[i * 4 + 3] = 0;
    assert.strictEqual(removeBackgroundInPlace(t, W, H).applied, false);

    const flat = makeImage(W, H, [255, 255, 255]);
    const before = Uint8ClampedArray.from(flat);
    const res = removeBackgroundInPlace(flat, W, H);
    assert.strictEqual(res.applied, false);
    assert.deepStrictEqual(Array.from(flat), Array.from(before));
    console.log('✅ PASS: transparent input and blank input are left alone');
  }

  console.log('\n[BG 7] Dimensions are never changed by the pixel logic');
  {
    const d = makeImage(W, H, [255, 255, 255]);
    drawRing(d, W, 60, 60, 20, 0, [0, 0, 0]);
    const len = d.length;
    removeBackgroundInPlace(d, W, H);
    assert.strictEqual(d.length, len);
    console.log('✅ PASS: pixel buffer size unchanged');
  }

  console.log('\nAll background removal tests passed.');
}

main();
