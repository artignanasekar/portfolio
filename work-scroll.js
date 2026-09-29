/* Home page work row: vertical scroll drives a horizontal slide.

   The three case-study cards sit in one full-bleed row (.work-track). While
   the row is on screen, scrolling the page down slides it left instead of
   moving it up — 1px of scroll = 1px of slide — until SpeakEasy's right
   edge reaches the 30px gutter, then the page carries on to the footer.

   How: .work-stage is position:sticky, and .work-scroller is made exactly
   (row height + slide distance) tall, so the stage stays pinned for exactly
   `distance` px of scroll. The window stays the only real scroller, which
   keeps native momentum, iOS toolbar collapse, and the WORK nav link's
   window.scrollTo all behaving normally.

   The stage pins at the lower of: where it naturally sits at the top of the
   page (so the slide starts on the very first scroll when the hero and row
   both fit), or where the whole row just fits above the bottom of the
   window. Horizontal input — trackpad side-swipes and touch drags — is
   converted into page scroll too, so every gesture drives the same slide. */

const NAV_HEIGHT = 45;
const MIN_GAP_BELOW_NAV = 20;
const GAP_ABOVE_WINDOW_BOTTOM = 40;

const section = document.getElementById('work');
const scroller = section?.querySelector('.work-scroller');
const stage = section?.querySelector('.work-stage');
const track = section?.querySelector('.work-track');

if (section && scroller && stage && track) {
  section.classList.add('is-scrubbed');

  let stickTop = NAV_HEIGHT; // viewport y the stage pins at
  let distance = 0; // horizontal px the row slides
  let startY = 0; // window.scrollY where the slide starts
  let frame = 0;

  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function render() {
    frame = 0;
    const progress = distance
      ? clamp((stickTop - scroller.getBoundingClientRect().top) / distance, 0, 1)
      : 0;
    track.style.transform = `translate3d(${-progress * distance}px, 0, 0)`;
  }

  function requestRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function layout() {
    distance = Math.max(0, Math.round(track.offsetWidth - stage.clientWidth));
    const rowHeight = stage.offsetHeight;
    // clientHeight (the small viewport on iOS) rather than innerHeight,
    // which jumps as Safari's toolbar shows and hides
    const viewportHeight = document.documentElement.clientHeight;
    const scrollerTop = docTop(scroller);

    stickTop = Math.round(
      Math.min(
        scrollerTop,
        Math.max(NAV_HEIGHT + MIN_GAP_BELOW_NAV, viewportHeight - rowHeight - GAP_ABOVE_WINDOW_BOTTOM),
      ),
    );
    startY = scrollerTop - stickTop;

    stage.style.top = `${stickTop}px`;
    scroller.style.height = `${rowHeight + distance}px`;
    // shared.js's WORK link lands the page here: slide at its start, row pinned
    section.dataset.anchorOffset = String(stickTop - (scrollerTop - docTop(section)));
    render();
  }

  window.addEventListener('scroll', requestRender, { passive: true });
  window.addEventListener('resize', layout);
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(track);
  document.fonts?.ready.then(layout);
  layout();

  // --- horizontal input -> page scroll -----------------------------------

  // scroll by dy, but never let a sideways gesture push the page past the
  // ends of the slide (it can still move the page toward them)
  function scrollSideways(dy) {
    const y = window.scrollY;
    const lo = Math.min(startY, y);
    const hi = Math.max(startY + distance, y);
    window.scrollTo(0, clamp(y + dy, lo, hi));
  }

  // trackpad side-swipe / shift+wheel. Left alone at either end so the
  // browser's own back/forward swipe still works there.
  stage.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      const dx = e.deltaX * (e.deltaMode === 1 ? 16 : 1);
      const y = window.scrollY;
      if ((dx < 0 && y <= startY) || (dx > 0 && y >= startY + distance)) return;
      e.preventDefault();
      stopGlide();
      scrollSideways(dx);
    },
    { passive: false },
  );

  // touch / pen drag. touch-action: pan-y on the track hands vertical swipes
  // to the browser (they scroll the page, which slides the row anyway), so
  // the pointer events that reach us here are the horizontal drags.
  let drag = null;
  let glide = 0;
  let suppressClick = false;

  function stopGlide() {
    cancelAnimationFrame(glide);
    glide = 0;
  }

  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    stopGlide();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastT: e.timeStamp, v: 0, active: false };
  });

  track.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
      drag.active = true;
      suppressClick = true;
      track.setPointerCapture?.(e.pointerId);
    }
    const step = e.clientX - drag.lastX;
    const dt = Math.max(1, e.timeStamp - drag.lastT);
    drag.v = 0.8 * (-step / dt) + 0.2 * drag.v; // px of scroll per ms, smoothed
    drag.lastX = e.clientX;
    drag.lastT = e.timeStamp;
    scrollSideways(-step);
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { active, v } = drag;
    drag = null;
    if (!active || Math.abs(v) < 0.05) return;

    // let a flick coast to a stop, like a native swipe
    let velocity = v;
    let last = performance.now();
    const coast = (now) => {
      const dt = now - last;
      last = now;
      scrollSideways(velocity * dt);
      velocity *= Math.pow(0.95, dt / 16);
      glide = Math.abs(velocity) > 0.02 ? requestAnimationFrame(coast) : 0;
    };
    glide = requestAnimationFrame(coast);
  }

  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  // a drag that ends over a card shouldn't also open it
  track.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  track.addEventListener('pointerdown', () => { suppressClick = false; }, true);
}
