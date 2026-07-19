// --- Recreate the Figma "Warm" color filter + Bayer 16x16 dither effect ---
// applied to the collage image (Filter: Warm @ 100%; Dither: Bayer 16x16,
// size 2, levels 3, brightness 100%, contrast 1, mono off).

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

function applyWarmFilter(r, g, b) {
  return [
    Math.min(255, r * 1.15 + 8),
    Math.min(255, g * 1.05 + 3),
    Math.max(0, b * 0.85),
  ];
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
const BLOCK_SIZE = 2;
const LEVELS = 3;
const bayerMatrix = generateBayerMatrix(BAYER_SIZE);

const viewport = document.querySelector('.main-area');
const panLayer = document.querySelector('.collage-wrap');
const canvas = document.getElementById('collage-canvas');
const ctx = canvas.getContext('2d');
const sourceImage = new Image();
let sourceLoaded = false;

// How much further in than a plain edge-to-edge "cover" fit to zoom,
// so the whole image is reachable by panning but never appears cropped at rest.
const ZOOM_EXTRA = 1.6;

// Normalized position (0-1) of the fish / drummer figurine / EADEM tube
// cluster within the source photo — this is where the view opens on.
const FOCUS_X_FRAC = 0.55;
const FOCUS_Y_FRAC = 0.52;

const LERP_FACTOR = 0.16;
const DRAG_RESISTANCE = 0.4;
const MOMENTUM_FRICTION = 0.93;
const VELOCITY_EPSILON = 0.4;

let bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
let panX = 0, panY = 0;
let targetX = 0, targetY = 0;
let velX = 0, velY = 0;
let isDragging = false;
let hasMomentum = false;
let lastPointer = { x: 0, y: 0, t: 0 };
let wheelSettleTimer = null;

function clampWithResistance(value, min, max, resistance) {
  if (value > max) return max + (value - max) * resistance;
  if (value < min) return min + (value - min) * resistance;
  return value;
}

function renderCollage() {
  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  if (viewportWidth === 0 || viewportHeight === 0) return;

  const coverScale = Math.max(
    viewportWidth / sourceImage.naturalWidth,
    viewportHeight / sourceImage.naturalHeight
  );
  const scale = coverScale * ZOOM_EXTRA;

  const dispWidth = Math.round(sourceImage.naturalWidth * scale);
  const dispHeight = Math.round(sourceImage.naturalHeight * scale);

  canvas.width = dispWidth;
  canvas.height = dispHeight;
  canvas.style.width = dispWidth + 'px';
  canvas.style.height = dispHeight + 'px';
  panLayer.style.width = dispWidth + 'px';
  panLayer.style.height = dispHeight + 'px';

  ctx.drawImage(sourceImage, 0, 0, dispWidth, dispHeight);
  const imageData = ctx.getImageData(0, 0, dispWidth, dispHeight);
  const data = imageData.data;

  for (let y = 0; y < dispHeight; y++) {
    const by = Math.floor(y / BLOCK_SIZE) % BAYER_SIZE;
    for (let x = 0; x < dispWidth; x++) {
      const bx = Math.floor(x / BLOCK_SIZE) % BAYER_SIZE;
      const threshold = (bayerMatrix[by][bx] + 0.5) / (BAYER_SIZE * BAYER_SIZE);

      const i = (y * dispWidth + x) * 4;
      const [wr, wg, wb] = applyWarmFilter(data[i], data[i + 1], data[i + 2]);

      data[i] = ditherChannel(wr, threshold, LEVELS);
      data[i + 1] = ditherChannel(wg, threshold, LEVELS);
      data[i + 2] = ditherChannel(wb, threshold, LEVELS);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  bounds = {
    minX: Math.min(0, viewportWidth - dispWidth),
    maxX: 0,
    minY: Math.min(0, viewportHeight - dispHeight),
    maxY: 0,
  };

  const focusX = FOCUS_X_FRAC * dispWidth;
  const focusY = FOCUS_Y_FRAC * dispHeight;
  const centeredX = viewportWidth / 2 - focusX;
  const centeredY = viewportHeight / 2 - focusY;

  panX = targetX = Math.min(Math.max(centeredX, bounds.minX), bounds.maxX);
  panY = targetY = Math.min(Math.max(centeredY, bounds.minY), bounds.maxY);
  panLayer.style.transform = `translate3d(${panX}px, ${panY}px, 0)`;
}

function tick() {
  if (hasMomentum && !isDragging) {
    targetX += velX;
    targetY += velY;
    velX *= MOMENTUM_FRICTION;
    velY *= MOMENTUM_FRICTION;
    targetX = clampWithResistance(targetX, bounds.minX, bounds.maxX, DRAG_RESISTANCE);
    targetY = clampWithResistance(targetY, bounds.minY, bounds.maxY, DRAG_RESISTANCE);

    if (Math.abs(velX) < VELOCITY_EPSILON && Math.abs(velY) < VELOCITY_EPSILON) {
      velX = 0;
      velY = 0;
      hasMomentum = false;
      // hard-clamp back into bounds; the lerp below eases it back smoothly (the "resistance" spring-back)
      targetX = Math.min(Math.max(targetX, bounds.minX), bounds.maxX);
      targetY = Math.min(Math.max(targetY, bounds.minY), bounds.maxY);
    }
  }

  panX += (targetX - panX) * LERP_FACTOR;
  panY += (targetY - panY) * LERP_FACTOR;
  panLayer.style.transform = `translate3d(${panX}px, ${panY}px, 0)`;

  requestAnimationFrame(tick);
}

viewport.addEventListener('pointerdown', (e) => {
  isDragging = true;
  hasMomentum = false;
  velX = 0;
  velY = 0;
  viewport.classList.add('is-dragging');
  viewport.setPointerCapture(e.pointerId);
  lastPointer = { x: e.clientX, y: e.clientY, t: performance.now() };
});

viewport.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const now = performance.now();
  const dt = Math.max(now - lastPointer.t, 1);
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;

  targetX = clampWithResistance(targetX + dx, bounds.minX, bounds.maxX, DRAG_RESISTANCE);
  targetY = clampWithResistance(targetY + dy, bounds.minY, bounds.maxY, DRAG_RESISTANCE);

  velX = (dx / dt) * 16;
  velY = (dy / dt) * 16;

  lastPointer = { x: e.clientX, y: e.clientY, t: now };
});

function endDrag(e) {
  if (!isDragging) return;
  isDragging = false;
  viewport.classList.remove('is-dragging');
  try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
  hasMomentum = true;
}

viewport.addEventListener('pointerup', endDrag);
viewport.addEventListener('pointercancel', endDrag);

viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  isDragging = false;
  hasMomentum = false;
  velX = 0;
  velY = 0;

  targetX = clampWithResistance(targetX - e.deltaX, bounds.minX, bounds.maxX, DRAG_RESISTANCE);
  targetY = clampWithResistance(targetY - e.deltaY, bounds.minY, bounds.maxY, DRAG_RESISTANCE);

  clearTimeout(wheelSettleTimer);
  wheelSettleTimer = setTimeout(() => {
    targetX = Math.min(Math.max(targetX, bounds.minX), bounds.maxX);
    targetY = Math.min(Math.max(targetY, bounds.minY), bounds.maxY);
  }, 150);
}, { passive: false });

sourceImage.onload = () => {
  sourceLoaded = true;
  renderCollage();
  requestAnimationFrame(tick);
};
sourceImage.src = 'assets/collage.jpg';

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (sourceLoaded) renderCollage();
  }, 150);
});

// --- Custom cursor: orange dot everywhere, morphs into the
// "BLUB BLUB BLUB!" badge while hovering the goldfish in the collage. ---

const customCursor = document.getElementById('custom-cursor');

// Normalized bounding box (0-1) of the goldfish within the source photo.
const FISH_BOUNDS = { xMin: 0.41, xMax: 0.55, yMin: 0.45, yMax: 0.68 };

document.addEventListener('mousemove', (e) => {
  customCursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
});

document.addEventListener('mouseleave', () => {
  customCursor.style.opacity = '0';
});

document.addEventListener('mouseenter', () => {
  customCursor.style.opacity = '1';
});

viewport.addEventListener('mousemove', (e) => {
  if (!sourceLoaded || canvas.width === 0) return;

  const rect = viewport.getBoundingClientRect();
  const canvasX = (e.clientX - rect.left) - panX;
  const canvasY = (e.clientY - rect.top) - panY;
  const fx = canvasX / canvas.width;
  const fy = canvasY / canvas.height;

  const overFish =
    fx >= FISH_BOUNDS.xMin && fx <= FISH_BOUNDS.xMax &&
    fy >= FISH_BOUNDS.yMin && fy <= FISH_BOUNDS.yMax;

  customCursor.classList.toggle('on-fish', overFish);
});

viewport.addEventListener('mouseleave', () => {
  customCursor.classList.remove('on-fish');
});
