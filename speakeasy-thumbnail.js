/* SpeakEasy animated thumbnail: the mic drops in on its cord, SPEAKEASY
   slides together with its taglines, the letters morph into an audio meter
   around the mic, then the right-hand columns fold into the four game cards,
   flip over to show the real cards and snap out the top before looping.
   One GSAP timeline drives every beat; tweak the config below.

   Units: sizes and distances in config are thumbnail units, where the frame
   is 521 x 296 (the SVG viewBox), so everything scales with the card. The
   letters and mic live inside .se-stage in their original Figma coordinates
   ("local" units); toLocal() converts. */
import { gsap } from 'gsap';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { watchThumb, prefersReducedMotion } from './thumbnail-player.js';

gsap.registerPlugin(MorphSVGPlugin);

const config = {
  speed: 1.12, // playback rate for the whole loop (1.12 -> ~6.7s real time)
  emptyBeat: 0.15, // empty white frame after the cards leave, before the restart

  // lockup: SPEAKEASY + mic + taglines, centred in the frame
  lockupScale: 0.49, // Figma px -> thumbnail units (0.49 ~ 213 of 296 units tall)
  taglineScale: 0.8, // taglines relative to Figma; they keep their edges on the cord and their baseline

  micDrop: { start: 0, duration: 0.7, ease: 'back.out(1.4)', swing: 0.8, swingEase: 'elastic.out(1, 0.45)' },

  // straight slide, no overshoot, so nothing crosses the mic or the cord
  lockIn: {
    start: 0.5,
    duration: 0.65,
    stagger: 0.05,
    distance: 360, // how far off-frame the letters and taglines start
    ease: 'power3.out'
  },
  // lockup holds from the end of lockIn (~1.3s) to morph.start

  taglineOut: { start: 1.9, duration: 0.4, ease: 'back.in(1.4)' },

  // waveform: 4 columns | mic | 4 columns, centred on the mic, with the same
  // gap between neighbouring columns and between the mic and its neighbours
  columnWidth: 22,
  columnGap: 11,
  columnHeight: 64, // resting height
  columnRadius: 6, // keep below columnWidth / 2 or the columns turn into pills
  morph: { start: 1.95, duration: 0.6, stagger: 0.03, ease: 'back.out(1.5)' },

  meter: {
    start: 2.55,
    end: 3.9, // every column is back at columnHeight by here
    beats: 5, // height changes per column before settling
    offset: 0.04, // per-column delay so they don't move in lockstep
    min: 28,
    max: 150,
    seed: 7, // fixed seed: the meter plays the same heights every loop
    ease: 'back.out(2)'
  },

  // columns -> cards: a vertical feed of Figma cards at their true 342:135
  // proportions. The first card sits near the top with the next one peeking
  // (red, unflipped) below; the feed scrolls up one card at a time and each
  // card flips over while it scrolls into place.
  cardWidth: 400, // card height follows from the Figma aspect ratio
  cardTop: 44, // top of the first card
  cardGap: 12,
  leftExit: { start: 3.9, duration: 0.35, ease: 'power2.in' },
  toCards: { start: 3.9, duration: 0.6, stagger: 0.04, ease: 'back.out(1.3)' },
  flip: { start: 4.6, duration: 0.5, angle: 180, ease: 'back.out(1.2)' }, // first card
  // one continuous scroll through cards 2-4 (no stops); each card's flip
  // finishes exactly as it reaches the top slot
  scroll: { start: 4.9, duration: 1.6, ease: 'sine.inOut', flipDuration: 0.45, flipEase: 'power2.inOut' },

  // leaves `delay` seconds after the last card finishes flipping
  exit: { delay: 0.1, duration: 0.35, stagger: 0.04, ease: 'power4.in' }
};

const root = document.querySelector('.speakeasy-thumb');
if (root) init(root);

function init(root) {
  const FRAME_W = 521, FRAME_H = 296;
  // lockup bounds in local (Figma vector) units: taglines top to EASY bottom
  const TAGS = { // Figma geometry; each scales toward the cord and its bottom edge
    left: { right: 261.868, bottom: 516.13, w: 193.886, h: 102.13 },
    right: { left: 338.013, bottom: 516.186, w: 221.058, h: 101.19 }
  };
  const MIC = { cx: 307, cy: 629.5, left: 259, right: 355, cordTop: 0 };

  const stage = root.querySelector('.se-stage');
  const mic = root.querySelector('.se-mic');
  const tagLeft = root.querySelector('.se-tag-left');
  const tagRight = root.querySelector('.se-tag-right');
  const left = gsap.utils.toArray(root.querySelectorAll('.se-letter.se-left'));
  const right = gsap.utils.toArray(root.querySelectorAll('.se-letter.se-right'));
  const layer = root.querySelector('.speakeasy-thumb-cards');
  const cards = gsap.utils.toArray(root.querySelectorAll('.se-card'));
  const flips = cards.map((c) => c.querySelector('.se-card-flip'));

  const ts = config.taglineScale;
  const tagL = TAGS.left, tagR = TAGS.right;
  tagLeft.setAttribute('x', tagL.right - tagL.w * ts);
  tagLeft.setAttribute('y', tagL.bottom - tagL.h * ts);
  tagLeft.setAttribute('width', tagL.w * ts);
  tagLeft.setAttribute('height', tagL.h * ts);
  tagRight.setAttribute('x', tagR.left);
  tagRight.setAttribute('y', tagR.bottom - tagR.h * ts);
  tagRight.setAttribute('width', tagR.w * ts);
  tagRight.setAttribute('height', tagR.h * ts);
  // lockup bounds in local units: tagline tops to the bottom of EASY
  const top = Math.min(tagL.bottom - tagL.h * ts, tagR.bottom - tagR.h * ts);
  const LOCKUP = { x: 0, y: top, w: 629, h: 868 - top };

  const S = config.lockupScale;
  const TX = (FRAME_W - LOCKUP.w * S) / 2 - LOCKUP.x * S;
  const TY = (FRAME_H - LOCKUP.h * S) / 2 - LOCKUP.y * S;
  const toLocal = (v) => v / S;
  stage.setAttribute('transform', `translate(${TX.toFixed(2)} ${TY.toFixed(2)}) scale(${S.toFixed(6)})`);

  // the markup is the static lockup, so reduced motion just leaves it be
  if (prefersReducedMotion()) return;

  // ---- geometry ----------------------------------------------------------

  // rounded rect as a closed path, always the same command sequence so
  // rect-to-rect morphs line up point for point
  function rectPath(cx, cy, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    const k = r * 0.5523, x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    const f = (n) => +n.toFixed(2);
    return `M${f(x0 + r)} ${f(y0)}H${f(x1 - r)}C${f(x1 - r + k)} ${f(y0)} ${f(x1)} ${f(y0 + r - k)} ${f(x1)} ${f(y0 + r)}` +
      `V${f(y1 - r)}C${f(x1)} ${f(y1 - r + k)} ${f(x1 - r + k)} ${f(y1)} ${f(x1 - r)} ${f(y1)}` +
      `H${f(x0 + r)}C${f(x0 + r - k)} ${f(y1)} ${f(x0)} ${f(y1 - r + k)} ${f(x0)} ${f(y1 - r)}` +
      `V${f(y0 + r)}C${f(x0)} ${f(y0 + r - k)} ${f(x0 + r - k)} ${f(y0)} ${f(x0 + r)} ${f(y0)}Z`;
  }

  const colW = toLocal(config.columnWidth);
  const colGap = toLocal(config.columnGap);
  const radius = toLocal(config.columnRadius);
  // column centres, left block right-aligned to the mic, right block mirrored
  const colX = (side, i) => side === 'left'
    ? MIC.left - colGap - colW / 2 - (3 - i) * (colW + colGap)
    : MIC.right + colGap + colW / 2 + i * (colW + colGap);
  const column = (side, i, h) => rectPath(colX(side, i), MIC.cy, colW, toLocal(h), radius);

  // card feed in thumbnail units: Figma's 342 x 135 card scaled uniformly by
  // k, centred, stacked top to bottom (cards 3 and 4 start below the frame)
  const k = config.cardWidth / 342;
  const cardH = 135 * k;
  const step = cardH + config.cardGap; // one scroll of the feed
  const slots = [0, 1, 2, 3].map((i) => ({
    x: (FRAME_W - config.cardWidth) / 2, y: config.cardTop + i * step, w: config.cardWidth, h: cardH
  }));
  const cardRadius = 15 * k; // Figma card corner, so front and back match

  // place the HTML cards
  layer.style.setProperty('--k', k.toFixed(4));
  layer.style.setProperty('--radius', cardRadius.toFixed(2));
  cards.forEach((card, i) => {
    const s = slots[i];
    Object.assign(card.style, {
      left: (s.x / FRAME_W) * 100 + '%',
      top: (s.y / FRAME_H) * 100 + '%',
      width: (s.w / FRAME_W) * 100 + '%',
      height: (s.h / FRAME_H) * 100 + '%'
    });
  });

  // seeded meter heights (mulberry32) so every loop plays the same meter
  let seed = config.meter.seed >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const meterHeights = [...left, ...right].map(() =>
    Array.from({ length: config.meter.beats }, () => config.meter.min + rand() * (config.meter.max - config.meter.min)));

  // ---- timeline ----------------------------------------------------------

  const tl = gsap.timeline({ paused: true, repeat: -1 });
  const slide = toLocal(config.lockIn.distance);

  // start state (re-applied at every loop restart)
  const reset = () => {
    gsap.set(mic, { y: -toLocal(FRAME_H) * 1.1, x: 0, rotation: config.micDrop.swing, svgOrigin: `${MIC.cx} ${MIC.cordTop}` });
    gsap.set([...left, tagLeft], { x: -slide, y: 0, opacity: 1 });
    gsap.set([...right, tagRight], { x: slide, y: 0, opacity: 1, rotation: 0 });
    gsap.set(cards, { opacity: 0, yPercent: 0 });
    gsap.set(flips, { rotationX: 0 });
  };
  reset();
  tl.call(reset, null, 0);

  // 1. mic drop, hanging from its cord
  const md = config.micDrop;
  tl.to(mic, { y: 0, duration: md.duration, ease: md.ease }, md.start)
    .to(mic, { rotation: 0, duration: md.duration * 1.3, ease: md.swingEase }, md.start);

  // 2. lockup: letters and taglines slide in from their sides
  const li = config.lockIn;
  tl.to(left, { x: 0, duration: li.duration, ease: li.ease, stagger: { each: li.stagger, from: 'end' } }, li.start)
    .to(right, { x: 0, duration: li.duration, ease: li.ease, stagger: li.stagger }, li.start)
    .to([tagLeft, tagRight], { x: 0, duration: li.duration, ease: li.ease }, li.start + li.stagger);

  // 3. letters become the waveform
  const to = config.taglineOut;
  tl.to([tagLeft, tagRight], { y: -toLocal(FRAME_H), duration: to.duration, ease: to.ease }, to.start);

  const mo = config.morph;
  [left, right].forEach((group) => group.forEach((el, i) => {
    const side = group === left ? 'left' : 'right';
    const order = side === 'left' ? 3 - i : i; // ripple out from the mic
    tl.to(el, {
      morphSVG: { shape: column(side, i, config.columnHeight), shapeIndex: 'auto' },
      duration: mo.duration, ease: mo.ease
    }, mo.start + order * mo.stagger);
  }));

  const me = config.meter;
  [...left, ...right].forEach((el, n) => {
    const side = n < 4 ? 'left' : 'right', i = n % 4;
    const t0 = me.start + n * me.offset;
    const beat = (me.end - t0) / (me.beats + 1);
    [...meterHeights[n], config.columnHeight].forEach((h, b) => {
      tl.to(el, {
        morphSVG: { shape: column(side, i, h), shapeIndex: 0 },
        duration: beat, ease: me.ease
      }, t0 + b * beat);
    });
  });

  // 4. columns become the cards
  const le = config.leftExit;
  tl.to([mic, ...left], { x: -toLocal(FRAME_W), duration: le.duration, ease: le.ease }, le.start);

  const tc = config.toCards;
  right.forEach((el, i) => {
    const s = slots[i];
    const cx = colX('right', i), cy = MIC.cy;
    const tx = toLocal(TX), ty = toLocal(TY);
    const cardCx = toLocal(s.x + s.w / 2) - tx, cardCy = toLocal(s.y + s.h / 2) - ty;
    tl.set(el, { svgOrigin: `${cx} ${cy}` }, tc.start)
      .to(el, {
        // upright rect of the card's size turned a quarter CCW = the card
        morphSVG: { shape: rectPath(cx, cy, toLocal(s.h), toLocal(s.w), toLocal(cardRadius)), shapeIndex: 0 },
        rotation: -90,
        x: cardCx - cx,
        y: cardCy - cy,
        duration: tc.duration, ease: tc.ease
      }, tc.start + i * tc.stagger);
  });

  // swap the settled SVG rects for the identical HTML card fronts
  const handoff = tc.start + 3 * tc.stagger + tc.duration;
  tl.set(cards, { opacity: 1 }, handoff).set(right, { opacity: 0 }, handoff);

  // first card flips in place
  const fl = config.flip;
  tl.to(flips[0], { rotationX: fl.angle, duration: fl.duration, ease: fl.ease }, Math.max(fl.start, handoff));

  // the feed scrolls up one card at a time; each incoming card flips while
  // it moves, so it arrives already revealed
  const sc = config.scroll;
  const feedY = (n) => (-n * step / cardH) * 100; // yPercent after n scrolls
  const last = cards.length - 1;
  tl.to(cards, { yPercent: feedY(last), duration: sc.duration, ease: sc.ease }, sc.start);
  // when does the eased scroll reach card n? invert the ease numerically
  const ease = gsap.parseEase(sc.ease);
  const reach = (p) => {
    let lo = 0, hi = 1;
    for (let j = 0; j < 30; j++) { const mid = (lo + hi) / 2; if (ease(mid) < p) lo = mid; else hi = mid; }
    return sc.start + lo * sc.duration;
  };
  for (let n = 1; n <= last; n++) {
    const arrive = reach(n / last);
    tl.to(flips[n], { rotationX: fl.angle, duration: sc.flipDuration, ease: sc.flipEase }, arrive - sc.flipDuration);
  }

  // 5. snap out the top
  const ex = config.exit;
  tl.to(cards, {
    yPercent: feedY(last) - ((config.cardTop + cardH) / cardH) * 100 - 10,
    // only the last two cards are still in view; stagger from them
    duration: ex.duration, ease: ex.ease, stagger: (i) => Math.max(0, i - (last - 1)) * ex.stagger
  }, reach(1) + ex.delay - ex.stagger); // so the last card leaves exactly `delay` after its flip

  tl.set({}, {}, tl.duration() + config.emptyBeat);

  tl.timeScale(config.speed);
  watchThumb(root, { play: () => tl.play(), pause: () => tl.pause() });
}
