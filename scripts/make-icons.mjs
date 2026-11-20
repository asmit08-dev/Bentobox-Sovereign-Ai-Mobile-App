// Cuts every app icon, the splash, the favicon and the in-app logo images from the client's
// logo, assets/brand/sovrns-logo.png: a black disc with the white name "sovrns", a gold
// swoosh under it and a small ™ ring at the top right.
//
// Nothing is redrawn or retyped. The disc is pure black, so each part comes off it with its
// exact edges: the white parts (the name and the ™) keep their brightness as transparency,
// and the swoosh keeps its one gold. The outputs only change the size.
//
//   assets/images/icon.png                     app icon (iOS, Android legacy, web): the logo
//                                              filling the square, no ™ (a speck at icon size)
//   assets/images/android-icon-foreground.png  name and swoosh inside Android's safe circle
//   assets/images/android-icon-monochrome.png  the same in one color (Android themed icons)
//   assets/images/splash-icon.png              the whole logo on a clear ground
//   assets/images/favicon.png                  the logo at 48 px
//   assets/brand/wordmark-*.png                name, swoosh and ™ for the app's screens
//   src/components/brand/logoGeometry.ts       where the ™ sits beside the name
//
// Run it after replacing the logo (it needs a headless Chromium through playwright-core):
//   npx -y -p playwright-core node scripts/make-icons.mjs
// To use a Chromium you already have:
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs CHROMIUM=/path/to/chrome node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'assets/brand/sovrns-logo.png');
const GEOMETRY = join(ROOT, 'src/components/brand/logoGeometry.ts');

const SETTINGS = {
  // The swoosh's gold, measured from the logo.
  gold: [245, 184, 52],
  // Android shows the middle 72 of an icon's 108dp and keeps the middle 66dp safe from every
  // mask shape. The logo's disc is mapped onto the visible 72dp, which keeps the name and
  // swoosh inside the safe circle.
  androidVisible: 72 / 108,
  // The in-app images are cut this wide (px): sharp at 3x for a logo up to 280pt wide.
  wordmarkWidth: 840,
};

/** Runs in the browser: splits the logo into its parts and draws every output as a PNG. */
async function cut({ source, gold, androidVisible, wordmarkWidth }) {
  const canvas = (width, height) => {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    return element;
  };

  const image = new Image();
  image.src = source;
  await image.decode();
  const W = image.naturalWidth;
  const H = image.naturalHeight;
  const base = canvas(W, H).getContext('2d', { willReadFrequently: true });
  base.drawImage(image, 0, 0);
  const px = base.getImageData(0, 0, W, H).data;
  const bright = (x, y) => {
    const i = (y * W + x) * 4;
    return Math.max(px[i], px[i + 1], px[i + 2]);
  };

  // The disc: the first dark pixel from each side, along the middle row and column.
  let left = 0;
  while (bright(left, H >> 1) >= 128) left++;
  let right = W - 1;
  while (bright(right, H >> 1) >= 128) right--;
  let top = 0;
  while (bright(W >> 1, top) >= 128) top++;
  let bottom = H - 1;
  while (bright(W >> 1, bottom) >= 128) bottom--;
  const disc = { cx: (left + right) / 2, cy: (top + bottom) / 2, r: (right - left + bottom - top) / 4 };

  // Sort the disc's pixels into the white parts and the gold swoosh. The ring at the disc's
  // own edge is left out: it is the disc fading into the white page, not part of the logo.
  const whiteData = new ImageData(W, H);
  const goldData = new ImageData(W, H);
  const solid = new Uint8Array(W * H);
  const goldBox = { x0: W, y0: H, x1: -1, y1: -1 };
  const inner = (disc.r - 3) ** 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x - disc.cx) ** 2 + (y - disc.cy) ** 2 >= inner) continue;
      const i = (y * W + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (r > 6 && r - b > 0.35 * r) {
        goldData.data[i] = gold[0];
        goldData.data[i + 1] = gold[1];
        goldData.data[i + 2] = gold[2];
        goldData.data[i + 3] = Math.min(255, Math.round((r * 255) / gold[0]));
        goldBox.x0 = Math.min(goldBox.x0, x);
        goldBox.y0 = Math.min(goldBox.y0, y);
        goldBox.x1 = Math.max(goldBox.x1, x);
        goldBox.y1 = Math.max(goldBox.y1, y);
        continue;
      }
      const alpha = Math.max(r, g, b);
      if (alpha === 0) continue;
      whiteData.data[i] = 255;
      whiteData.data[i + 1] = 255;
      whiteData.data[i + 2] = 255;
      whiteData.data[i + 3] = alpha;
      if (alpha >= 128) solid[y * W + x] = 1;
    }
  }

  // The white shapes, one by one: the letters are the big ones, the ™ (its ring, T and M)
  // the small ones.
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const shapes = [];
  for (let start = 0; start < W * H; start++) {
    if (!solid[start] || seen[start]) continue;
    const box = { x0: W, y0: H, x1: -1, y1: -1, area: 0 };
    let depth = 0;
    stack[depth++] = start;
    seen[start] = 1;
    while (depth) {
      const p = stack[--depth];
      const x = p % W;
      const y = (p - x) / W;
      box.area++;
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (solid[q] && !seen[q]) {
            seen[q] = 1;
            stack[depth++] = q;
          }
        }
      }
    }
    shapes.push(box);
  }
  const union = (boxes) =>
    boxes.reduce(
      (u, s) => ({
        x0: Math.min(u.x0, s.x0),
        y0: Math.min(u.y0, s.y0),
        x1: Math.max(u.x1, s.x1),
        y1: Math.max(u.y1, s.y1),
      }),
      { x0: W, y0: H, x1: -1, y1: -1 },
    );
  const largest = Math.max(...shapes.map((shape) => shape.area));
  const letterBox = union(shapes.filter((shape) => shape.area >= 0.1 * largest));
  const tmBox = union(shapes.filter((shape) => shape.area < 0.1 * largest));
  if (tmBox.x1 < 0 || goldBox.x1 < 0) throw new Error('could not find the ™ or the swoosh');

  // Boxes grow by a few pixels so the soft edges come along.
  const PAD = 6;
  const grow = (box) => ({
    x: box.x0 - PAD,
    y: box.y0 - PAD,
    w: box.x1 - box.x0 + 1 + 2 * PAD,
    h: box.y1 - box.y0 + 1 + 2 * PAD,
  });
  const lockup = grow(union([letterBox, goldBox]));
  const tm = grow(tmBox);
  const overlaps =
    tm.x < lockup.x + lockup.w &&
    lockup.x < tm.x + tm.w &&
    tm.y < lockup.y + lockup.h &&
    lockup.y < tm.y + tm.h;
  if (overlaps) throw new Error('the ™ touches the name; cut it by hand');

  const layer = (data) => {
    const element = canvas(W, H);
    element.getContext('2d').putImageData(data, 0, 0);
    return element;
  };
  const allWhite = layer(whiteData);
  const swoosh = layer(goldData);
  const nameOnly = layer(whiteData);
  nameOnly.getContext('2d').clearRect(tm.x, tm.y, tm.w, tm.h);
  const swooshWhite = canvas(W, H);
  {
    const context = swooshWhite.getContext('2d');
    context.drawImage(swoosh, 0, 0);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, W, H);
  }

  // Draws part of `from` into `context`, halving it in steps first so small sizes stay smooth.
  function drawScaled(context, from, sx, sy, sw, sh, dx, dy, dw, dh) {
    let source = from;
    let x = sx;
    let y = sy;
    let w = sw;
    let h = sh;
    while (w / dw > 2) {
      const half = canvas(Math.ceil(w / 2), Math.ceil(h / 2));
      const halfContext = half.getContext('2d');
      halfContext.imageSmoothingQuality = 'high';
      halfContext.drawImage(source, x, y, w, h, 0, 0, half.width, half.height);
      source = half;
      x = 0;
      y = 0;
      w = half.width;
      h = half.height;
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, x, y, w, h, dx, dy, dw, dh);
  }

  // Draws layers so the logo's disc lands on a circle at (cx, cy) with radius `r`.
  function drawOnDisc(context, layers, cx, cy, r) {
    const k = r / disc.r;
    for (const part of layers) {
      drawScaled(context, part, 0, 0, W, H, cx - disc.cx * k, cy - disc.cy * k, W * k, H * k);
    }
  }

  // The logo as delivered: the black disc on a clear ground, then its parts.
  function badge(size, layers) {
    const element = canvas(size, size);
    const context = element.getContext('2d');
    const r = size / 2 - 1;
    context.fillStyle = '#000000';
    context.beginPath();
    context.arc(size / 2, size / 2, r, 0, 2 * Math.PI);
    context.fill();
    drawOnDisc(context, layers, size / 2, size / 2, r);
    return element;
  }

  const outputs = {};
  const png = (element) => element.toDataURL('image/png');

  {
    const icon = canvas(1024, 1024);
    const context = icon.getContext('2d');
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 1024, 1024);
    drawOnDisc(context, [nameOnly, swoosh], 512, 512, 512);
    outputs['assets/images/icon.png'] = png(icon);
  }
  {
    const r = 512 * androidVisible;
    const foreground = canvas(1024, 1024);
    drawOnDisc(foreground.getContext('2d'), [nameOnly, swoosh], 512, 512, r);
    outputs['assets/images/android-icon-foreground.png'] = png(foreground);
    const monochrome = canvas(1024, 1024);
    drawOnDisc(monochrome.getContext('2d'), [nameOnly, swooshWhite], 512, 512, r);
    outputs['assets/images/android-icon-monochrome.png'] = png(monochrome);
  }
  outputs['assets/images/splash-icon.png'] = png(badge(1024, [allWhite, swoosh]));
  {
    const large = badge(1024, [nameOnly, swoosh]);
    const favicon = canvas(48, 48);
    drawScaled(favicon.getContext('2d'), large, 0, 0, 1024, 1024, 0, 0, 48, 48);
    outputs['assets/images/favicon.png'] = png(favicon);
  }

  // In-app images: the name (white, tinted in the app), the swoosh (gold) and the ™ (white),
  // all at one scale. The name and swoosh share one frame so they stack exactly.
  const k = wordmarkWidth / lockup.w;
  const frameHeight = Math.round(lockup.h * k);
  for (const [file, part] of [
    ['assets/brand/wordmark-letters.png', nameOnly],
    ['assets/brand/wordmark-swoosh.png', swoosh],
  ]) {
    const element = canvas(wordmarkWidth, frameHeight);
    drawScaled(element.getContext('2d'), part, lockup.x, lockup.y, lockup.w, lockup.h, 0, 0, wordmarkWidth, frameHeight);
    outputs[file] = png(element);
  }
  const tmWidth = Math.round(tm.w * k);
  const tmHeight = Math.round(tm.h * k);
  {
    const element = canvas(tmWidth, tmHeight);
    drawScaled(element.getContext('2d'), allWhite, tm.x, tm.y, tm.w, tm.h, 0, 0, tmWidth, tmHeight);
    outputs['assets/brand/wordmark-tm.png'] = png(element);
  }

  const share = (value) => Math.round((value / wordmarkWidth) * 10000) / 10000;
  return {
    outputs,
    found: { disc, letterBox, goldBox, tmBox },
    geometry: {
      aspect: Math.round((wordmarkWidth / frameHeight) * 10000) / 10000,
      trademark: {
        left: share((tm.x - lockup.x) * k),
        top: share((tm.y - lockup.y) * k),
        width: share(tmWidth),
        height: share(tmHeight),
      },
    },
  };
}

const source = `data:image/png;base64,${readFileSync(SOURCE).toString('base64')}`;
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
try {
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  const result = await page.evaluate(cut, { source, ...SETTINGS });
  console.log('found', JSON.stringify(result.found));
  for (const [file, dataUrl] of Object.entries(result.outputs)) {
    writeFileSync(join(ROOT, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote', file);
  }
  const { aspect, trademark } = result.geometry;
  writeFileSync(
    GEOMETRY,
    [
      '// Made by scripts/make-icons.mjs from assets/brand/sovrns-logo.png. Do not edit by hand.',
      "// Where the logo's parts sit, as shares of the wordmark images' width.",
      'export const WORDMARK = {',
      '  /** Width ÷ height of wordmark-letters.png and wordmark-swoosh.png. */',
      `  aspect: ${aspect},`,
      '  /** wordmark-tm.png beside the name: left and top edge (above the name), width, height. */',
      `  trademark: { left: ${trademark.left}, top: ${trademark.top}, width: ${trademark.width}, height: ${trademark.height} },`,
      '} as const;',
      '',
    ].join('\n'),
  );
  console.log('wrote', GEOMETRY.slice(ROOT.length + 1));
} finally {
  await browser.close();
}
