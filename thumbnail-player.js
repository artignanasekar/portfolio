/* Shared run/pause switch for the animated work-card thumbnails. Calls
   play() while the thumbnail is on screen and the tab is visible, pause()
   otherwise, so offscreen loops cost nothing. Each thumbnail owns its own
   loop; this only decides when it should be running. */
export function watchThumb(root, { play, pause }) {
  let onScreen = false;
  let running = false;

  function sync() {
    const run = onScreen && !document.hidden;
    if (run === running) return;
    running = run;
    if (run) play();
    else pause();
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      sync();
    }).observe(root);
  } else {
    onScreen = true;
  }
  document.addEventListener('visibilitychange', sync);
  sync();
}

export const prefersReducedMotion = () =>
  !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
