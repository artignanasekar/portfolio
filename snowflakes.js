/* Geometric snowflakes (experiment — Figma "snowflake inspo", node 1954:319).

   Each snowflake is drawn as one arm pointing straight up from the centre
   (0,0), built from straight bars and kites, then rotated 6 times. All the
   pieces share one solid fill, so overlaps read as a single shape. Holes
   (the open centres) are cut with a mask. Everything sits in a
   -100..100 viewBox, so a flake is about 200 units across. */

export const SNOW_COLORS = ['#eb1763', '#ff5400', '#ced629', '#f8c9dd', '#ceeaee', '#ffc74c', '#5567af'];

const rad = (deg) => (deg * Math.PI) / 180;
const r = (n) => Math.round(n * 100) / 100;

// rotate a point clockwise by deg around the centre (0 = straight up)
function rot([x, y], deg) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x * c - y * s, x * s + y * c];
}

// a w-wide bar starting at (x0,y0), heading `deg` clockwise from straight up
function bar(x0, y0, deg, len, w) {
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, -len], [-w / 2, -len]];
  return pts.map((p) => rot(p, deg)).map(([x, y]) => [x + x0, y + y0]);
}

// end point of such a bar
function tip(x0, y0, deg, len) {
  const [x, y] = rot([0, -len], deg);
  return [x0 + x, y0 + y];
}

// a kite on the up axis: from `near` (closest to centre) to `far`, widest at `mid`
const kite = (near, mid, far, halfW) => [[0, -near], [halfW, -mid], [0, -far], [-halfW, -mid]];

// a square of side w centred on (x,y) — fills the corner where two bars meet
const joint = ([x, y], w) => [[x - w / 2, y - w / 2], [x + w / 2, y - w / 2], [x + w / 2, y + w / 2], [x - w / 2, y + w / 2]];

// regular polygon (hexagon by default), a point at the top
const ngon = (radius, n = 6, offset = 0) =>
  Array.from({ length: n }, (_, i) => rot([0, -radius], offset + (360 / n) * i));

// a pair of mirror-image bars branching off the stem at height y
const pair = (y, deg, len, w) => [bar(0, -y, deg, len, w), bar(0, -y, -deg, len, w)];

// every piece is wound the same way round, so where pieces overlap they
// add up (nonzero fill) instead of cancelling into specks of background
const area = (p) => p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0);
const clockwise = (p) => (area(p) < 0 ? [...p].reverse() : p);

const toPath = (polys) =>
  polys.map(clockwise).map((p) => 'M' + p.map(([x, y]) => `${r(x)} ${r(y)}`).join('L') + 'Z').join('');

export { rot, bar, kite, ngon, pair, toPath };

// spin one arm's polygons around 6 times (plus any `between` arms set 30° off)
export function radial(arm, between = []) {
  const out = [];
  for (let k = 0; k < 6; k++) {
    arm.forEach((p) => out.push(p.map((pt) => rot(pt, k * 60))));
    between.forEach((p) => out.push(p.map((pt) => rot(pt, k * 60 + 30))));
  }
  return out;
}

// the hooked branch of "hook": out at 60°, then a bend straight up
function hook(side) {
  const y = -34;
  const deg = 60 * side;
  const end = tip(0, y, deg, 30);
  return [bar(0, y, deg, 30, 12), joint(end, 12), bar(end[0], end[1], 0, 20, 12)];
}

export const SNOWFLAKES = [
  {
    name: 'hook',
    body: radial([
      bar(0, 0, 0, 74, 13),
      kite(62, 80, 100, 15),
      ...hook(1),
      ...hook(-1),
    ]).concat([ngon(20)]),
  },
  {
    name: 'trident',
    body: radial([
      bar(0, 0, 0, 98, 16),
      ...pair(64, 46, 34, 14),
      ...pair(36, 60, 18, 11),
    ]).concat([ngon(36)]),
    hole: [ngon(17)],
  },
  {
    name: 'burst',
    body: radial(
      [bar(0, 0, 0, 62, 9), kite(54, 76, 100, 14), ...pair(30, 34, 20, 6)],
      [bar(0, 0, 0, 48, 7), kite(42, 54, 68, 9)],
    ).concat([ngon(26, 12)]),
    hole: [ngon(13, 12)],
  },
  {
    name: 'lace',
    body: radial([
      bar(0, 0, 0, 82, 9),
      kite(72, 85, 100, 11),
      ...pair(44, 52, 26, 9),
      ...pair(64, 52, 16, 8),
    ]).concat([ngon(30)]),
    hole: [ngon(16, 6, 30)],
  },
];

let maskId = 0;

// an <svg> string for one snowflake, filled solid in `color`
export function snowflakeSVG(flake, color, size = 64) {
  const id = `snow-hole-${maskId++}`;
  const mask = flake.hole
    ? `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="-110" y="-110" width="220" height="220">` +
      `<rect x="-110" y="-110" width="220" height="220" fill="#fff"/>` +
      `<path d="${toPath(flake.hole)}" fill="#000"/></mask></defs>`
    : '';
  const maskAttr = flake.hole ? ` mask="url(#${id})"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-104 -104 208 208" width="${size}" height="${size}" aria-label="${flake.name} snowflake">` +
    mask +
    `<path d="${toPath(flake.body)}" fill="${color}"${maskAttr}/></svg>`
  );
}

/* --- dither: the stars' Figma Dither effect (Bayer 16x16, size 1, levels 3),
   the same maths as ditherStar() in home-stars.js. The flake is rasterised
   near the stars' 291px Figma size and dithered there. Then it's shrunk to
   its on-screen size by plain block averaging, at an exact whole-number
   ratio: letting the browser scale 291px down to an odd size like 64px
   makes the dot grid beat against the screen pixels (moire), which showed
   up as a pale glow in the middle of small flakes. */

const FIGMA_RES = 291; // the stars' size in Figma, where size 1 = one dot per Figma px
const BAYER_SIZE = 16;
const LEVELS = 3;

function generateBayerMatrix(size) {
  let matrix = [[0, 2], [3, 1]];
  let dim = 2;
  while (dim < size) {
    const newDim = dim * 2;
    const next = Array.from({ length: newDim }, () => new Array(newDim).fill(0));
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const v = matrix[y][x];
        next[y][x] = 4 * v;
        next[y][x + dim] = 4 * v + 2;
        next[y + dim][x] = 4 * v + 3;
        next[y + dim][x + dim] = 4 * v + 1;
      }
    }
    matrix = next;
    dim = newDim;
  }
  return matrix;
}

const bayer = generateBayerMatrix(BAYER_SIZE);

function ditherChannel(value, threshold) {
  const scaled = (value / 255) * (LEVELS - 1);
  const base = Math.floor(scaled);
  const out = scaled - base > threshold ? base + 1 : base;
  return Math.round((out / (LEVELS - 1)) * 255);
}

// average each k x k block of src (premultiplied, so edges don't go dark)
function shrink(src, res, k) {
  const out = res / k;
  const dst = new ImageData(out, out);
  const s = src.data;
  const d = dst.data;
  for (let oy = 0; oy < out; oy++) {
    for (let ox = 0; ox < out; ox++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let y = oy * k; y < oy * k + k; y++) {
        for (let x = ox * k; x < ox * k + k; x++) {
          const i = (y * res + x) * 4;
          const al = s[i + 3];
          r += s[i] * al; g += s[i + 1] * al; b += s[i + 2] * al; a += al;
        }
      }
      const o = (oy * out + ox) * 4;
      if (a) { d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; }
      d[o + 3] = a / (k * k);
    }
  }
  return dst;
}

// resolves to { url, pixels } like ditherStar(): a PNG data URL of the
// dithered flake, baked for `size` CSS px on this screen, plus the
// full-res dithered pixels (for bursting)
export function ditherSnowflake(flake, color, size = 64) {
  return ditherSVG((px) => snowflakeSVG(flake, color, px), size);
}

// same, for any svg: `makeSVG(px)` returns the svg markup drawn at px x px
export function ditherSVG(makeSVG, size = 64) {
  const out = Math.round(size * (window.devicePixelRatio || 1));
  const k = Math.max(2, Math.round(FIGMA_RES / out)); // whole-number shrink
  const res = out * k;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = res;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, res, res);
      const imageData = ctx.getImageData(0, 0, res, res);
      const data = imageData.data;
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const threshold = (bayer[y % BAYER_SIZE][x % BAYER_SIZE] + 0.5) / (BAYER_SIZE * BAYER_SIZE);
          const i = (y * res + x) * 4;
          data[i] = ditherChannel(data[i], threshold);
          data[i + 1] = ditherChannel(data[i + 1], threshold);
          data[i + 2] = ditherChannel(data[i + 2], threshold);
        }
      }
      canvas.width = canvas.height = out;
      ctx.putImageData(shrink(imageData, res, k), 0, 0);
      resolve({ url: canvas.toDataURL(), pixels: imageData });
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(makeSVG(res));
  });
}
