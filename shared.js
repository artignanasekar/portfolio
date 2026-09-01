// --- Custom cursor: orange dot everywhere on the site. ---
// .cursor-dot defaults to opacity:0 in CSS — it only knows the real
// cursor position once a mousemove/mouseenter fires, so revealing it
// there (rather than being visible by default) avoids a stray dot
// flashing at its unpositioned 0,0 corner on every page load.

const customCursor = document.getElementById('custom-cursor');
const cursorDot = document.querySelector('.cursor-dot');
let lastMouseClientX = 0;
let lastMouseClientY = 0;

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
      location.href = 'home page.html';
    }
  });
});

if (sessionStorage.getItem('scrollToWork')) {
  sessionStorage.removeItem('scrollToWork');
  scrollToWorkSection(0.75, 350);
}
