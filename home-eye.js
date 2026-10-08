/* The eye in the home hero (Figma 1884:337, blink 1886:312).

   - Its star cut-out — the pupil — looks toward the cursor (or finger),
     sliding inside the almond and easing back to centre when the pointer
     leaves the window.
   - Left alone, it blinks every few seconds.
   - Poke it and it flinches and says something, in turn: OUCH! -> PSST
     SCROLL DOWN -> WANT TO PLAY A GAME? GO TO ABOUT (a link). Poke it
     POKE_LIMIT times in POKE_WINDOW and it gets fed up.
   - Poke the white star itself and, every so often, it's a SURPRISE!: the
     eye pops wide and shoots a burst of stars out of the pupil, which then
     tumble around with the rest (home-stars.js).

   The look (dithered almond, star mask) is in hero.css; this only moves the
   mask and toggles states. */

import { launchStars } from './home-stars.js';

// where the pupil (the star mask) sits when looking straight ahead, and how
// far it can slide before it would break through the almond's edge
const PUPIL_REST = { x: 34, y: 5 };
const PUPIL_TRAVEL = { x: 17, y: 3 };
const PUPIL_SIZE = { w: 58, h: 57.5 }; // keep in sync with the mask size in hero.css
const LOOK_REACH = 320; // px from the eye at which it's looking as far as it can
const LOOK_EASE = 0.16; // share of the remaining distance covered each frame

const BLINK_MS = 130;
const BLINK_EVERY = [2500, 6000]; // ms, random in between
const IDLE_AFTER_POKE = 2500; // ms before it goes back to blinking on its own

const MESSAGES = ['OUCH!', 'PSST SCROLL DOWN', 'WANT TO PLAY A GAME? GO TO ABOUT'];
const FED_UP = 'BOY STOP POKING ME';
const POKE_LIMIT = 4;
const POKE_WINDOW = 3000; // ms
const SURPRISE = 'SURPRISE!';
const SURPRISE_CHANCE = 0.35; // for a poke right in the star
const SURPRISE_COOLDOWN = 2500; // ms
const SHOW_MS = 1600;
const SHOW_LINK_MS = 3200; // the about-page link stays up long enough to click

const eye = document.querySelector('.home-eye');
const body = eye?.querySelector('.home-eye-body');
const pop = document.querySelector('.home-eye-pop');

if (eye && body && pop) {
  // --- hit testing: is a point on the orange, in the star, or neither? ---

  // alpha channels of the almond and the star, read once from the artwork
  // (both 2x: 2 image px per CSS px)
  function readAlpha(src) {
    const out = { data: null, w: 0, h: 0 };
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = out.w = img.naturalWidth;
      c.height = out.h = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      out.data = ctx.getImageData(0, 0, out.w, out.h).data;
    };
    img.src = src;
    return out;
  }
  const almondAlpha = readAlpha('/assets/eye/eye-body.png');
  const pupilAlpha = readAlpha('/assets/eye/eye-hole.png');
  const alphaAt = (a, x, y) => {
    if (!a.data) return 0;
    const px = Math.floor(x * 2);
    const py = Math.floor(y * 2);
    if (px < 0 || py < 0 || px >= a.w || py >= a.h) return 0;
    return a.data[(py * a.w + px) * 4 + 3];
  };

  // --- the pupil follows the pointer ----------------------------------

  const pupil = { x: 0, y: 0 }; // current offset from rest
  const target = { x: 0, y: 0 };
  let lookFrame = 0;

  function lookAt(clientX, clientY) {
    const r = eye.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, d / LOOK_REACH);
    target.x = (dx / d) * reach * PUPIL_TRAVEL.x;
    target.y = (dy / d) * reach * PUPIL_TRAVEL.y;
    if (!lookFrame) lookFrame = requestAnimationFrame(look);
  }

  function look() {
    pupil.x += (target.x - pupil.x) * LOOK_EASE;
    pupil.y += (target.y - pupil.y) * LOOK_EASE;
    body.style.setProperty('--pupil-x', `${(PUPIL_REST.x + pupil.x).toFixed(2)}px`);
    body.style.setProperty('--pupil-y', `${(PUPIL_REST.y + pupil.y).toFixed(2)}px`);
    const settled = Math.abs(target.x - pupil.x) < 0.05 && Math.abs(target.y - pupil.y) < 0.05;
    lookFrame = settled ? 0 : requestAnimationFrame(look);
  }

  document.addEventListener('pointermove', (e) => lookAt(e.clientX, e.clientY));
  document.addEventListener('pointerdown', (e) => lookAt(e.clientX, e.clientY));
  document.documentElement.addEventListener('mouseleave', () => {
    target.x = 0;
    target.y = 0;
    if (!lookFrame) lookFrame = requestAnimationFrame(look);
  });

  // --- blinking ---------------------------------------------------------

  let lastPoke = -Infinity;
  let blinkTimer = 0;

  function blink() {
    eye.classList.add('is-closed');
    setTimeout(() => eye.classList.remove('is-closed'), BLINK_MS);
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    const wait = BLINK_EVERY[0] + Math.random() * (BLINK_EVERY[1] - BLINK_EVERY[0]);
    blinkTimer = setTimeout(() => {
      if (!document.hidden && performance.now() - lastPoke > IDLE_AFTER_POKE) blink();
      scheduleBlink();
    }, wait);
  }
  scheduleBlink();

  // --- the message pill -------------------------------------------------

  let hideTimer = 0;

  function say(text) {
    const link = text.includes('GO TO ABOUT');
    pop.replaceChildren();
    if (link) {
      const a = document.createElement('a');
      a.href = 'about';
      a.textContent = text;
      pop.append(a);
    } else {
      pop.textContent = text;
    }
    // restart the pop-in even if a message is already showing
    pop.classList.remove('is-up');
    void pop.offsetWidth;
    pop.classList.add('is-up');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => pop.classList.remove('is-up'), link ? SHOW_LINK_MS : SHOW_MS);
  }

  // --- poking -----------------------------------------------------------

  let nextMessage = 0;
  let pokes = [];
  let lastSurprise = -Infinity;

  function flinch(scale) {
    eye.animate(
      [{ transform: 'scale(1)' }, { transform: scale }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
  }

  eye.addEventListener('click', (e) => {
    const r = eye.getBoundingClientRect();
    const keyboard = e.detail === 0; // Enter/Space: no pointer position, treat as a poke
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const inPupil = !keyboard && alphaAt(pupilAlpha, x - PUPIL_REST.x - pupil.x, y - PUPIL_REST.y - pupil.y) > 128;
    const onOrange = keyboard || alphaAt(almondAlpha, x, y) > 128;
    if (!inPupil && !onOrange) return; // a corner of the box, not the eye

    const now = performance.now();
    lastPoke = now;
    pokes = pokes.filter((t) => now - t < POKE_WINDOW).concat(now);

    if (inPupil && now - lastSurprise > SURPRISE_COOLDOWN && Math.random() < SURPRISE_CHANCE) {
      lastSurprise = now;
      flinch('scale(1.14)'); // eyes wide
      say(SURPRISE);
      launchStars(
        r.left + PUPIL_REST.x + pupil.x + PUPIL_SIZE.w / 2,
        r.top + PUPIL_REST.y + pupil.y + PUPIL_SIZE.h / 2,
      );
      return;
    }

    blink();
    flinch('scale(1.06, 0.86)'); // squints
    if (pokes.length >= POKE_LIMIT) {
      say(FED_UP);
    } else {
      say(MESSAGES[nextMessage]);
      nextMessage = (nextMessage + 1) % MESSAGES.length;
    }
  });
}
