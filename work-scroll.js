/* Home page work row.

   On larger screens the home page is one fixed, window-sized view (see
   hero.css): nav, hero, the row of case-study cards, footer. The page never
   scrolls; instead every scroll gesture moves the row sideways, so scrolling
   the home page just means scrolling through the case studies.

   - Mouse wheel / trackpad: vertical (and horizontal) deltas scroll the row.
     Trackpad deltas are applied directly so they track the fingers; coarse
     mouse-wheel notches are eased so they glide instead of jumping.
   - Touch (tablets): sideways swipes are the row's own native scrolling;
     vertical swipes are converted into sideways movement too.
   - Keyboard: arrows / Page Up / Page Down / Space / Home / End.

   It also measures the tallest card caption and publishes it as
   --caption-h, which hero.css uses to cap the card size so cover + caption
   always fit the height available under the hero.

   On phones the page scrolls normally and the row is a plain native swipe
   row, so none of the input handling applies there. */

// keep in sync with the media queries in hero.css
const FIXED_LAYOUT = '(min-width: 561px) and (min-height: 700px)';

const stage = document.querySelector('.work-stage');
const track = stage?.querySelector('.work-track');

if (stage && track) {
  const fixedLayout = matchMedia(FIXED_LAYOUT);
  const maxScroll = () => stage.scrollWidth - stage.clientWidth;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // --- caption height -> card size ---------------------------------------

  // the caption's height depends on the card's width, which depends on the
  // caption height — so settle it in a few passes rather than one
  function fitCaptions() {
    for (let pass = 0; pass < 3; pass++) {
      const tallest = Math.max(
        0,
        ...[...track.querySelectorAll('.work-caption')].map((c) => c.offsetHeight),
      );
      if (!tallest) return; // not laid out yet (hidden behind the intro)
      const current = parseFloat(getComputedStyle(track).getPropertyValue('--caption-h')) || 0;
      if (Math.abs(tallest - current) < 1) break;
      track.style.setProperty('--caption-h', `${Math.ceil(tallest)}px`);
    }
  }

  let fitFrame = 0;
  const requestFit = () => {
    if (!fitFrame) fitFrame = requestAnimationFrame(() => { fitFrame = 0; fitCaptions(); });
  };
  // re-fit whenever the row or a caption changes size — window resizes,
  // fonts loading, and the page first being laid out after the intro
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(requestFit);
    ro.observe(stage);
    track.querySelectorAll('.work-caption').forEach((c) => ro.observe(c));
  } else {
    window.addEventListener('resize', requestFit);
  }
  document.fonts?.ready.then(requestFit);
  requestFit();

  // --- eased scrolling for coarse input ----------------------------------

  let target = 0;
  let glide = 0;

  function glideTo(x) {
    target = clamp(x, 0, maxScroll());
    if (glide) return;
    const step = () => {
      const diff = target - stage.scrollLeft;
      if (Math.abs(diff) < 0.5) {
        stage.scrollLeft = target;
        glide = 0;
        return;
      }
      stage.scrollLeft += diff * 0.18;
      glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  }

  function stopGlide() {
    cancelAnimationFrame(glide);
    glide = 0;
  }

  function scrollDirect(dx) {
    stopGlide();
    stage.scrollLeft = clamp(stage.scrollLeft + dx, 0, maxScroll());
  }

  // --- wheel / trackpad ----------------------------------------------------

  window.addEventListener(
    'wheel',
    (e) => {
      if (!fixedLayout.matches || e.ctrlKey) return; // ctrl = pinch-zoom
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      // sideways swipes over the row are its own native scroll already
      if (horizontal && stage.contains(e.target)) return;

      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientWidth : 1;
      const delta = (horizontal ? e.deltaX : e.deltaY) * unit;
      if (!delta) return;
      e.preventDefault();

      // small pixel deltas are a trackpad: follow them exactly. Big steps
      // are a mouse wheel: ease toward the new position.
      if (e.deltaMode === 0 && Math.abs(delta) < 60) scrollDirect(delta);
      else glideTo((glide ? target : stage.scrollLeft) + delta);
    },
    { passive: false },
  );

  // --- touch: vertical swipes move the row sideways ----------------------

  let touch = null;

  window.addEventListener(
    'touchstart',
    (e) => {
      if (!fixedLayout.matches || e.touches.length !== 1) return;
      stopGlide();
      const t = e.touches[0];
      touch = { x: t.clientX, y: t.clientY, lastY: t.clientY, lastT: e.timeStamp, v: 0, vertical: null };
    },
    { passive: true },
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      if (!touch || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (touch.vertical === null) {
        const dx = Math.abs(t.clientX - touch.x);
        const dy = Math.abs(t.clientY - touch.y);
        if (dx < 6 && dy < 6) return;
        touch.vertical = dy > dx;
      }
      if (!touch.vertical) return; // sideways: the row's native scroll handles it
      e.preventDefault();
      const step = touch.lastY - t.clientY;
      const dt = Math.max(1, e.timeStamp - touch.lastT);
      touch.v = 0.8 * (step / dt) + 0.2 * touch.v;
      touch.lastY = t.clientY;
      touch.lastT = e.timeStamp;
      scrollDirect(step);
    },
    { passive: false },
  );

  window.addEventListener('touchend', () => {
    if (!touch) return;
    const { vertical, v } = touch;
    touch = null;
    // let a flick coast, like a native swipe
    if (vertical && Math.abs(v) > 0.1) glideTo(stage.scrollLeft + v * 320);
  });

  // --- keyboard ----------------------------------------------------------

  window.addEventListener('keydown', (e) => {
    if (!fixedLayout.matches || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const page = stage.clientWidth * 0.8;
    const moves = {
      ArrowDown: 120,
      ArrowRight: 120,
      ArrowUp: -120,
      ArrowLeft: -120,
      PageDown: page,
      PageUp: -page,
      ' ': e.shiftKey ? -page : page,
      Home: -Infinity,
      End: Infinity,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const from = glide ? target : stage.scrollLeft;
    glideTo(Number.isFinite(moves[e.key]) ? from + moves[e.key] : moves[e.key]);
  });
}
