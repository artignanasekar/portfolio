/* Home page loading screen — UNHOOKED for now (see the loading screen
   note in hero.css for how to turn it back on).

   "I SPY WITH MY LITTLE EYE" shows in the
   tagline's exact spot and style while the page loads, then fades away to
   leave "... ARTI, A DESIGNER WHO FINDS WHAT'S HIDDEN IN PLAIN SIGHT" in
   the same place, so the sentence carries straight on.

   It waits for everything (images, fonts, the thumbnails' assets) AND a
   minimum time, so it never just flickers past — but gives up waiting
   after MAX_MS. hero.css has a CSS-only failsafe too, in case this script
   never runs. */

const MIN_MS = 1800; // shortest time the loading screen stays up
const MAX_MS = 6000; // stop waiting on a slow asset after this long
const TEXT_FADE_MS = 300; // keep in sync with .home-loader-text in hero.css
const SCREEN_FADE_MS = 500; // keep in sync with .home-loader in hero.css

const loader = document.getElementById('home-loader');
const text = loader?.querySelector('.home-loader-text');
const tagline = document.querySelector('.page .home-hero-tagline');

if (loader && text && tagline) {
  // land on the hero, not wherever a reload left the page, so the tagline
  // really is under the loading text (unless a link asked for a section)
  if (!location.hash) {
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }

  // sit the loading line exactly on top of the real tagline
  const place = () => {
    const r = tagline.getBoundingClientRect();
    text.style.left = `${r.left}px`;
    text.style.top = `${r.top}px`;
  };
  place();
  window.addEventListener('resize', place);

  // fade the line in once its font is ready, so it never flashes a fallback
  document.fonts.load("400 15px 'IBM Plex Mono'").finally(() => {
    place();
    loader.classList.add('is-ready');
  });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const loaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  const ready = Promise.all([loaded, document.fonts.ready]);
  const minimum = wait(Math.max(0, MIN_MS - performance.now()));

  Promise.all([Promise.race([ready, wait(MAX_MS)]), minimum])
    .then(async () => {
      place();
      loader.classList.add('is-leaving'); // the line fades first...
      await wait(TEXT_FADE_MS);
      loader.classList.add('is-gone'); // ...then the screen lifts
      document.documentElement.classList.remove('is-loading');
      await wait(SCREEN_FADE_MS);
      loader.remove();
      window.removeEventListener('resize', place);
    });
}
