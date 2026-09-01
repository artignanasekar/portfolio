// --- Memory match game: 8 photo pairs shuffled across a 4x4 grid.
// Click a face-down card to flip it; click a second one and if they
// match, both stay face-up; if not, both flip back down after a beat. ---

const PAIR_IMAGES = [
  'assets/memory-photo-1.jpg',
  'assets/memory-photo-2.jpg',
  'assets/memory-photo-3.jpg',
  'assets/memory-photo-4.jpg',
  'assets/memory-photo-5.jpg',
  'assets/memory-photo-6.jpg',
  'assets/memory-photo-7.jpg',
  'assets/memory-photo-8.jpg',
];

const MISMATCH_FLIP_BACK_MS = 800;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildDeck() {
  const deck = PAIR_IMAGES.flatMap((src, pairIndex) => [
    { pairIndex, src },
    { pairIndex, src },
  ]);
  return shuffle(deck);
}

const grid = document.getElementById('match-grid');
const deck = buildDeck();

let firstPick = null;
let secondPick = null;
let inputLocked = false;

deck.forEach((cardData, index) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.pairIndex = String(cardData.pairIndex);
  card.dataset.index = String(index);

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const front = document.createElement('div');
  front.className = 'card-face card-face-front';

  const back = document.createElement('div');
  back.className = 'card-face card-face-back';
  const img = document.createElement('img');
  img.src = cardData.src;
  img.alt = '';
  back.appendChild(img);

  inner.appendChild(front);
  inner.appendChild(back);
  card.appendChild(inner);
  grid.appendChild(card);

  // Places this card's dot-mask sampling window within the shared "world
  // space" canvas that playLoadSheen() sweeps below — see the comment on
  // .card-face-front::after in home.css for how these are used.
  const GRID_STEP = 143; // 128px card + 15px gap
  const row = Math.floor(index / 4);
  const col = index % 4;
  front.style.setProperty('--card-x', `${col * GRID_STEP}px`);
  front.style.setProperty('--card-y', `${row * GRID_STEP}px`);

  inner.addEventListener('click', () => handleCardClick(card));
});

// --- On-load sheen: a single dot band sweeps diagonally across the whole
// grid (top-left corner to bottom-right corner) so visitors register the
// cards are there, even though they're otherwise camouflaged into the
// background at rest. Rather than 16 cards each replaying their own local
// animation, every card's mask reads from one shared world-space gradient
// (see --card-x/--card-y above and .card-face-front::after in home.css);
// this loop just drives that one shared clock, --sweep-t, on :root, so all
// 16 update in lockstep and the grid still reads as distinct cards. ---

const SHEEN_START_DELAY_MS = 300;
const SHEEN_DURATION_MS = 2400;
const SHEEN_START_PX = -900; // fully before the grid
const SHEEN_END_PX = 1400; // fully past the grid

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function playLoadSheen() {
  const root = document.documentElement;
  const startTime = performance.now() + SHEEN_START_DELAY_MS;

  function frame(now) {
    const elapsed = now - startTime;
    if (elapsed < 0) {
      requestAnimationFrame(frame);
      return;
    }
    const t = Math.min(elapsed / SHEEN_DURATION_MS, 1);
    const value = SHEEN_START_PX + (SHEEN_END_PX - SHEEN_START_PX) * easeInOutQuad(t);
    root.style.setProperty('--sweep-t', `${value}px`);
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      root.style.removeProperty('--sweep-t');
    }
  }

  requestAnimationFrame(frame);
}

playLoadSheen();

function handleCardClick(card) {
  if (inputLocked) return;
  if (card.classList.contains('flipped') || card.classList.contains('matched')) return;

  card.classList.add('flipped');

  if (!firstPick) {
    firstPick = card;
    return;
  }

  secondPick = card;
  inputLocked = true;

  const isMatch = firstPick.dataset.pairIndex === secondPick.dataset.pairIndex;

  if (isMatch) {
    firstPick.classList.add('matched');
    secondPick.classList.add('matched');
    resetPicks();
  } else {
    setTimeout(() => {
      firstPick.classList.remove('flipped');
      secondPick.classList.remove('flipped');
      resetPicks();
    }, MISMATCH_FLIP_BACK_MS);
  }
}

function resetPicks() {
  firstPick = null;
  secondPick = null;
  inputLocked = false;
}
