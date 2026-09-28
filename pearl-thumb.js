/* Pearl animated thumbnail: two glassy waves wash up a shore, recede to reveal
   three app screens, then a second, choppier swell floods the card in Pearl
   blue for the fish + slogan before draining and looping. One 7s timeline
   drives everything so the beats stay in sync; tweak the keyframes below. */
(function () {
  var root = document.querySelector('.pearl-thumb');
  if (!root) return;

  var LOOP = 7; // seconds

  // wave level keyframes: [time s, level] where 0 = bottom edge, 1 = top edge.
  // the back (light) wave leads the front on the way up and trails it on the
  // way down, so its band peeks out above the pearl blue like foam on sand.
  var FRONT = [[0, -0.14], [1.1, 0.66], [2.1, -0.24], [3.6, -0.24], [4.6, 1.24], [6.35, 1.24], [7, -0.14]];
  var BACK  = [[0, -0.14], [1.0, 0.76], [2.2, -0.24], [3.6, -0.24], [4.55, 1.3], [6.5, 1.3],   [7, -0.14]];

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
  var TILT = 0.1;           // shore swell rides higher on the left (sketch beat 1)
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
  var fish = root.querySelector('.pearl-thumb-fish');
  var slogan = root.querySelector('.pearl-thumb-slogan');

  var W = 1000, H = 568; // svg viewBox units

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeInOut(x) { return 0.5 - 0.5 * Math.cos(Math.PI * x); }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
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
    var tilt = TILT * (1 - m), pts = [];
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

    // screens fade in while submerged at the swell's peak, then rise into
    // place as the water drains back; hidden once the flood covers them so
    // the loop restarts on white.
    for (var i = 0; i < screens.length; i++) {
      var s = screens[i], d = i * 0.06;
      var rise = easeOut(ramp(t, 1.1 + d, 2.25 + d));
      s.style.opacity = t < 4.7 ? ramp(t, 0.95, 1.1).toFixed(3) : 0;
      s.style.transform = 'translateY(' + ((1 - rise) * 50).toFixed(2) + '%) scale(' + (0.95 + 0.05 * rise).toFixed(4) + ')';
    }

    var fIn = ramp(t, 4.55, 5.2), sIn = ramp(t, 4.9, 5.45), out = ramp(t, 6.15, 6.4);
    var pop = fIn < 1 ? 0.86 + 0.14 * easeOut(fIn) + 0.03 * Math.sin(Math.PI * fIn) : 1;
    fish.style.opacity = (easeOut(fIn) * (1 - out)).toFixed(3);
    fish.style.transform = 'translate(-50%, -50%) scale(' + pop.toFixed(4) + ')';
    slogan.style.opacity = (easeOut(sIn) * (1 - out)).toFixed(3);
    slogan.style.transform = 'translate(-50%, ' + ((1 - easeOut(sIn)) * 40).toFixed(1) + '%)';
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
