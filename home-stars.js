/* Home page star stamps — snowflakes in winter, see SEASON below (experiment — Figma "stars", node 1833:392).
   Clicking empty space on the home page snaps one of the about page's 15
   stars (5 stars x 3 colourways) onto the page where you clicked, at a
   random rotation. Then it behaves like a medium-heavy rubber ball: it
   falls, bounces low, and rolls — with real spin, so it speeds up rolling
   down a curve and slowly rolls to a stop on the flat. Stars collide with
   the text, the case-study covers, the hero eye and each other, trading momentum like
   equal-weight balls: roll one into a resting star and both roll on.
   Wherever a star comes to rest stably (flat on a line of text, on a
   cover, balanced in a mound of other stars) it stays until something
   moving hits it. Stars bounce off the underside of the nav bar too. The
   eye in the hero (home-eye.js) can also shoot a burst of stars out with
   launchStars(). A star that reaches the footer bursts into its own
   dithered pixels. Press and hold a star and it shakes harder and harder
   until it bursts too — and the burst ripples on through every star it
   was touching, and every star those were touching. Stars sit behind the text and case studies, so they
   never block a click. With reduced motion on, stars just stay where you
   click.

   Each star gets the Figma frame's Dither effect (Bayer 16x16, size 1,
   levels 3, brightness 100%, contrast 1, mono off, no colour filter),
   baked once per star as soon as the PNGs load, so a click never waits on
   it. Figma dithers at the star's own 291px size; the browser then scales
   that down smoothly to the on-page size, which blends the dots into the
   same subtle texture you see in Figma. */

import { SNOWFLAKES, SNOW_COLORS, snowflakeSVG, ditherSnowflake, ditherSVG } from './snowflakes.js';
import { TWOTONE_FLAKES, PAIRS, twotoneSVG } from './twotone-snowflakes.js';

// which shapes get stamped:
//   'twotone' — winter: two-colour line snowflakes (twotone-snowflakes.js)
//   'snow'    — the earlier single-colour snowflakes (snowflakes.js)
//   'stars'   — the original stars. Flip back to this after winter.
// Everything else (physics, bursts, the eye's launch) is shared.
const SEASON = 'twotone';

// the two-tone flakes in use, and their colours: every pair from the
// stars' trios, both ways round (either colour can be the line-work),
// except pale-on-pale, which faded into the page background
const TWOTONE_PICKS = ['bloom', 'anchor', 'kite', 'lens', 'chevron', 'arrow'];
const PALE = ['#ffc74c', '#ceeaee', '#f8c9dd'];
const TWOTONE_PAIRS = PAIRS.flatMap(([a, b]) => [[a, b], [b, a]])
  .filter(([a, b]) => !(PALE.includes(a) && PALE.includes(b)));

const STARS = [1, 2, 3, 4, 5].flatMap((n) => ['a', 'b', 'c'].map((v) => `assets/star${n}-${v}.png`));

const RES = 291; // the stars' size in Figma, where size 1 = one dot per Figma px

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
  const scaled = (value / 255) * (levels - 1);
  const base = Math.floor(scaled);
  const out = scaled - base > threshold ? base + 1 : base;
  return Math.round((out / (levels - 1)) * 255);
}

const BAYER_SIZE = 16;
const BLOCK_SIZE = 1;
const LEVELS = 3;
const bayerMatrix = generateBayerMatrix(BAYER_SIZE);

function ditherStar(img) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = RES;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, RES, RES);
  const imageData = ctx.getImageData(0, 0, RES, RES);
  const data = imageData.data;

  for (let y = 0; y < RES; y++) {
    const by = Math.floor(y / BLOCK_SIZE) % BAYER_SIZE;
    for (let x = 0; x < RES; x++) {
      const bx = Math.floor(x / BLOCK_SIZE) % BAYER_SIZE;
      const threshold = (bayerMatrix[by][bx] + 0.5) / (BAYER_SIZE * BAYER_SIZE);
      const i = (y * RES + x) * 4;
      data[i] = ditherChannel(data[i], threshold, LEVELS);
      data[i + 1] = ditherChannel(data[i + 1], threshold, LEVELS);
      data[i + 2] = ditherChannel(data[i + 2], threshold, LEVELS);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  // the URL draws the star; the pixels are what it bursts into
  return { url: canvas.toDataURL(), pixels: imageData };
}

// --- bouncy-ball physics (px and seconds, in .page coordinates) ---------

// Rigid-ball model: every star is a solid ball of the same mass (m = 1)
// with spin. Contacts push apart along the normal and apply Coulomb friction
// along the surface, and the friction acts on the spin as well as the
// speed, so sliding turns into rolling the way a real ball's does.

const GRAVITY = 2200;
const RESTITUTION = 0.4; // share of impact speed bounced back: a medium-heavy ball
const BOUNCE_MIN = 40; // slower impacts than this don't bounce at all, they settle
// a star isn't a perfect ball: it lands on whichever point hits first, which
// knocks it a little sideways. Up to this share of the impact speed, so a
// hard landing can tip it into a roll and a soft one barely shifts it.
const LANDING_TIP = 0.06;
const MU = 0.4; // surface friction: how hard contact grips (turns slide into roll)
const INERTIA = 0.4; // solid ball: I = 2/5 m R^2
const ROLL_RESIST = 14; // rolling resistance, rad/s^2. Higher than a smooth ball: the
// star's points dig in, which is what lets stars pile into a mound (perfectly
// round balls just roll apart) while a hit still sends one rolling a fair way
const MAX_SPEED = 1500;
const RADIUS = 26; // collision radius: a bit inside the 64px star's points
const STAR_SIZE = 64; // CSS px — keep in sync with .home-star in hero.css
const SNAP_MS = 300; // let the snap-in play before it starts to fall
const SUBSTEPS = 4; // physics steps per frame, so fast stars don't skip contacts
const ITERATIONS = 4; // contact passes per step, so mounds settle instead of sagging
const SLEEP_SPEED = 10; // slower than this (moving and spinning) while held up...
const SLEEP_AFTER = 0.4; // ...for this long (s) and the star settles
// a settled star wakes as soon as something actually moves into it — faster
// than this. (Weight alone, a star resting on it under gravity, stays below
// it, so a balanced mound doesn't keep waking itself.)
const WAKE_SPEED = 15;

// press-and-hold detonation: the held star shakes for PRESS_MS (harder and
// harder) then bursts; each star touching a bursting one starts shaking
// RIPPLE_DELAY later, shakes for RIPPLE_SHAKE, and bursts in turn
const PRESS_MS = 650;
const PRESS_SHAKE = 1; // shake strength (1 = full rattle) for the held star
const RIPPLE_DELAY = 110;
const RIPPLE_SHAKE = 260;
const RIPPLE_SHAKE_STRENGTH = 1.2; // ripple stars are already rattled: they shake harder
// the rattle: the star rocks back and forth on its centre, faster and wider
// as it builds, with a little sideways jiggle — a physical shake, not static
const RATTLE_DEG = 9; // peak rock, degrees either way
const RATTLE_PX = 1.5; // peak jiggle
const RATTLE_HZ = [7, 26]; // rock speed at the start and at the end
// it swells as the pressure builds, then sucks in tight for a beat right
// before it pops (TIGHTEN = the last share of the shake spent doing that)
const SWELL = 0.12;
const TIGHTEN = 0.14;
const TIGHT_SCALE = 0.86;
// the blast shoves every star nearby straight out from the centre — hardest
// up close, nothing past BLAST_RADIUS — with a lift, like a real pop
const BLAST_RADIUS = 150;
const BLAST_SPEED = 420;
const BLAST_LIFT = 120;
// for the ripple, "touching" means the drawn stars' points meet (their
// centres within one star width), not just their collision circles
const TOUCH_DIST = STAR_SIZE;
const GRAB_RADIUS = 32; // how near the star's centre a press has to land
const PRESS_SLOP = 10; // px the pointer can wander before the press is off

// the burst: the star breaks into PIXEL-px squares sampled from its own
// dithered image, which fly up and out and fall away
const PIXEL = 3;
const BURST_GRAVITY = 1600;
const BURST_W = 420;
const BURST_H = 380;
const BURST_CX = BURST_W / 2; // where the star's centre sits in the burst canvas
const BURST_CY = 280;

// what the stars bounce off: each line of text (its actual inked width,
// not the full paragraph box) and each case-study cover
const SOLID_TEXT = '.home-hero-tagline, .home-hero-intro, .work-meta, .work-title, .work-desc';
const SOLID_BOX = '.work-card > :first-child';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// the eye's surprise (home-eye.js): a handful of stars shot out of a point,
// one after another, mostly up and out — the upward ones hard enough to
// reach the nav bar. Stars from the same burst ignore each other for their
// first moment so they don't collide while still bunched at the launch point.
const LAUNCH_COUNT = 8;
const LAUNCH_STAGGER = 60; // ms between stars
const LAUNCH_SPEED = [600, 1050]; // px/s
const LAUNCH_GHOST = 250; // ms a launched star passes through its burst-mates

// set up below once the page is ready; a no-op until then (and with reduced motion)
export let launchStars = () => {};

const page = document.querySelector('.page');

if (page) {
  const layer = document.createElement('div');
  layer.className = 'home-stars';
  layer.setAttribute('aria-hidden', 'true');
  page.prepend(layer);

  // dithered versions replace the plain PNGs as each one finishes loading;
  // until then a click falls back to the plain star
  let sources;
  let pickSource = () => sources[Math.floor(Math.random() * sources.length)];
  if (SEASON === 'twotone') {
    const flakes = TWOTONE_FLAKES.filter((f) => TWOTONE_PICKS.includes(f.name))
      .flatMap((f) => TWOTONE_PAIRS.map((p) => [f, p]));
    // pick the line-work colour first, evenly, so each of the 7 colours
    // leads equally often (some colours have more partners than others)
    const byLine = new Map();
    flakes.forEach(([, [line]], i) => byLine.set(line, [...(byLine.get(line) || []), i]));
    pickSource = () => {
      const groups = [...byLine.values()];
      const group = groups[Math.floor(Math.random() * groups.length)];
      return sources[group[Math.floor(Math.random() * group.length)]];
    };
    sources = flakes.map(([f, p]) => ({
      url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(twotoneSVG(f, p, STAR_SIZE)),
      pixels: null,
    }));
    flakes.forEach(([f, p], i) => {
      ditherSVG((px) => twotoneSVG(f, p, px), STAR_SIZE).then((done) => { sources[i] = done; }, () => {});
    });
  } else if (SEASON === 'snow') {
    const flakes = SNOWFLAKES.flatMap((f) => SNOW_COLORS.map((c) => [f, c]));
    sources = flakes.map(([f, c]) => ({
      url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(snowflakeSVG(f, c, STAR_SIZE)),
      pixels: null,
    }));
    flakes.forEach(([f, c], i) => {
      ditherSnowflake(f, c, STAR_SIZE).then((done) => { sources[i] = done; }, () => {});
    });
  } else {
    sources = STARS.map((url) => ({ url, pixels: null }));
    STARS.forEach((src, i) => {
      const img = new Image();
      img.onload = () => { sources[i] = ditherStar(img); };
      img.src = src;
    });
  }

  // anything you can read or click isn't "empty space"
  const NOT_EMPTY = 'a, button, p, h1, h2, h3, img, svg, canvas, .nav-bar, .site-footer, .work-card';

  const stars = [];
  let frame = 0;
  let last = 0;

  let solids = null; // cached obstacle rects; layout only moves on resize/fonts
  let eyeShape = null; // the hero eye's almond, measured alongside them
  const relayout = () => {
    solids = null;
    stars.forEach(wake); // what they were resting on may have moved
  };
  window.addEventListener('resize', relayout);
  document.fonts?.ready.then(relayout);

  function measureSolids(origin) {
    const rects = [];
    const add = (r) => {
      if (r.width && r.height) {
        rects.push({ l: r.left - origin.left, r: r.right - origin.left, t: r.top - origin.top, b: r.bottom - origin.top });
      }
    };
    const range = document.createRange();
    page.querySelectorAll(SOLID_TEXT).forEach((el) => {
      range.selectNodeContents(el);
      [...range.getClientRects()].forEach(add);
    });
    page.querySelectorAll(SOLID_BOX).forEach((el) => add(el.getBoundingClientRect()));
    return rects;
  }

  // the hero eye is an obstacle too, shaped like the almond it is: two
  // circular arcs meeting at the tips (the lens where two circles overlap),
  // so stars roll over its curved top and slide off its points
  function measureEye(origin) {
    const el = page.querySelector('.home-eye');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const a = r.width / 2; // half the width, tip to tip
    const b = r.height / 2; // half the height
    const R = (a * a + b * b) / (2 * b); // radius of each arc
    const cx = r.left + a - origin.left;
    return { cx, topY: r.top - origin.top + R, bottomY: r.bottom - origin.top - R, R };
  }

  // distance from the star's centre to the almond's edge (negative inside),
  // and the outward direction there: the lens is inside both circles, so its
  // distance is the larger of the two circles' distances
  function collideEye(star, eye) {
    const dx = star.x - eye.cx;
    const d1y = star.y - eye.topY; // from the circle that draws the top arc
    const d2y = star.y - eye.bottomY; // ...and the bottom arc
    const d1 = Math.hypot(dx, d1y);
    const d2 = Math.hypot(dx, d2y);
    const top = d1 - eye.R >= d2 - eye.R;
    const gap = Math.max(d1, d2) - eye.R;
    if (star.passEye) {
      // shot out of the pupil: free of the eye only once it's clear of it
      if (gap >= RADIUS) star.passEye = false;
      return;
    }
    if (gap >= RADIUS) return;
    const d = top ? d1 : d2;
    if (!d) return;
    resolve(star, null, dx / d, (top ? d1y : d2y) / d, RADIUS - gap);
  }

  function wake(star) {
    if (!star.asleep) return;
    star.asleep = false;
    star.still = 0;
    // anything settled on or against it may lose its footing too
    stars.forEach((other) => {
      if (other.asleep && Math.hypot(other.x - star.x, other.y - star.y) < RADIUS * 2 + 2) wake(other);
    });
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  }

  function squash(star, nx, ny, speed) {
    if (speed <= 150 || speed < star.squash * 2200) return;
    // squash flat against the surface, then wobble back
    star.squash = Math.min(0.25, speed / 2600);
    star.squashAngle = Math.atan2(ny, nx);
    star.squashT = 0;
  }

  // Contact between star a and either a fixed surface (b = null) or star b.
  // (nx, ny) is the unit normal pointing from b's side toward a. Applies the
  // normal impulse (bounce or settle) and then friction, both to the speeds
  // and the spins, with each body's share set by its inverse mass.
  function resolve(a, b, nx, ny, depth) {
    // something moving into a settled star wakes it first, so the hit is
    // worked out between two free balls and momentum passes on properly
    if (b && b.asleep) {
      const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (closing > WAKE_SPEED) wake(b);
    }
    const invA = 1;
    const invB = b && !b.asleep ? 1 : 0; // a settled star holds firm like ground
    const total = invA + invB;
    a.x += (nx * depth * invA) / total;
    a.y += (ny * depth * invA) / total;
    if (invB) {
      b.x -= (nx * depth * invB) / total;
      b.y -= (ny * depth * invB) / total;
    }

    const bvx = b ? b.vx : 0;
    const bvy = b ? b.vy : 0;
    const vn = (a.vx - bvx) * nx + (a.vy - bvy) * ny; // < 0: closing
    if (ny < -0.5) a.resting = true; // held up from below
    if (b && ny > 0.5) b.resting = true;
    if (vn >= 0) return;

    const e = -vn > BOUNCE_MIN ? RESTITUTION : 0;
    const jn = (-(1 + e) * vn) / total;
    a.vx += jn * nx * invA; a.vy += jn * ny * invA;
    if (invB) { b.vx -= jn * nx; b.vy -= jn * ny; }
    if (e) {
      // landed on a point, not dead centre: a small sideways knock
      const tip = (Math.random() * 2 - 1) * LANDING_TIP * -vn;
      a.vx += -ny * tip;
      a.vy += nx * tip;
    }
    squash(a, nx, ny, -vn);
    if (b) squash(b, -nx, -ny, -vn);

    // friction: kill the slip between the two touching surfaces. The
    // contact point is RADIUS from each centre, so spin adds to its speed;
    // the tangential effective mass includes each ball's rotational inertia.
    const tx = -ny;
    const ty = nx;
    const bw = b ? b.w : 0;
    // slip at the contact: a's surface moves at v_a·t - w_a R there (its
    // contact point faces -n); b's (facing +n) at v_b·t + w_b R
    const rel = (a.vx - bvx) * tx + (a.vy - bvy) * ty - RADIUS * a.w - RADIUS * bw;
    const tangentMass = invA * (1 + 1 / INERTIA) + invB * (1 + 1 / INERTIA);
    let jt = -rel / tangentMass;
    const maxF = MU * jn;
    jt = Math.max(-maxF, Math.min(maxF, jt));
    a.vx += jt * tx * invA; a.vy += jt * ty * invA;
    a.w -= (jt * invA) / (INERTIA * RADIUS);
    if (invB) {
      b.vx -= jt * tx; b.vy -= jt * ty;
      b.w -= jt / (INERTIA * RADIUS);
    }

  }

  function collideSolid(star, o) {
    const cx = Math.min(Math.max(star.x, o.l), o.r);
    const cy = Math.min(Math.max(star.y, o.t), o.b);
    let nx = star.x - cx;
    let ny = star.y - cy;
    const d = Math.hypot(nx, ny);
    if (d >= RADIUS) return;
    if (d === 0) { // centre ended up inside: pop it out the top
      resolve(star, null, 0, -1, RADIUS + (star.y - o.t));
      return;
    }
    resolve(star, null, nx / d, ny / d, RADIUS - d);
  }

  function collideStars(a, b) {
    let nx = a.x - b.x;
    let ny = a.y - b.y;
    const d = Math.hypot(nx, ny);
    if (d >= RADIUS * 2) return;
    if (d === 0) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
    // resolve from the moving star's side, so a settled one acts as ground
    if (a.asleep) resolve(b, a, -nx, -ny, RADIUS * 2 - d);
    else resolve(a, b, nx, ny, RADIUS * 2 - d);
  }

  function draw(star, dt) {
    star.spin += (star.w * dt * 180) / Math.PI;
    star.img.style.setProperty('--spin', `${star.spin.toFixed(1)}deg`);

    let wobble = '';
    if (star.squash) {
      star.squashT += dt;
      const k = star.squash * Math.exp(-star.squashT * 9) * Math.cos(star.squashT * 32);
      if (star.squashT > 0.6) star.squash = 0;
      const a = star.squashAngle;
      wobble = ` rotate(${a}rad) scale(${1 - k}, ${1 + k}) rotate(${-a}rad)`;
    }
    star.el.style.transform = `translate(${star.x - star.x0}px, ${star.y - star.y0}px)${wobble}`;
  }

  // the star falls apart into its own dithered pixels: every PIXEL-px cell
  // of the star becomes a square of that cell's colour, starting exactly
  // where it was drawn (rotation included), then flies up and out
  // fromFooter: kicked up off the footer; otherwise it pops out every way
  function burst(star, fromFooter) {
    let pixels = star.pixels;
    if (!pixels) { // dithered copy wasn't ready: read the plain star
      const c = document.createElement('canvas');
      c.width = c.height = RES;
      const ctx = c.getContext('2d');
      ctx.drawImage(star.img, 0, 0, RES, RES);
      pixels = ctx.getImageData(0, 0, RES, RES);
    }

    const angle = ((star.turn + star.spin) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cells = Math.floor(STAR_SIZE / PIXEL);
    const bits = [];
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++) {
        const res = pixels.width; // 291 for stars; snowflakes bake at a size that fits the screen
        const u = Math.floor(((gx + 0.5) * PIXEL / STAR_SIZE) * res);
        const v = Math.floor(((gy + 0.5) * PIXEL / STAR_SIZE) * res);
        const i = (v * res + u) * 4;
        if (pixels.data[i + 3] < 128) continue;
        const lx = (gx + 0.5) * PIXEL - STAR_SIZE / 2;
        const ly = (gy + 0.5) * PIXEL - STAR_SIZE / 2;
        const ox = lx * cos - ly * sin;
        const oy = lx * sin + ly * cos;
        const dist = Math.hypot(ox, oy) || 1;
        const speed = fromFooter ? 160 + Math.random() * 300 : 120 + Math.random() * 220;
        const kick = fromFooter ? 260 + Math.random() * 220 : 140 + Math.random() * 100;
        bits.push({
          x: BURST_CX + ox,
          y: BURST_CY + oy,
          vx: (ox / dist) * speed + (Math.random() - 0.5) * 120,
          vy: (oy / dist) * speed * (fromFooter ? 0.6 : 1) - kick,
          life: 0.6 + Math.random() * 0.6,
          color: `rgb(${pixels.data[i]}, ${pixels.data[i + 1]}, ${pixels.data[i + 2]})`,
        });
      }
    }

    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.className = 'home-star-burst';
    canvas.width = BURST_W * dpr;
    canvas.height = BURST_H * dpr;
    canvas.style.width = `${BURST_W}px`;
    canvas.style.height = `${BURST_H}px`;
    canvas.style.left = `${star.x - BURST_CX}px`;
    canvas.style.top = `${star.y - BURST_CY}px`;
    layer.append(canvas);
    star.el.remove();

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    let age = 0;
    let prev = performance.now();
    requestAnimationFrame(function tick(now) {
      const dt = Math.min((now - prev) / 1000, 1 / 30);
      prev = now;
      age += dt;
      ctx.clearRect(0, 0, BURST_W, BURST_H);
      let alive = 0;
      for (const p of bits) {
        if (age >= p.life) continue;
        alive++;
        p.vy += BURST_GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const fade = Math.min(1, (p.life - age) / (p.life * 0.4)); // fades over its last 40%
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), PIXEL, PIXEL);
      }
      if (alive) requestAnimationFrame(tick);
      else canvas.remove();
    });
  }

  function step(now) {
    const frameDt = Math.min((now - last) / 1000, 1 / 30); // no huge jumps after a hidden tab
    last = now;
    const dt = frameDt / SUBSTEPS;

    const origin = page.getBoundingClientRect();
    if (!solids) {
      solids = measureSolids(origin);
      eyeShape = measureEye(origin);
    }
    const width = page.clientWidth;
    const footer = document.querySelector('.site-footer');
    const floor = footer ? footer.getBoundingClientRect().top - origin.top : Infinity;
    // the nav bar is a ceiling: stars bounce off its underside
    const nav = document.querySelector('.nav-bar');
    const ceiling = nav ? nav.getBoundingClientRect().bottom - origin.top : -Infinity;

    // a star still snapping in hasn't let go yet: it neither moves nor collides
    const live = stars.filter((star) => now >= star.wakeAt);

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      for (const star of live) {
        star.resting = false;
        if (star.asleep) continue;
        star.vy += GRAVITY * dt;
        const speed = Math.hypot(star.vx, star.vy);
        if (speed > MAX_SPEED) {
          star.vx *= MAX_SPEED / speed;
          star.vy *= MAX_SPEED / speed;
        }
        star.x += star.vx * dt;
        star.y += star.vy * dt;
      }

      for (let pass = 0; pass < ITERATIONS; pass++) {
        for (const star of live) {
          if (star.asleep) continue;
          // side walls
          if (star.x < RADIUS) resolve(star, null, 1, 0, RADIUS - star.x);
          if (star.x > width - RADIUS) resolve(star, null, -1, 0, star.x - (width - RADIUS));
          if (star.y - RADIUS < ceiling) resolve(star, null, 0, 1, ceiling - (star.y - RADIUS));
          for (const o of solids) collideSolid(star, o);
          if (eyeShape) collideEye(star, eyeShape);
        }
        for (let i = 0; i < live.length; i++) {
          for (let j = i + 1; j < live.length; j++) {
            const a = live[i];
            const b = live[j];
            if (a.asleep && b.asleep) continue;
            // burst-mates pass through each other until they've spread out
            if (a.burst && a.burst === b.burst && (now < a.ghostUntil || now < b.ghostUntil)) continue;
            collideStars(a, b);
          }
        }
      }

      // rolling resistance: a rolling ball slowly winds down
      for (const star of live) {
        if (star.asleep || !star.resting) continue;
        const drop = ROLL_RESIST * dt;
        star.w = Math.abs(star.w) <= drop ? 0 : star.w - Math.sign(star.w) * drop;
      }
    }

    for (const star of live) {
      if (star.asleep) continue;
      if (star.y + RADIUS >= floor) {
        stars.splice(stars.indexOf(star), 1);
        burst(star, true);
        continue;
      }

      // held up, barely moving and barely spinning for a moment: it settles
      const slow = Math.hypot(star.vx, star.vy) < SLEEP_SPEED && Math.abs(star.w) * RADIUS < SLEEP_SPEED;
      star.still = star.resting && slow ? star.still + frameDt : 0;
      if (star.still >= SLEEP_AFTER) {
        star.asleep = true;
        star.vx = 0;
        star.vy = 0;
        star.w = 0;
      }
      draw(star, frameDt);
    }

    const busy = stars.some((star) => !star.asleep);
    frame = busy ? requestAnimationFrame(step) : 0;
  }

  // --- press and hold to detonate --------------------------------------

  const shaking = new Map(); // star -> { start, duration, amp, onDone }
  let shakeFrame = 0;

  function shake(star, duration, strength, onDone) {
    const now = performance.now();
    shaking.set(star, { start: now, last: now, phase: Math.random() * Math.PI * 2, duration, strength, onDone });
    if (!shakeFrame) shakeFrame = requestAnimationFrame(shakeStep);
  }

  function stopShake(star) {
    shaking.delete(star);
    star.img.style.translate = '';
    star.img.style.rotate = '';
    star.img.style.scale = '';
  }

  // the rattle rides on the image's own rotate/translate/scale, so it
  // stacks on top of whatever the physics is doing with the star
  function shakeStep(now) {
    for (const [star, s] of shaking) {
      const p = Math.min(1, (now - s.start) / s.duration);
      // rock speed climbs as it builds; integrating it keeps the motion smooth
      const hz = RATTLE_HZ[0] + (RATTLE_HZ[1] - RATTLE_HZ[0]) * p;
      s.phase += 2 * Math.PI * hz * ((now - s.last) / 1000);
      s.last = now;
      const build = s.strength * (0.2 + 0.8 * p * p);
      const rock = RATTLE_DEG * build * Math.sin(s.phase);
      const jx = RATTLE_PX * build * Math.sin(s.phase * 1.7 + 1);
      const jy = RATTLE_PX * build * 0.6 * Math.sin(s.phase * 1.3 + 2);

      // swell with the pressure, then suck in tight right before it pops
      const tightenAt = 1 - TIGHTEN;
      const scale = p < tightenAt
        ? 1 + SWELL * (p / tightenAt) ** 2
        : 1 + SWELL + (TIGHT_SCALE - 1 - SWELL) * ((p - tightenAt) / TIGHTEN);

      star.img.style.rotate = `${rock.toFixed(2)}deg`;
      star.img.style.translate = `${jx.toFixed(2)}px ${jy.toFixed(2)}px`;
      star.img.style.scale = scale.toFixed(3);
      if (p >= 1) {
        stopShake(star);
        s.onDone();
      }
    }
    shakeFrame = shaking.size ? requestAnimationFrame(shakeStep) : 0;
  }

  const doomed = new Set(); // already bursting or queued to, so the ripple doesn't double back

  function detonate(star) {
    const i = stars.indexOf(star);
    if (i === -1) return; // already gone (e.g. it reached the footer)
    stars.splice(i, 1);
    burst(star, false);

    // the ripple: everything touching it is next
    for (const other of stars) {
      if (doomed.has(other)) continue;
      if (Math.hypot(other.x - star.x, other.y - star.y) > TOUCH_DIST) continue;
      doomed.add(other);
      setTimeout(() => {
        if (!stars.includes(other)) return;
        shake(other, RIPPLE_SHAKE, RIPPLE_SHAKE_STRENGTH, () => detonate(other));
      }, RIPPLE_DELAY);
    }

    // the blast: knock everything nearby outward (and free anything that
    // was leaning on it to fall)
    stars.forEach((other) => {
      wake(other);
      const dx = other.x - star.x;
      const dy = other.y - star.y;
      const d = Math.hypot(dx, dy);
      if (d >= BLAST_RADIUS) return;
      const push = BLAST_SPEED * (1 - d / BLAST_RADIUS);
      other.vx += (dx / (d || 1)) * push;
      other.vy += (dy / (d || 1)) * push - BLAST_LIFT * (1 - d / BLAST_RADIUS);
    });
  }

  let press = null; // { star, x, y } — the star being held, and where the press began
  let swallowClick = false; // a finished long press shouldn't also drop a new star

  function starAt(x, y) {
    let best = null;
    let bestD = GRAB_RADIUS;
    for (const star of stars) {
      if (doomed.has(star)) continue;
      const d = Math.hypot(star.x - x, star.y - y);
      if (d < bestD) { best = star; bestD = d; }
    }
    return best;
  }

  function cancelPress() {
    if (!press) return;
    if (!doomed.has(press.star)) stopShake(press.star);
    press = null;
  }

  page.addEventListener('pointerdown', (e) => {
    swallowClick = false; // a fresh press: whatever the last one did is over
    if (e.button !== 0 || e.target.closest(NOT_EMPTY)) return;
    const box = page.getBoundingClientRect();
    const star = starAt(e.clientX - box.left, e.clientY - box.top);
    if (!star) return;

    cancelPress();
    press = { star, x: e.clientX, y: e.clientY };
    shake(star, PRESS_MS, PRESS_SHAKE, () => {
      doomed.add(star);
      swallowClick = true;
      press = null;
      detonate(star);
    });
  });

  page.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > PRESS_SLOP) cancelPress();
  });
  window.addEventListener('pointerup', cancelPress);
  window.addEventListener('pointercancel', cancelPress);

  // holding a finger on a star shouldn't pop up the phone's long-press menu
  page.addEventListener('contextmenu', (e) => {
    const box = page.getBoundingClientRect();
    if (starAt(e.clientX - box.left, e.clientY - box.top)) e.preventDefault();
  });

  // a new star at (x, y) in page coordinates. Dropped stars hang for the
  // snap-in, then let go from rest; launched ones fly off straight away.
  function addStar(x, y, { vx = 0, vy = 0, delay = SNAP_MS, burst = null } = {}) {
    const { url, pixels } = pickSource();
    const turn = Math.round(Math.random() * 360);

    const el = document.createElement('div');
    el.className = 'home-star';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.style.setProperty('--turn', `${turn}deg`);
    el.append(img);
    layer.append(el);

    if (reducedMotion.matches) return; // stays where it appeared

    const now = performance.now();
    stars.push({
      el, img, pixels, turn,
      x, y, x0: x, y0: y,
      vx, vy,
      w: 0, // spin, rad/s (clockwise)
      spin: 0, squash: 0, squashAngle: 0, squashT: 0,
      resting: false, still: 0, asleep: false,
      wakeAt: now + delay,
      burst, ghostUntil: now + delay + (burst ? LAUNCH_GHOST : 0),
      passEye: !!burst, // launched from inside the eye: let it out first
    });
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
  }

  page.addEventListener('click', (e) => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (e.button !== 0 || e.target.closest(NOT_EMPTY)) return;

    const box = page.getBoundingClientRect();
    addStar(e.clientX - box.left, e.clientY - box.top); // drops straight down from here
  });

  // clientX/clientY: the launch point on screen
  launchStars = (clientX, clientY) => {
    if (reducedMotion.matches) return;
    const burst = {};
    // fire the slots in a shuffled order, like the old random spin of the circle
    const slots = [...Array(LAUNCH_COUNT).keys()].sort(() => Math.random() - 0.5);
    for (let i = 0; i < LAUNCH_COUNT; i++) {
      // evenly spread over the top half of the circle with a little wobble,
      // never below sideways: anything shot downward would land in the gap
      // under the eye (narrower than a star) and wedge there on the tagline
      const spread = (slots[i] + 0.5) / LAUNCH_COUNT + (Math.random() - 0.5) * 0.08;
      const angle = -Math.PI * Math.min(1, Math.max(0, spread));
      const up = Math.max(0, -Math.sin(angle)); // 1 straight up, 0 sideways or down
      const speed = LAUNCH_SPEED[0] + (LAUNCH_SPEED[1] - LAUNCH_SPEED[0]) * (0.3 * Math.random() + 0.7 * up);
      setTimeout(() => {
        const box = page.getBoundingClientRect();
        addStar(clientX - box.left, clientY - box.top, {
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          delay: 0,
          burst,
        });
      }, i * LAUNCH_STAGGER);
    }
  };
}
