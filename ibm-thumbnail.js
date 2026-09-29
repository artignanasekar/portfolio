/* IBM animated thumbnail: on IBM blue, two partitions split the card into
   thirds, dotted guides slide in and the eye, bee and M are drawn as white
   blueprint outlines. The partitions drop away and the colour snaps in behind
   them top to bottom, the card drops to black and the eye and M slide in and
   snap into place beside the bee to form the Eye-Bee-M. One GSAP timeline
   drives every beat; tweak the config below.

   Units: everything is in the SVG's viewBox units, i.e. the Figma frame
   (571 wide), so it scales with the card. Guide positions are local to each
   element (its Figma group, origin top left). The markup is the final Figma
   composition on black, which is also the static / reduced-motion frame. */
import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { watchThumb, prefersReducedMotion } from './thumbnail-player.js';

gsap.registerPlugin(DrawSVGPlugin);

const config = {
  loop: 6.5, // seconds; the reset below must end by here
  blue: '#0F62FE', // IBM Blue 60
  black: '#000000',
  line: '#ffffff',

  // 1. two solid lines split the card into thirds, top to bottom
  partitions: { start: 0, duration: 0.5, stagger: 0.1, ease: 'power2.inOut', width: 1 },

  // 2. blueprint: dotted guides wipe in from their `from` edge (a sliding
  // clip, so the dots never stretch), then each piece's outline draws
  // outward from the guide intersection nearest to it
  guides: {
    width: 1,
    dash: '1 3', // dot, gap (screen px, as the stroke doesn't scale)
    opacity: 0.85,
    start: 0.6,
    thirdStagger: 0.15, // eye, then bee, then M
    stagger: 0.06, // between guides of one element
    duration: 0.4,
    ease: 'power2.out',
    // axis h = horizontal line at y, v = vertical line at x (element-local)
    eye: [
      { axis: 'h', at: 0, from: 'left' }, // top of the brow
      { axis: 'v', at: 59.44, from: 'top' }, // through the pupil
      { axis: 'h', at: 33.15, from: 'right' }, // top of the eye
      { axis: 'h', at: 114.85, from: 'left' } // bottom of the eye
    ],
    bee: [
      { axis: 'h', at: 0, from: 'right' }, // top of the antennae
      { axis: 'v', at: 90.51, from: 'bottom' }, // centre line
      { axis: 'h', at: 27.43, from: 'left' }, // top of the body
      { axis: 'h', at: 114.88, from: 'right' } // tip of the body
    ],
    m: [
      { axis: 'h', at: 0, from: 'right' }, // top edge
      { axis: 'v', at: 0, from: 'top' }, // left edge
      { axis: 'v', at: 122.88, from: 'bottom' }, // right edge
      { axis: 'h', at: 110.02, from: 'left' } // bottom edge
    ]
  },
  outlines: {
    width: 1,
    after: 0.6, // start once both guides of the intersection are this far through their wipe
    duration: 0.45,
    stagger: 0.02, // between pieces of one element
    ease: 'power1.inOut'
  },
  // hold the finished blueprint until the fill starts (~0.3s)

  // 3. partitions drop out the bottom and the colour snaps in behind them:
  // each piece switches on (no fade) the moment the partitions' top edge
  // passes its centre, with a quick scale pop, so the fill sweeps top to bottom
  partitionsOut: { start: 2.3, duration: 0.45, stagger: 0.05, ease: 'power2.in' },
  fill: {
    lag: 0, // seconds after the partitions pass before a piece snaps in
    duration: 0.18, // scale pop
    fromScale: 0.85,
    ease: 'back.out(3)'
  },
  guidesOut: { start: 2.3, duration: 0.2 },

  // 4. background blue -> black
  background: { start: 2.9, duration: 0.15, ease: 'none' },

  // 5. eye and M slide in beside the bee (they start centred in their thirds):
  // they accelerate in, hit `overshoot` units past their spot, then the
  // elastic settle clicks them into place
  snap: {
    start: 3.1,
    duration: 0.7,
    ease: 'power3.in',
    overshoot: 5,
    settle: 0.35,
    settleEase: 'elastic.out(1.2, 0.35)'
  },

  // 6. hold on the finished logo until the reset (~4.15-6.0s)

  // 7. reset: the art fades and the black crossfades back to blue
  reset: { start: 6.0, fade: 0.3, fadeEase: 'power1.in', bgDuration: 0.5, bgEase: 'power1.inOut' }
};

const root = document.querySelector('.ibm-thumb');
// the markup is the final composition, so reduced motion just leaves it be
if (root && !prefersReducedMotion()) init(root);

function init(root) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = root.querySelector('.ibm-thumb-art');
  const bg = svg.querySelector('.ibm-bg');
  const art = svg.querySelector('.ibm-art');
  const vb = svg.viewBox.baseVal;
  const third = vb.width / 3;

  const make = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  const stroke = (width, extra) => ({
    fill: 'none', stroke: config.line, 'stroke-width': width, 'vector-effect': 'non-scaling-stroke', ...extra
  });

  // ---- elements ------------------------------------------------------------

  // each Figma group gets a wrapper that does the sliding, so its own
  // translate (its Figma position) is never touched
  const elements = ['eye', 'bee', 'm'].map((name, i) => {
    const group = art.querySelector(`.ibm-${name}`);
    const slide = make('g', { class: 'ibm-slide' });
    group.before(slide);
    slide.appendChild(group);
    const m = group.transform.baseVal.consolidate().matrix;
    const box = group.getBBox();
    const centre = m.e + box.x + box.width / 2;
    const home = vb.x + third * (i + 0.5); // centre of its third
    return {
      name, group, slide, i,
      ox: m.e, oy: m.f,
      offset: name === 'bee' ? 0 : home - centre, // blueprint position, relative to final
      pieces: [...group.children],
      third: { x: vb.x + third * i, y: vb.y, w: third, h: vb.height }
    };
  });
  const byName = Object.fromEntries(elements.map((e) => [e.name, e]));
  const pieces = elements.flatMap((e) => e.pieces);

  // ---- layers: guides under partitions, both under the art ------------------

  const defs = make('defs', {});
  bg.after(defs);
  const guideLayer = make('g', { class: 'ibm-guides' });
  defs.after(guideLayer);
  const partLayer = make('g', { class: 'ibm-partitions' });
  guideLayer.after(partLayer);

  const partitions = [1, 2].map((k) => make('line', {
    x1: vb.x + third * k, x2: vb.x + third * k, y1: vb.y, y2: vb.y + vb.height,
    ...stroke(config.partitions.width)
  }, partLayer));

  // guides: a full-length line in the element's third, revealed by sliding
  // its clip rect in from the `from` edge
  const g = config.guides;
  const guides = elements.flatMap((e) => g[e.name].map((spec, k) => {
    const t = e.third;
    const id = `ibm-clip-${e.name}-${k}`;
    const clip = make('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, defs);
    const rect = make('rect', { x: t.x, y: t.y, width: t.w, height: t.h }, clip);
    const line = spec.axis === 'h'
      ? { x1: t.x, x2: t.x + t.w, y1: e.oy + spec.at, y2: e.oy + spec.at }
      : { x1: e.ox + e.offset + spec.at, x2: e.ox + e.offset + spec.at, y1: t.y, y2: t.y + t.h };
    make('line', { ...line, ...stroke(g.width, { 'stroke-dasharray': g.dash, 'clip-path': `url(#${id})` }) }, guideLayer);
    const hidden = {
      left: { x: -t.w, y: 0 }, right: { x: t.w, y: 0 }, top: { x: 0, y: -t.h }, bottom: { x: 0, y: t.h }
    }[spec.from];
    const start = g.start + e.i * g.thirdStagger + k * g.stagger;
    return { ...spec, el: e.name, rect, hidden, start };
  }));

  // outlines: white strokes cloned from the fills (compound paths split into
  // one outline per subpath), inside the same group so they line up exactly
  const outlines = new Map(); // piece -> its outline elements
  elements.forEach((e) => {
    const layer = make('g', { class: 'ibm-outlines' }, e.group);
    e.pieces.forEach((p) => {
      const parts = p.tagName === 'path' ? p.getAttribute('d').split(/(?=M)/) : [null];
      outlines.set(p, parts.map((d) => {
        const o = p.cloneNode();
        o.removeAttribute('class');
        if (d) o.setAttribute('d', d);
        for (const [k, v] of Object.entries(stroke(config.outlines.width))) o.setAttribute(k, v);
        layer.appendChild(o);
        return o;
      }));
    });
  });

  // where each outline starts drawing: the point on it nearest the closest
  // guide intersection of its element, as a percentage of its length
  const outlineStarts = [];
  elements.forEach((e) => {
    const eg = guides.filter((gd) => gd.el === e.name);
    const hs = eg.filter((gd) => gd.axis === 'h'), vs = eg.filter((gd) => gd.axis === 'v');
    const crossings = hs.flatMap((h) => vs.map((v) => ({
      x: v.at, y: h.at, t: Math.max(h.start, v.start) + g.duration * config.outlines.after
    })));
    e.pieces.forEach((p, n) => outlines.get(p).forEach((o) => {
      const len = o.getTotalLength();
      let best = { d: Infinity };
      for (let s = 0; s <= 200; s++) {
        const pt = o.getPointAtLength((len * s) / 200);
        for (const c of crossings) {
          const d = Math.hypot(pt.x - c.x, pt.y - c.y);
          if (d < best.d) best = { d, pct: s / 2, c };
        }
      }
      outlineStarts.push({ o, pct: best.pct, t: best.c.t + n * config.outlines.stagger });
    }));
  });

  // fill pops scale from each piece's centre (set once, while nothing is transformed)
  gsap.set(pieces, { transformOrigin: '50% 50%' });

  // ---- timeline --------------------------------------------------------------

  const tl = gsap.timeline({ paused: true, repeat: -1 });

  // start state (re-applied at every loop restart)
  const reset = () => {
    gsap.set(bg, { fill: config.blue });
    gsap.set(partitions, { drawSVG: '0% 0%', y: 0 });
    gsap.set(guideLayer, { opacity: g.opacity });
    guides.forEach((gd) => gsap.set(gd.rect, gd.hidden));
    gsap.set(art, { opacity: 1 });
    elements.forEach((e) => gsap.set(e.slide, { x: e.offset }));
    gsap.set(pieces, { opacity: 0, scale: config.fill.fromScale });
    outlineStarts.forEach(({ o }) => gsap.set(o, { drawSVG: '0% 0%', opacity: 1 }));
  };
  reset();
  tl.call(reset, null, 0);

  // 1. partitions
  const pa = config.partitions;
  tl.to(partitions, { drawSVG: '0% 100%', duration: pa.duration, ease: pa.ease, stagger: pa.stagger }, pa.start);

  // 2. blueprint: guides wipe in, outlines grow out of their intersections
  guides.forEach((gd) => tl.to(gd.rect, { x: 0, y: 0, duration: g.duration, ease: g.ease }, gd.start));
  const ol = config.outlines;
  outlineStarts.forEach(({ o, pct, t }) => {
    tl.fromTo(o, { drawSVG: `${pct}% ${pct}%` }, { drawSVG: '0% 100%', duration: ol.duration, ease: ol.ease }, t);
  });

  // 3. partitions drop out the bottom, guides fade, colour snaps in behind
  const po = config.partitionsOut;
  tl.to(partitions, { y: vb.height, duration: po.duration, ease: po.ease, stagger: po.stagger }, po.start);
  tl.to(guideLayer, { opacity: 0, duration: config.guidesOut.duration, ease: 'none' }, config.guidesOut.start);

  // when does the (eased) top edge of the first partition reach frame y?
  const drop = gsap.parseEase(po.ease);
  const passes = (y) => {
    const target = (y - vb.y) / vb.height;
    let lo = 0, hi = 1;
    for (let j = 0; j < 30; j++) { const mid = (lo + hi) / 2; if (drop(mid) < target) lo = mid; else hi = mid; }
    return po.start + lo * po.duration;
  };
  const fi = config.fill;
  elements.forEach((e) => e.pieces.forEach((p) => {
    const b = p.getBBox();
    const t = passes(e.oy + b.y + b.height / 2) + fi.lag;
    tl.set(p, { opacity: 1 }, t)
      .to(p, { scale: 1, duration: fi.duration, ease: fi.ease }, t)
      .set(outlines.get(p), { opacity: 0 }, t);
  }));

  // 4. blue -> black
  const bgc = config.background;
  tl.to(bg, { fill: config.black, duration: bgc.duration, ease: bgc.ease }, bgc.start);

  // 5. eye and M slide in beside the bee and snap into place
  const sn = config.snap;
  [byName.eye, byName.m].forEach((e) => {
    const past = -Math.sign(e.offset) * sn.overshoot;
    tl.to(e.slide, { x: past, duration: sn.duration, ease: sn.ease }, sn.start)
      .to(e.slide, { x: 0, duration: sn.settle, ease: sn.settleEase }, sn.start + sn.duration);
  });

  // 7. reset: fade the art, black back to blue
  const re = config.reset;
  tl.to(art, { opacity: 0, duration: re.fade, ease: re.fadeEase }, re.start)
    .to(bg, { fill: config.blue, duration: re.bgDuration, ease: re.bgEase }, re.start);

  tl.set({}, {}, config.loop);

  watchThumb(root, { play: () => tl.play(), pause: () => tl.pause() });
}
