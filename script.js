// --- Recreate the Figma "Warm" color filter + Bayer 16x16 dither effect ---
// applied to the collage image (Filter: Warm @ 100%; Dither: Bayer 16x16,
// size 2, levels 3, brightness 100%, contrast 1, mono off).

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

function applyWarmFilter(r, g, b) {
  return [
    Math.min(255, r * 1.15 + 8),
    Math.min(255, g * 1.05 + 3),
    Math.max(0, b * 0.85),
  ];
}

function ditherChannel(value, threshold, levels) {
  const normalized = value / 255;
  const scaled = normalized * (levels - 1);
  const base = Math.floor(scaled);
  const frac = scaled - base;
  const out = frac > threshold ? base + 1 : base;
  return Math.round((out / (levels - 1)) * 255);
}

const BAYER_SIZE = 16;
const BLOCK_SIZE = 2;
const LEVELS = 3;
const bayerMatrix = generateBayerMatrix(BAYER_SIZE);

const viewport = document.querySelector('.main-area');
const panLayer = document.querySelector('.collage-wrap');
const canvas = document.getElementById('collage-canvas');
const ctx = canvas.getContext('2d');
const sourceImage = new Image();
let sourceLoaded = false;

// How much further in than a plain edge-to-edge "cover" fit to zoom,
// so the whole image is reachable by panning but never appears cropped at rest.
const ZOOM_EXTRA = 1.6;

// Normalized position (0-1) of the fish / drummer figurine / EADEM tube
// cluster within the source photo — this is where the view opens on.
const FOCUS_X_FRAC = 0.55;
const FOCUS_Y_FRAC = 0.52;

const LERP_FACTOR = 0.16;
const DRAG_RESISTANCE = 0.4;
const MOMENTUM_FRICTION = 0.93;
const VELOCITY_EPSILON = 0.4;

let bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
let panX = 0, panY = 0;
let targetX = 0, targetY = 0;
let velX = 0, velY = 0;
let isDragging = false;
let hasMomentum = false;
let lastPointer = { x: 0, y: 0, t: 0 };
let wheelSettleTimer = null;

function clampWithResistance(value, min, max, resistance) {
  if (value > max) return max + (value - max) * resistance;
  if (value < min) return min + (value - min) * resistance;
  return value;
}

function renderCollage() {
  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  if (viewportWidth === 0 || viewportHeight === 0) return;

  const coverScale = Math.max(
    viewportWidth / sourceImage.naturalWidth,
    viewportHeight / sourceImage.naturalHeight
  );
  const scale = coverScale * ZOOM_EXTRA;

  const dispWidth = Math.round(sourceImage.naturalWidth * scale);
  const dispHeight = Math.round(sourceImage.naturalHeight * scale);

  canvas.width = dispWidth;
  canvas.height = dispHeight;
  canvas.style.width = dispWidth + 'px';
  canvas.style.height = dispHeight + 'px';
  panLayer.style.width = dispWidth + 'px';
  panLayer.style.height = dispHeight + 'px';

  ctx.drawImage(sourceImage, 0, 0, dispWidth, dispHeight);
  const imageData = ctx.getImageData(0, 0, dispWidth, dispHeight);
  const data = imageData.data;

  for (let y = 0; y < dispHeight; y++) {
    const by = Math.floor(y / BLOCK_SIZE) % BAYER_SIZE;
    for (let x = 0; x < dispWidth; x++) {
      const bx = Math.floor(x / BLOCK_SIZE) % BAYER_SIZE;
      const threshold = (bayerMatrix[by][bx] + 0.5) / (BAYER_SIZE * BAYER_SIZE);

      const i = (y * dispWidth + x) * 4;
      const [wr, wg, wb] = applyWarmFilter(data[i], data[i + 1], data[i + 2]);

      data[i] = ditherChannel(wr, threshold, LEVELS);
      data[i + 1] = ditherChannel(wg, threshold, LEVELS);
      data[i + 2] = ditherChannel(wb, threshold, LEVELS);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  bounds = {
    minX: Math.min(0, viewportWidth - dispWidth),
    maxX: 0,
    minY: Math.min(0, viewportHeight - dispHeight),
    maxY: 0,
  };

  const focusX = FOCUS_X_FRAC * dispWidth;
  const focusY = FOCUS_Y_FRAC * dispHeight;
  const centeredX = viewportWidth / 2 - focusX;
  const centeredY = viewportHeight / 2 - focusY;

  panX = targetX = Math.min(Math.max(centeredX, bounds.minX), bounds.maxX);
  panY = targetY = Math.min(Math.max(centeredY, bounds.minY), bounds.maxY);
  panLayer.style.transform = `translate3d(${panX}px, ${panY}px, 0)`;
}

function tick() {
  if (hasMomentum && !isDragging) {
    targetX += velX;
    targetY += velY;
    velX *= MOMENTUM_FRICTION;
    velY *= MOMENTUM_FRICTION;
    targetX = clampWithResistance(targetX, bounds.minX, bounds.maxX, DRAG_RESISTANCE);
    targetY = clampWithResistance(targetY, bounds.minY, bounds.maxY, DRAG_RESISTANCE);

    if (Math.abs(velX) < VELOCITY_EPSILON && Math.abs(velY) < VELOCITY_EPSILON) {
      velX = 0;
      velY = 0;
      hasMomentum = false;
      // hard-clamp back into bounds; the lerp below eases it back smoothly (the "resistance" spring-back)
      targetX = Math.min(Math.max(targetX, bounds.minX), bounds.maxX);
      targetY = Math.min(Math.max(targetY, bounds.minY), bounds.maxY);
    }
  }

  panX += (targetX - panX) * LERP_FACTOR;
  panY += (targetY - panY) * LERP_FACTOR;
  panLayer.style.transform = `translate3d(${panX}px, ${panY}px, 0)`;

  requestAnimationFrame(tick);
}

viewport.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.tag, .info-card, .info-button, .info-popup')) return;
  isDragging = true;
  hasMomentum = false;
  velX = 0;
  velY = 0;
  viewport.classList.add('is-dragging');
  viewport.setPointerCapture(e.pointerId);
  lastPointer = { x: e.clientX, y: e.clientY, t: performance.now() };
});

viewport.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const now = performance.now();
  const dt = Math.max(now - lastPointer.t, 1);
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;

  targetX = clampWithResistance(targetX + dx, bounds.minX, bounds.maxX, DRAG_RESISTANCE);
  targetY = clampWithResistance(targetY + dy, bounds.minY, bounds.maxY, DRAG_RESISTANCE);

  velX = (dx / dt) * 16;
  velY = (dy / dt) * 16;

  lastPointer = { x: e.clientX, y: e.clientY, t: now };
});

function endDrag(e) {
  if (!isDragging) return;
  isDragging = false;
  viewport.classList.remove('is-dragging');
  try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
  hasMomentum = true;
}

viewport.addEventListener('pointerup', endDrag);
viewport.addEventListener('pointercancel', endDrag);

viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  isDragging = false;
  hasMomentum = false;
  velX = 0;
  velY = 0;

  targetX = clampWithResistance(targetX - e.deltaX, bounds.minX, bounds.maxX, DRAG_RESISTANCE);
  targetY = clampWithResistance(targetY - e.deltaY, bounds.minY, bounds.maxY, DRAG_RESISTANCE);

  clearTimeout(wheelSettleTimer);
  wheelSettleTimer = setTimeout(() => {
    targetX = Math.min(Math.max(targetX, bounds.minX), bounds.maxX);
    targetY = Math.min(Math.max(targetY, bounds.minY), bounds.maxY);
  }, 150);
}, { passive: false });

sourceImage.onload = () => {
  sourceLoaded = true;
  renderCollage();
  requestAnimationFrame(tick);
};
sourceImage.src = 'assets/collage.jpg';

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (sourceLoaded) renderCollage();
  }, 150);
});

// --- Custom cursor: orange dot everywhere on the site. ---

const customCursor = document.getElementById('custom-cursor');

document.addEventListener('mousemove', (e) => {
  customCursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
});

document.addEventListener('mouseleave', () => {
  customCursor.style.opacity = '0';
});

document.addEventListener('mouseenter', () => {
  customCursor.style.opacity = '1';
});

// --- I-Spy: click an item (seamlessly overlaid on the real photo) to pop
// its matching star burst out from behind it as a found-it notification. ---

// Normalized bounding boxes (0-1) of each item within the source photo,
// taken directly from each Figma item frame's position on the collage.
const SPY_ITEMS = [
  { id: 'lipbalm', bounds: { xMin: 0.40932, xMax: 0.61792, yMin: 0.27247, yMax: 0.51243 } },
  { id: 'tube',    bounds: { xMin: 0.45161, xMax: 0.60072, yMin: 0.71319, yMax: 0.94359 } },
  { id: 'puzzle',  bounds: { xMin: 0.81004, xMax: 0.95269, yMin: 0.67973, yMax: 0.81931 } },
  { id: 'smiski',  bounds: { xMin: 0.64516, xMax: 0.72043, yMin: 0.16826, yMax: 0.33939 } },
  { id: 'photo',   bounds: { xMin: 0.31756, xMax: 0.63369, yMin: 0.06788, yMax: 0.31836 } },
  { id: 'lego',    bounds: { xMin: 0.16989, xMax: 0.37778, yMin: 0.21224, yMax: 0.41205 } },
  { id: 'perfume', bounds: { xMin: 0.16989, xMax: 0.25735, yMin: 0.00000, yMax: 0.27247 } },
  { id: 'joycon',  bounds: { xMin: 0.88602, xMax: 1.00000, yMin: 0.79446, yMax: 0.96558 } },
  { id: 'dice',    bounds: { xMin: 0.78710, xMax: 0.87746, yMin: 0.04589, yMax: 0.16855 } },
];

// Sparkles pop in one at a time around an item when it's found, instead of
// one big star cycling behind it.
const SPARKLE_STAGGER_MS = 130;
const SPARKLE_JITTER_MS = 60;
const SPARKLE_VISIBLE_MS = 650;
const SPARKLE_FADE_MS = 350;

SPY_ITEMS.forEach((item) => {
  item.tagEl = document.querySelector(`.tag[data-item="${item.id}"]`);
  item.sparkleEls = document.querySelectorAll(`#item-${item.id}-sparkles .spy-sparkle`);
  item.found = false;
});

function burstSparkles(item) {
  // shuffle which sparkle lands on which stagger step, so the pop order isn't
  // always the same left-to-right/DOM order every time an item is found.
  const order = [...item.sparkleEls.keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  order.forEach((elIndex, step) => {
    const el = item.sparkleEls[elIndex];
    const delay = step * SPARKLE_STAGGER_MS + Math.random() * SPARKLE_JITTER_MS;
    setTimeout(() => {
      el.classList.add('pop');
      setTimeout(() => {
        el.classList.remove('pop');
        el.classList.add('fade');
        setTimeout(() => el.classList.remove('fade'), SPARKLE_FADE_MS);
      }, SPARKLE_VISIBLE_MS);
    }, delay);
  });
}

viewport.addEventListener('click', (e) => {
  if (isDragging || !sourceLoaded || canvas.width === 0) return;

  const rect = viewport.getBoundingClientRect();
  const canvasX = (e.clientX - rect.left) - panX;
  const canvasY = (e.clientY - rect.top) - panY;
  const fx = canvasX / canvas.width;
  const fy = canvasY / canvas.height;

  const hit = SPY_ITEMS.find((item) => {
    if (item.found) return false;
    const { xMin, xMax, yMin, yMax } = item.bounds;
    return fx >= xMin && fx <= xMax && fy >= yMin && fy <= yMax;
  });

  if (hit) {
    hit.found = true;
    if (hit.tagEl) hit.tagEl.classList.add('found');
    burstSparkles(hit);
  }
});

// --- Info cards: once an item's tag has turned orange (found), clicking it
// slides its card up over the collage with the story behind that item.
// Clicking the tag again, or the open card itself, slides it back down. ---

const ITEM_INFO = {
  smiski: {
    title: 'Smiski',
    text: "I currently have over 30 of these little guys, and I don’t plan on collecting anytime soon. The moment something cute comes in a blind box, my self-control disappears. My college roommates and I hid them all around our house to add a little whimsy to our home. I definitely lost a few when we moved out, but I hope the next tenants are giving them the unconditional love and care they deserve.",
    media: {
      type: 'row',
      images: [
        { src: 'assets/smiski-info.jpg', width: 151, height: 100 },
        { src: 'assets/smiski-info-2.jpg', width: 75, height: 100 },
      ],
    },
  },
  tube: {
    title: 'Paint Tube',
    text: 'I have been painting for as long as I can remember. As a kid, I would spend the whole week looking forward to my silly little Saturday morning art classes just so I could play, create, and make a mess. Nowadays, my favorite way to paint is for the people I love. Gift giving is one of my love languages, so most of my paintings end up as little cards, keepsakes, tiny surprises for my friends and family.',
    media: {
      type: 'fan',
      // Each frame's outer box (width/height/left/top) is the rotated
      // bounding box Figma lays the card out at; innerWidth/innerHeight is
      // the card's true (pre-rotation) size, centered inside that outer box
      // then rotated — matching Figma's own wrapper structure exactly.
      // `crop` reproduces Figma's manual pan/zoom on the photo (percentages
      // of the inner box); frames without it just use a plain cover fit.
      frames: [
        {
          src: 'assets/tube-info-43.jpg',
          width: 77.549, height: 107.734, left: 0, top: 0, rotate: -5.14,
          innerWidth: 68.687, innerHeight: 101.99,
          crop: { width: 113.64, height: 109.46, left: -7.58, top: -5.24 },
        },
        {
          src: 'assets/tube-info-40.jpg',
          width: 82.839, height: 105.775, left: 58.7, top: 0.34, rotate: -176.13,
          innerWidth: 75.477, innerHeight: 100.959,
          objectPosition: 'bottom',
        },
        {
          src: 'assets/tube-info-41.jpg',
          width: 81.978, height: 103.555, left: 122, top: 2.23, rotate: -4.16,
          innerWidth: 74.282, innerHeight: 98.484,
          crop: { width: 111.76, height: 108.4, left: -6.67, top: -4.16 },
        },
        {
          src: 'assets/tube-info-39.jpg',
          width: 86.637, height: 108.674, left: 185.08, top: 1.29, rotate: 6.12,
          innerWidth: 75.141, innerHeight: 101.373,
        },
        {
          src: 'assets/tube-info-44.jpg',
          width: 67.41, height: 105.202, left: 253, top: 1.14, rotate: -4.67,
          innerWidth: 59.414, innerHeight: 100.701,
          crop: { width: 111.86, height: 107.17, left: -5.08, top: -3.09 },
        },
      ],
      width: 320,
      height: 110,
    },
  },
  photo: {
    title: 'Photobooth Strip',
    text: "What started as a tradition while traveling quickly became one of my favorite little rituals. There’s something so special about squeezing into a photo booth with the people you love and walking away with a tiny strip of memories. Whether it was a spontaneous Beach Boardwalk day with my roommates, celebrating a birthday, or taking graduation photos before leaving our college town, each strip captures a moment I never want to forget. I’ve collected more than I can count, and if you ask any of my friends, a long line or an overpriced photo booth has never stopped me. Some things are just worth the $8 and a lifetime of memories.",
  },
  lego: {
    title: 'Lego',
    text: "I genuinely enjoy activities that reward patience, and LEGO is at the top of that list. There’s something calming about following hundreds of tiny steps and slowly watching a model come to life. My latest builds were Van Gogh’s Starry Night and the Porsche 911, and I’m currently eyeing Toothless from How to Train Your Dragon or the Nintendo Entertainment System next.",
  },
  puzzle: {
    title: 'Puzzle Piece',
    text: "During COVID, puzzles and board games became my favorite form of therapy. There was something so satisfying about trading endless Zoom calls for a table covered in oddly shaped cardboard pieces. Safe to say... the obsession stuck. Magic Puzzle Company has my whole heart. Their puzzles feature amazing artists, the pieces are delightfully funky, and every puzzle has a clever little twist that makes you smile. I won’t ruin the surprise, but I hope this will convince you to build one of your own.",
    media: {
      type: 'row',
      images: [
        {
          src: 'assets/puzzle-info.jpg', width: 149, height: 100,
          crop: { width: 119.36, height: 150, left: -19.09, top: -41.35 },
        },
        { src: 'assets/puzzle-info-2.jpg', width: 75, height: 100 },
      ],
    },
  },
  perfume: {
    title: 'Perfume',
    text: "I’ve been unintentionally growing my perfume collection thanks to my parents’ travels, they always surprise us with the best goodies. A spritz of perfume is the finishing touch to my “look good, feel good” routine. I can never commit to a full-size bottle, so I’ve become a proud collector of travel-size perfumes instead. Having a little lineup of scents to match my mood is such a fun way to add a little extra joy to an ordinary day.",
  },
  joycon: {
    title: 'Joycon',
    text: "Some of my favorite memories from college were coming home to the sound of my roommates laughing over a game of Mario Kart or Super Smash Bros. Inevitably, one game would turn into hours of friendly competition, and before we knew it, we were still playing into the late hours of the night, knowing we all have to be up early for class. Beyond those two classics, you’ll usually find Super Mario Party, Another Crab’s Treasure, or The Legend of Zelda somewhere in my regular rotation.",
  },
  lipbalm: {
    title: 'Lippies',
    text: "Somehow my lip products have a habit of disappearing into every bag, jacket pocket, and random corner of my room, which is a pretty convenient excuse to pick up another one. If it’s a berry, deep red, or rich brown shade, chances are it’s already in my collection, or about to be. I have been really loving EADEM in the shade Boba Bounce, Merit in Sangria, and my trusty dusty Aquaphor.",
  },
  dice: {
    title: 'Board Games',
    text: "Whenever our family friends came over, we’d inevitably end up gathered around the table for a board game. There was a solid stretch where we were completely obsessed with Catan, and while everyone else has since moved on to new favorites, my Catan obsession never really left. I am very blessed to have friends and family who are willing to play this game again and again with me <33",
    media: {
      type: 'carousel',
      srcs: [
        'assets/dice-carousel-01.jpg',
        'assets/dice-carousel-02.jpg',
        'assets/dice-carousel-03.jpg',
        'assets/dice-carousel-04.jpg',
        'assets/dice-carousel-05.jpg',
        'assets/dice-carousel-06.jpg',
        'assets/dice-carousel-07.jpg',
        'assets/dice-carousel-08.jpg',
        'assets/dice-carousel-09.jpg',
        'assets/dice-carousel-10.jpg',
        'assets/dice-carousel-11.jpg',
        'assets/dice-carousel-12.jpg',
        'assets/dice-carousel-13.jpg',
      ],
    },
  },
};

const infoCard = document.getElementById('info-card');
const infoCardTitle = document.getElementById('info-card-title');
const infoCardText = document.getElementById('info-card-text');
const infoCardMedia = document.getElementById('info-card-media');
const tagRow = document.querySelector('.tag-row');
const TAG_ROW_REST_BOTTOM = 31;
let openItemId = null;

function renderMedia(media) {
  infoCardMedia.innerHTML = '';
  infoCardMedia.className = 'info-card-media';
  if (!media) return;

  infoCardMedia.classList.add('has-media');

  if (media.type === 'single') {
    const img = document.createElement('img');
    img.src = media.src;
    img.alt = '';
    img.className = 'info-card-image';
    img.style.width = `${media.width}px`;
    img.style.height = `${media.height}px`;
    infoCardMedia.appendChild(img);
  } else if (media.type === 'row') {
    infoCardMedia.classList.add('row');
    media.images.forEach((image) => {
      if (image.crop) {
        // manual pan/zoom crop (from Figma), same technique as the fan photos
        const box = document.createElement('div');
        box.className = 'info-card-row-crop';
        box.style.width = `${image.width}px`;
        box.style.height = `${image.height}px`;

        const img = document.createElement('img');
        img.src = image.src;
        img.alt = '';
        img.style.width = `${image.crop.width}%`;
        img.style.height = `${image.crop.height}%`;
        img.style.left = `${image.crop.left}%`;
        img.style.top = `${image.crop.top}%`;

        box.appendChild(img);
        infoCardMedia.appendChild(box);
      } else {
        const img = document.createElement('img');
        img.src = image.src;
        img.alt = '';
        img.className = 'info-card-image';
        img.style.width = `${image.width}px`;
        img.style.height = `${image.height}px`;
        infoCardMedia.appendChild(img);
      }
    });
  } else if (media.type === 'fan') {
    infoCardMedia.classList.add('fan');
    infoCardMedia.style.width = `${media.width}px`;
    infoCardMedia.style.height = `${media.height}px`;
    media.frames.forEach((frame) => {
      // outer box: where the rotated card sits in the fan, unrotated itself
      const outer = document.createElement('div');
      outer.className = 'info-card-fan-img';
      outer.style.width = `${frame.width}px`;
      outer.style.height = `${frame.height}px`;
      outer.style.left = `${frame.left}px`;
      outer.style.top = `${frame.top}px`;

      // inner box: the card's true size, centered in the outer box, rotated
      const inner = document.createElement('div');
      inner.className = 'info-card-fan-inner';
      inner.style.width = `${frame.innerWidth}px`;
      inner.style.height = `${frame.innerHeight}px`;
      inner.style.transform = `rotate(${frame.rotate}deg)`;

      const img = document.createElement('img');
      img.src = frame.src;
      img.alt = '';
      if (frame.crop) {
        // reproduce Figma's manual pan/zoom crop exactly
        img.style.width = `${frame.crop.width}%`;
        img.style.height = `${frame.crop.height}%`;
        img.style.left = `${frame.crop.left}%`;
        img.style.top = `${frame.crop.top}%`;
      } else {
        img.className = 'info-card-fan-img-cover';
        if (frame.objectPosition) img.style.objectPosition = frame.objectPosition;
      }

      inner.appendChild(img);
      outer.appendChild(inner);
      infoCardMedia.appendChild(outer);
    });
  } else if (media.type === 'carousel') {
    infoCardMedia.classList.add('carousel');
    const track = document.createElement('div');
    track.className = 'info-card-carousel-track';
    // the source list is duplicated so translateX(-50%) lands exactly on an
    // identical frame, looping the scroll seamlessly instead of jumping.
    [...media.srcs, ...media.srcs].forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.className = 'info-card-carousel-img';
      track.appendChild(img);
    });
    infoCardMedia.appendChild(track);
  }
}

function closeInfoCard() {
  openItemId = null;
  infoCard.classList.remove('open');
  tagRow.style.bottom = `${TAG_ROW_REST_BOTTOM}px`;
}

function openInfoCard(id) {
  const info = ITEM_INFO[id];
  if (!info) return;
  openItemId = id;
  infoCardTitle.textContent = info.title;
  infoCardText.textContent = info.text;
  renderMedia(info.media);
  infoCard.classList.add('open');
  // lift the tag row to sit flush above the card instead of overlapping its
  // text — measured fresh each time since card height varies with the text.
  tagRow.style.bottom = `${TAG_ROW_REST_BOTTOM + infoCard.getBoundingClientRect().height}px`;
}

SPY_ITEMS.forEach((item) => {
  if (!item.tagEl) return;
  item.tagEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!item.found) return;
    if (openItemId === item.id) {
      closeInfoCard();
    } else {
      openInfoCard(item.id);
    }
  });
});

infoCard.addEventListener('click', (e) => {
  e.stopPropagation();
  closeInfoCard();
});

// --- Info button: click the "i" to toggle the how-to-play popup. ---

const infoButton = document.getElementById('info-button');
const infoPopup = document.getElementById('info-popup');

infoButton.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = infoPopup.classList.toggle('open');
  infoButton.setAttribute('aria-expanded', String(isOpen));
});

// Auto-show the popup for a few seconds on page load, then tuck it away
// behind the "i" so first-time visitors get the hint without it lingering.
const INFO_POPUP_AUTO_SHOW_MS = 3000;
infoPopup.classList.add('open');
infoButton.setAttribute('aria-expanded', 'true');
setTimeout(() => {
  infoPopup.classList.remove('open');
  infoButton.setAttribute('aria-expanded', 'false');
}, INFO_POPUP_AUTO_SHOW_MS);
