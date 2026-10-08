import { inject } from '@vercel/analytics';

// Vercel Web Analytics: every page loads shared.js, so this covers the site.
inject();

// --- Custom cursor: orange dot everywhere on the site. ---
// .cursor-dot defaults to opacity:0 in CSS — it only knows the real
// cursor position once a mousemove/mouseenter fires, so revealing it
// there (rather than being visible by default) avoids a stray dot
// flashing at its unpositioned 0,0 corner on every page load.

export const customCursor = document.getElementById('custom-cursor');
const cursorDot = document.querySelector('.cursor-dot');
export let lastMouseClientX = 0;
export let lastMouseClientY = 0;

function positionCursor(e) {
  customCursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  cursorDot.style.opacity = '1';
  lastMouseClientX = e.clientX;
  lastMouseClientY = e.clientY;
}

document.addEventListener('mousemove', positionCursor);
document.addEventListener('mouseenter', positionCursor);

document.addEventListener('mouseleave', () => {
  cursorDot.style.opacity = '0';
});

// --- No orphaned words -------------------------------------------------
// Joins each paragraph's last two words with a non-breaking space (three if
// the very last word is short), so a line can never end up holding one
// lonely word, at any width. shared.css's text-wrap: pretty still evens the
// lines out on top of this where the browser supports it.

const SHORT_WORD = 4; // a last word this short brings two companions, not one

function joinLastWords(el) {
  // the element's text, as runs in reading order, so a word split across an
  // inline tag (an accent <span>) is still found
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  const text = nodes.map((n) => n.data).join('');
  if ((text.trim().match(/\s+/g) || []).length < 2) return; // one or two words: nothing to orphan

  const trimmed = text.replace(/\s+$/, '');
  const lastWord = trimmed.slice(trimmed.lastIndexOf(' ') + 1);
  let joins = lastWord.length <= SHORT_WORD ? 2 : 1;

  // walk back from the end, turning the last `joins` spaces into no-break ones
  for (let i = nodes.length - 1; i >= 0 && joins > 0; i--) {
    const data = nodes[i].data;
    let out = data;
    let end = i === nodes.length - 1 ? data.replace(/\s+$/, '').length : data.length;
    for (let j = end - 1; j >= 0 && joins > 0; j--) {
      if (out[j] === ' ') {
        out = out.slice(0, j) + ' ' + out.slice(j + 1);
        joins--;
      }
    }
    nodes[i].data = out;
  }
}

document.querySelectorAll('main p, main li, .page p, .page li, .page h1').forEach(joinLastWords);

// --- Tab title while you're away ----------------------------------------
// Switch to another tab and this one's title changes to AWAY_TITLE; come
// back and the page's own title returns.

const AWAY_TITLE = 'i spy... you left :(';
const pageTitle = document.title;

document.addEventListener('visibilitychange', () => {
  document.title = document.hidden ? AWAY_TITLE : pageTitle;
});

// --- Magnifying glass over ABOUT ---------------------------------------
// Hovering ABOUT flips it to an orange I SPY (shared.css) and swaps the dot
// for a magnifying glass. The lens holds a live copy of the nav bar blown
// up LENS_ZOOM times and slid so the spot under the pointer sits in the
// middle of the glass — so whatever the lens is over really is magnified
// underneath it. The copy is made fresh on each hover so it always matches
// the real nav, and its ABOUT flips in step with the real one.

const LENS_ZOOM = 1.6; // a lens this small shows only a letter or two at 2x
const LENS_VIEW = 22; // glass diameter inside the rim — keep in sync with .cursor-lens in shared.css

const navBar = document.querySelector('.nav-bar');
const lens = document.createElement('div');
lens.className = 'cursor-lens';
lens.innerHTML = '<div class="cursor-lens-view"></div>';
const lensView = lens.firstElementChild;
customCursor.append(lens);
let lensCopy = null;

function updateLens(x, y) {
  if (!lensCopy) return;
  const r = LENS_VIEW / 2;
  lensCopy.style.transform = `translate(${r - x * LENS_ZOOM}px, ${r - y * LENS_ZOOM}px) scale(${LENS_ZOOM})`;
  // the light catches the rim differently as the glass moves
  lens.style.setProperty('--sheen', `${(x * 0.35) % 360}deg`);
}

document.querySelectorAll('.nav-link').forEach((link) => {
  if (!link.querySelector('.nav-flip') || !navBar) return;

  link.addEventListener('mouseenter', (e) => {
    lensCopy = navBar.cloneNode(true);
    lensCopy.setAttribute('aria-hidden', 'true');
    const copyLink = [...lensCopy.querySelectorAll('.nav-link')].find((l) => l.querySelector('.nav-flip'));
    lensCopy.style.width = `${navBar.offsetWidth}px`;
    lensView.replaceChildren(lensCopy);
    updateLens(e.clientX, e.clientY);
    customCursor.classList.add('is-lens');
    // flip the copy's ABOUT on the next frame, so it animates alongside the real one
    requestAnimationFrame(() => copyLink?.classList.add('is-ispy'));
  });

  link.addEventListener('mouseleave', () => {
    customCursor.classList.remove('is-lens');
    const copy = lensCopy;
    copy?.querySelector('.is-ispy')?.classList.remove('is-ispy');
    setTimeout(() => { if (lensCopy === copy) { lensView.replaceChildren(); lensCopy = null; } }, 250);
  });
});

document.addEventListener('mousemove', (e) => updateLens(e.clientX, e.clientY));

// --- WORK nav link: always scroll to the work section on click, even if
// the URL already has #work — a plain hash link no-ops on a repeat click
// since the hash doesn't change, which made the button feel dead.
//
// The scroll itself is hand-animated with requestAnimationFrame rather
// than scrollIntoView({behavior:'smooth'}) — the native smooth scroll can
// silently stall partway and never reach its target in some browser
// states. Driving it ourselves guarantees it always finishes, and lets us
// match the quick ease-in-out feel of a manual scroll instead of an
// abrupt cut.
//
// From a page other than home (about, the case studies) WORK is a real
// cross-page navigation, so there's no scroll to animate on this page —
// but a hash in the URL at load time makes the browser jump there
// natively and instantly before any JS runs. To animate that jump too,
// we navigate WITHOUT the hash and stash a flag in sessionStorage; the
// home page picks it up on load and runs the same eased scroll.

// sine easing has the roundest, gentlest velocity curve of the common
// eases — no sharp acceleration spike through the middle like cubic has —
// which reads as a softer, more cushioned motion.
function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function animateScrollTo(targetY, duration) {
  const startY = window.scrollY;
  const distance = targetY - startY;
  const startTime = performance.now();

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutSine(t));
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// `startFraction` lets a fresh page load skip most of the trip instantly
// (see the on-load handler below) instead of animating the full distance
// from the very top — only the last stretch eases in, which gets the
// user there faster while keeping the same settled-into-place feel.
function scrollToWorkSection(startFraction, duration) {
  const work = document.getElementById('work');
  if (!work) return false;
  const navHeight = 45;
  const targetY = work.getBoundingClientRect().top + window.scrollY - navHeight;
  if (startFraction) {
    window.scrollTo(0, targetY * startFraction);
  }
  animateScrollTo(targetY, duration || 650);
  if (location.hash !== '#work') history.replaceState(null, '', '#work');
  return true;
}

document.querySelectorAll('a.nav-link[href$="#work"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    if (scrollToWorkSection()) {
      e.preventDefault();
    } else {
      e.preventDefault();
      sessionStorage.setItem('scrollToWork', '1');
      // strip the "#work" suffix from the link's own href rather than
      // hardcoding the home page's filename here too — this is exactly
      // the line that went stale (still pointing at the old "home
      // page.html") when that file was renamed to index.html elsewhere.
      location.href = link.getAttribute('href').replace(/#work$/, '');
    }
  });
});

if (sessionStorage.getItem('scrollToWork')) {
  sessionStorage.removeItem('scrollToWork');
  scrollToWorkSection(0.75, 350);
}
