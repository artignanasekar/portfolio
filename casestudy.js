// Clicking an outline item smooth-scrolls so the section it links to lands
// near the top of the viewport, just clear of the fixed nav.

const SCROLL_OFFSET = 80;

const items = [...document.querySelectorAll('.outline-item')];

items.forEach((item) => {
  item.addEventListener('click', (e) => {
    const targetId = item.getAttribute('href').slice(1);
    const target = document.getElementById(targetId);
    if (!target) return;
    e.preventDefault();

    const rect = target.getBoundingClientRect();
    const scrollTo = rect.top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top: Math.max(0, scrollTo), behavior: 'smooth' });
  });
});

// Scroll-spy: the outline item for the section you're reading gets
// .is-active (orange, dash, indent — see casestudy.css). A section becomes
// current once its top passes READ_LINE of the way down the window. Above
// the first section the first item stays lit; at the very bottom of the
// page the last one does, since a short final section may never reach the
// line.

const READ_LINE = 0.35;

const sections = items
  .map((item) => ({ item, section: document.getElementById(item.getAttribute('href').slice(1)) }))
  .filter(({ section }) => section);

let current = null;

function updateActive() {
  if (!sections.length) return;
  const line = window.innerHeight * READ_LINE;
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

  let active = sections[0];
  if (atBottom) {
    active = sections[sections.length - 1];
  } else {
    for (const entry of sections) {
      if (entry.section.getBoundingClientRect().top <= line) active = entry;
    }
  }

  if (active.item === current) return;
  current?.classList.remove('is-active');
  active.item.classList.add('is-active');
  current = active.item;
}

let frame = 0;
const requestUpdate = () => {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; updateActive(); });
};

window.addEventListener('scroll', requestUpdate, { passive: true });
window.addEventListener('resize', requestUpdate);
document.fonts?.ready.then(requestUpdate); // layout shifts once fonts land
updateActive();
