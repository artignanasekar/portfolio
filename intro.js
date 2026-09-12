// Home page intro — plays the "I SPY" kinetic sequence (intro.css), then
// reveals the real home page underneath.
//
// When it plays: a real reload (Cmd+R / F5) always plays it, and so does a
// fresh visit (typed URL, bookmark, external link). It skips only when
// you've arrived via a link from elsewhere on this same site — the nav
// bar's "ARTI G." / "WORK" links, a case study's own nav — since that's
// moving through the portfolio, not a first look at the home page.
//
// Dev convenience: visit "/?replay=1" to force it to play regardless of
// the above — handy while iterating on it directly.

const CSS_DURATION_MS = 5800; // matches intro.css's 5.8s animation-duration

// Once every tagline word has typed in ("A UX & PRODUCT DESIGNER WHO TURNS",
// the eye photo, all on screen together), the sequence naturally holds for a
// beat before moving into the CURIOSITY reveal — that hold happens to land
// right around here (30.065% of the CSS timeline, when "TURNS" — the last
// word — snaps in). This is a genuine pause/resume of the running CSS
// animations at that instant, not hand-rewritten keyframe percentages, so
// every element (bars, words, portrait, lashes, cycle words) stays in exact
// lockstep with each other — no risk of retiming one track relative to
// another across dozens of Figma-sourced keyframes.
const HOLD_AT_MS = 1744;
const HOLD_EXTRA_MS = 400; // how much longer to linger on that frame
const DURATION_MS = CSS_DURATION_MS + HOLD_EXTRA_MS; // real wall-clock length of one play-through, including the inserted hold

const overlay = document.getElementById('intro-overlay');
const stage = document.querySelector('.intro-stage');

const forceReplay = new URLSearchParams(location.search).get('replay') !== null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isReload = (() => {
  const [navEntry] = performance.getEntriesByType('navigation');
  return navEntry ? navEntry.type === 'reload' : false;
})();
const cameFromWithinSite = (() => {
  if (!document.referrer) return false;
  try {
    return new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
})();
const shouldSkip = forceReplay ? false : (!isReload && cameFromWithinSite);

function removeOverlay() {
  if (overlay) overlay.remove();
}

if (!overlay || !stage || prefersReducedMotion || shouldSkip) {
  removeOverlay();
} else {
  runIntro();
}

function runIntro() {
  // --- scale the fixed 1512x982 stage to the viewport. ---
  // Default (>=900px wide): "cover" — fill the viewport, cropping whichever
  // axis has room to spare, same approach hero.js used for the old hero.
  // Small window (<900px wide): "cover" would crop away most of the
  // composition, so switch to a padded "contain" fit instead — as large as
  // it goes with a 30px gutter (30px on the tight axis, more on the other,
  // which on a narrow window means extra room top and bottom). intro.css
  // paints that gutter to match the stage edge (see .intro-contain there).
  const INTRO_PAD = 30;
  function fitStage() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const small = vw < 900;
    const scale = small
      ? Math.min((vw - INTRO_PAD * 2) / 1512, (vh - INTRO_PAD * 2) / 982)
      : Math.max(vw / 1512, vh / 982);
    stage.style.setProperty('--intro-scale', scale);
    overlay.classList.toggle('intro-contain', small);
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  // --- Bayer 16x16 + warm filter, identical algorithm to about.js, applied
  // at runtime to the two intro photos so they match the rest of the
  // site's dithered-photo look instead of Figma's WebGPU shader effects. ---
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

  // two Figma dither presets in play: the photos (portrait + CURIOSITY
  // strip) use a bold, coarse setting; the small phase-A eyebrow icon uses
  // the original fine 16x16 one — its flat color has almost no headroom
  // under the coarse preset's levels, so it renders flat under that one.
  const DITHER_BOLD = { bayerSize: 2, blockSize: 3, levels: 3 };
  const DITHER_FINE = { bayerSize: 8, blockSize: 2, levels: 4 };
  const bayerMatrixCache = new Map();
  function getBayerMatrix(size) {
    if (!bayerMatrixCache.has(size)) bayerMatrixCache.set(size, generateBayerMatrix(size));
    return bayerMatrixCache.get(size);
  }

  function renderDitheredPhoto(canvas, img, { bayerSize, blockSize, levels }) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const bayerMatrix = getBayerMatrix(bayerSize);

    for (let y = 0; y < h; y++) {
      const by = Math.floor(y / blockSize) % bayerSize;
      for (let x = 0; x < w; x++) {
        const bx = Math.floor(x / blockSize) % bayerSize;
        const threshold = (bayerMatrix[by][bx] + 0.5) / (bayerSize * bayerSize);
        const i = (y * w + x) * 4;
        const [wr, wg, wb] = applyWarmFilter(data[i], data[i + 1], data[i + 2]);
        data[i] = ditherChannel(wr, threshold, levels);
        data[i + 1] = ditherChannel(wg, threshold, levels);
        data[i + 2] = ditherChannel(wb, threshold, levels);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function loadAndDither(canvasSelector, src, config) {
    const canvas = document.querySelector(canvasSelector);
    if (!canvas) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => renderDitheredPhoto(canvas, img, config);
    img.src = src;
  }

  loadAndDither('#intro-portrait-canvas', 'assets/intro/portrait-raw.jpg', DITHER_BOLD);
  loadAndDither('#intro-brow-small-canvas', 'assets/intro/eyebrow.svg', DITHER_FINE);
  document.querySelectorAll('.intro-strip-canvas').forEach((canvas) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => renderDitheredPhoto(canvas, img, DITHER_BOLD);
    img.src = canvas.dataset.src;
  });

  // --- play once, then hand off to the real home page ---
  // debug hook: ?freeze=<ms> in the URL freezes every animation at that
  // exact timeline position synchronously, for deterministic screenshotting
  // during development. Not used in normal operation.
  const freezeMs = new URLSearchParams(location.search).get('freeze');

  // hold timers (see HOLD_AT_MS) — kept in scope so a skip can cancel them
  let holdTimer = null;
  let holdResumeTimer = null;

  requestAnimationFrame(() => {
    stage.classList.add('is-playing');
    // overlay gets it too, so intro.css can run the gutter-colour track
    // (.intro-overlay.intro-contain.is-playing) in lockstep with the stage
    // — it's picked up by the same getAnimations() pause/scrub below.
    overlay.classList.add('is-playing');
    if (freezeMs !== null) {
      // the browser doesn't instantiate the newly-triggered CSS animations
      // synchronously within this same callback — wait one more frame so
      // getAnimations() actually sees them before pausing/scrubbing.
      requestAnimationFrame(() => {
        document.getAnimations().forEach((a) => {
          a.pause();
          a.currentTime = Number(freezeMs);
        });
      });
      return;
    }

    // linger on the "everything's loaded" frame — see the HOLD_AT_MS comment
    // up top.
    holdTimer = setTimeout(() => {
      const anims = document.getAnimations();
      anims.forEach((a) => a.pause());
      holdResumeTimer = setTimeout(() => anims.forEach((a) => a.play()), HOLD_EXTRA_MS);
    }, HOLD_AT_MS);
  });

  if (freezeMs !== null) return;

  // --- end the intro and hand off to the real home page underneath. Runs
  // once, whichever comes first: the sequence finishing on its own
  // (DURATION_MS), or the visitor clicking / tapping / pressing a key to skip
  // it. Either way it's the same soft 0.4s fade-out (.intro-overlay.is-ending)
  // so a skip doesn't read as a hard cut. ---
  let finished = false;
  function finishIntro() {
    if (finished) return;
    finished = true;

    clearTimeout(window.__introHandoffTimer);
    clearTimeout(holdTimer);
    clearTimeout(holdResumeTimer);
    window.removeEventListener('pointerdown', finishIntro);
    window.removeEventListener('keydown', finishIntro);

    overlay.classList.add('is-ending');
    setTimeout(removeOverlay, 400);
  }

  window.__introHandoffTimer = setTimeout(finishIntro, DURATION_MS);
  window.addEventListener('pointerdown', finishIntro);
  window.addEventListener('keydown', finishIntro);
}
