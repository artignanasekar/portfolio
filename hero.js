// Scales the fixed 1152x658 hero stage down to fit inside the browser
// window, but never up past 1x — this keeps every proportion (font size,
// margins, photo sizes) identical to the Figma frame. It only shrinks on a
// window smaller than the frame itself; on a normal desktop window it
// renders at true 1:1 size, same as Figma, with the surrounding space
// filled by the matching dithered background (see hero.css) rather than a
// mismatched gap.

const heroWrap = document.querySelector('.hero-wrap');
const heroStage = document.querySelector('.hero-stage');

function fitHeroStage() {
  const scale = Math.min(1, heroWrap.clientWidth / 1152, heroWrap.clientHeight / 658);
  heroStage.style.setProperty('--hero-scale', scale);
}

window.addEventListener('resize', fitHeroStage);
fitHeroStage();

// --- Bayer 16x16 ordered dither, same algorithm as about.js, applied to
// the flat white stage background (Figma Dither: Bayer 16x16, size 1,
// levels 8, brightness 100%, contrast 1, mono off) and tiled as a 16x16
// repeating background-image instead of a flat #fcfcfc fill. ---

function generateBayerMatrix(size) {
  let matrix = [[0, 2], [3, 1]];
  let dim = 2;
  while (dim < size) {
    const newDim = dim * 2;
    const newMatrix = Array.from({ length: newDim }, () => new Array(newDim).fill(0));
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const v = matrix[y][x];
        newMatrix[y][x] = 4 * v;
        newMatrix[y][x + dim] = 4 * v + 2;
        newMatrix[y + dim][x] = 4 * v + 3;
        newMatrix[y + dim][x + dim] = 4 * v + 1;
      }
    }
    matrix = newMatrix;
    dim = newDim;
  }
  return matrix;
}

function ditherChannel(value, threshold, levels) {
  const normalized = value / 255;
  const scaled = normalized * (levels - 1);
  const base = Math.floor(scaled);
  const frac = scaled - base;
  const out = frac > threshold ? base + 1 : base;
  return Math.round((out / (levels - 1)) * 255);
}

const BAYER_SIZE = 16;
const LEVELS = 8;
const WHITE = 252; // #fcfcfc

const bayerMatrix = generateBayerMatrix(BAYER_SIZE);
const ditherCanvas = document.createElement('canvas');
ditherCanvas.width = BAYER_SIZE;
ditherCanvas.height = BAYER_SIZE;
const ditherCtx = ditherCanvas.getContext('2d');
const ditherData = ditherCtx.createImageData(BAYER_SIZE, BAYER_SIZE);

for (let y = 0; y < BAYER_SIZE; y++) {
  for (let x = 0; x < BAYER_SIZE; x++) {
    const threshold = (bayerMatrix[y][x] + 0.5) / (BAYER_SIZE * BAYER_SIZE);
    const shade = ditherChannel(WHITE, threshold, LEVELS);
    const i = (y * BAYER_SIZE + x) * 4;
    ditherData.data[i] = shade;
    ditherData.data[i + 1] = shade;
    ditherData.data[i + 2] = shade;
    ditherData.data[i + 3] = 255;
  }
}
ditherCtx.putImageData(ditherData, 0, 0);
const ditherUrl = `url(${ditherCanvas.toDataURL()})`;
heroStage.style.setProperty('--hero-dither', ditherUrl);
heroWrap.style.setProperty('--hero-dither', ditherUrl);
// set on :root too so any other element on the page (e.g. the footer)
// can share this exact same texture via var(--hero-dither).
document.documentElement.style.setProperty('--hero-dither', ditherUrl);

// --- Footer flip-tile intro: the first time the footer scrolls into
// view, wave every tile open then closed (left to right, row by row) so
// the visitor notices the grid is interactive, then leave it alone for
// them to hover tiles themselves. ---
const footerGrid = document.querySelector('.footer-grid');
if (footerGrid) {
  const flipTiles = [...footerGrid.querySelectorAll('.flip-tile')];
  const STAGGER_MS = 48;
  const OPEN_HOLD_MS = 520;

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      revealObserver.disconnect();
      flipTiles.forEach((tile, i) => {
        const delay = i * STAGGER_MS;
        setTimeout(() => tile.classList.add('is-open'), delay);
        setTimeout(() => tile.classList.remove('is-open'), delay + OPEN_HOLD_MS);
      });
    });
  }, { threshold: 0.3 });

  revealObserver.observe(footerGrid);
}
