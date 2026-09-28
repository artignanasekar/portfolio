/* Pearl animated thumbnail: two glassy waves wash up a shore, recede to reveal
   three app screens, then a second, choppier swell floods the card in Pearl
   blue for the fish logo before draining and looping. One 7s timeline
   drives everything so the beats stay in sync; tweak the keyframes below. */
(function () {
  var root = document.querySelector('.pearl-thumb');
  if (!root) return;

  var LOOP = 7; // seconds

  // first swell peaks with its highest crest ~30px (8.3%) below the top of a
  // ~361px-tall card, just above the phones (which sit 40px / 11% down).
  // wave level keyframes: [time s, level] where 0 = bottom edge, 1 = top edge.
  // the back (light) wave leads the front on the way up and trails it on the
  // way down, so its band peeks out above the pearl blue like foam on sand.
  var FRONT = [[0, -0.14], [1.1, 0.81], [2.1, -0.24], [3.6, -0.24], [4.6, 1.24], [6.35, 1.24], [7, -0.14]];
  var BACK  = [[0, -0.14], [1.0, 0.84], [2.2, -0.24], [3.6, -0.24], [4.55, 1.3], [6.5, 1.3],   [7, -0.14]];

  // wave personalities. pattern 0 = broad shore swell (beat 1), pattern 1 =
  // tighter crests for the full-cover wash (beat 3). k = cycles across the
  // card, w = drift speed (rad/s), p = phase, a = weight.
  var WAVES = {
    front: [
      { k: [0.8, 1.5], w: 0.9,  p: 0.0, a: 0.6 },
      { k: [1.7, 2.8], w: -1.3, p: 1.7, a: 0.3 },
      { k: [3.1, 4.6], w: 1.9,  p: 4.1, a: 0.12 }
    ],
    back: [
      { k: [0.9, 1.7], w: -0.7, p: 2.3, a: 0.55 },
      { k: [1.5, 2.5], w: 1.1,  p: 0.6, a: 0.35 },
      { k: [2.7, 4.2], w: -1.6, p: 3.3, a: 0.14 }
    ]
  };
  var AMP = [0.075, 0.045]; // crest height (fraction of card) per pattern
  var TILT = 0.1;           // shore swell rides higher on the left as it rises,
                            // levelling out as it nears its peak
  var POINTS = 72;

  var svg = root.querySelector('.pearl-thumb-waves');
  var els = {
    front: {
      fill: svg.querySelector('.pt-front-fill'),
      clip: svg.querySelector('.pt-front-clip'),
      crest: svg.querySelectorAll('.pt-front-crest')
    },
    back: {
      fill: svg.querySelector('.pt-back-fill'),
      clip: svg.querySelector('.pt-back-clip'),
      crest: svg.querySelectorAll('.pt-back-crest')
    }
  };
  var screens = root.querySelectorAll('.pearl-thumb-screens img');
  var logo = root.querySelector('.pearl-thumb-fish');

  var W = 1000, H = 568; // svg viewBox units

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeInOut(x) { return 0.5 - 0.5 * Math.cos(Math.PI * x); }
  function ramp(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }

  function level(keys, t) {
    for (var i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      if (t >= a[0] && t <= b[0]) return a[1] + (b[1] - a[1]) * easeInOut((t - a[0]) / (b[0] - a[0]));
    }
    return keys[keys.length - 1][1];
  }

  // 0 while the shore swell plays, 1 during the flood; switches only while
  // both waves are off-card so the change in pattern is never seen morphing.
  function patternMix(t) {
    if (t < 3.3) return 0;
    if (t < 3.5) return easeInOut(ramp(t, 3.3, 3.5));
    if (t < 6.4) return 1;
    return 1 - easeInOut(ramp(t, 6.4, 7));
  }

  function crestPoints(name, t, lv, m) {
    var comps = WAVES[name], amp = AMP[0] + (AMP[1] - AMP[0]) * m;
    var tilt = TILT * (1 - m) * clamp(1 - lv / 0.84, 0, 1), pts = [];
    for (var i = 0; i <= POINTS; i++) {
      var x = i / POINTS, y = 0;
      for (var c = 0; c < comps.length; c++) {
        var k = comps[c].k[0] + (comps[c].k[1] - comps[c].k[0]) * m;
        y += comps[c].a * Math.sin(2 * Math.PI * k * x + comps[c].w * t + comps[c].p);
      }
      var h = lv + amp * y + tilt * (0.5 - x);
      pts.push([x * W, (1 - h) * H]);
    }
    return pts;
  }

  // smooth line through the sampled points (midpoint quadratic curves)
  function crestPath(pts) {
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += 'Q' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1);
    }
    var last = pts[pts.length - 1];
    return d + 'L' + last[0].toFixed(1) + ' ' + last[1].toFixed(1);
  }

  function drawWave(name, keys, t, m) {
    var crest = crestPath(crestPoints(name, t, level(keys, t), m));
    var body = crest + 'L' + W + ' ' + (H + 40) + 'L0 ' + (H + 40) + 'Z';
    var e = els[name];
    e.fill.setAttribute('d', body);
    e.clip.setAttribute('d', body);
    for (var i = 0; i < e.crest.length; i++) e.crest[i].setAttribute('d', crest);
  }

  function render(t) {
    var m = patternMix(t);
    drawWave('back', BACK, t, m);
    drawWave('front', FRONT, t, m);

    // phones are pinned in place: all three appear together while the swell
    // is at its peak, then the receding wave simply uncovers them. Hidden once
    // the flood covers them so the loop restarts on white.
    var screenOp = t < 4.7 ? ramp(t, 0.95, 1.1).toFixed(3) : 0;
    for (var i = 0; i < screens.length; i++) screens[i].style.opacity = screenOp;

    // logo fades in quickly once the flood has covered the card
    logo.style.opacity = (ramp(t, 4.5, 4.75) * (1 - ramp(t, 6.15, 6.35))).toFixed(3);
  }

  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    render(3); // the three screens, waves at rest
    return;
  }

  // only animate while the card is on screen and the tab is visible
  var clock = 0, last = null, raf = null, onScreen = false;
  function frame(now) {
    if (last !== null) clock = (clock + Math.min((now - last) / 1000, 0.1)) % LOOP;
    last = now;
    render(clock);
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    var run = onScreen && !document.hidden;
    if (run && raf === null) { last = null; raf = requestAnimationFrame(frame); }
    if (!run && raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }
  render(0);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting; sync();
    }).observe(root);
  } else { onScreen = true; }
  document.addEventListener('visibilitychange', sync);
  sync();
})();
