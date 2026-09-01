// Clicking an outline item smooth-scrolls so the section it links to lands
// near the top of the viewport, just clear of the fixed nav.

const SCROLL_OFFSET = 80;

document.querySelectorAll('.outline-item').forEach((item) => {
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
