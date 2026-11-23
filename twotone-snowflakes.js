/* Two-tone snowflakes (experiment — reference: the 9 white-and-gold line
   snowflakes Arti shared, 2026-11-23).

   Each flake is two separate sets of pieces, each its own solid colour:
     a = the main line-work (the white in the reference)
     b = the accents (the gold: diamonds, V's, rings, tips)
   Lines are stroked with square-cut ends and mitred corners so every edge
   is sharp like the stars (no rounded ends; the reference's round dots
   became small diamonds, its curly loops became straight-line versions).
   Like the other snowflakes, one arm is drawn pointing up and spun 6 times;
   `between` pieces sit 30° round, between the arms. */

import { rot } from './snowflakes.js';

const r = (n) => Math.round(n * 100) / 100;
const W = 9; // line weight, in the -104..104 viewBox (≈2.8px at 64px)
const FIT = 0.93; // shrink so line ends stay inside the box

// pieces. A line is an open polyline (closed: true joins it back up);
// a fill is a solid polygon.
const line = (...pts) => ({ line: pts });
const loop = (...pts) => ({ line: pts, closed: true });
const fill = (...pts) => ({ fill: pts });

// a straight spoke up the arm from radius a to b
const spoke = (a, b) => line([0, -a], [0, -b]);
// a V (pointing out) on the arm at radius y: two branches `len` long at ±deg
const vee = (y, deg, len) => {
  const [x1, y1] = rot([0, -len], deg);
  return line([-x1, -y + y1], [0, -y], [x1, -y + y1]);
};
// a filled diamond on the arm from radius near to far, halfW wide
const diamond = (near, far, halfW) => fill([0, -near], [halfW, -(near + far) / 2], [0, -far], [-halfW, -(near + far) / 2]);
// the same diamond as an outline
const diamondLine = (near, far, halfW) => loop([0, -near], [halfW, -(near + far) / 2], [0, -far], [-halfW, -(near + far) / 2]);
// whole-flake rings (not per arm): hexagon, and six-pointed star outline
const hexRing = (rad, off = 0) => loop(...[0, 1, 2, 3, 4, 5].map((i) => rot([0, -rad], off + 60 * i)));
const starRing = (outer, inner) =>
  loop(...Array.from({ length: 12 }, (_, i) => rot([0, -(i % 2 ? inner : outer)], 30 * i)));

// arm: pieces repeated on all 6 arms; between: 30° round; whole: drawn once
const flake = (name, a, b) => ({ name, a, b });
const part = (arm = [], between = [], whole = []) => ({ arm, between, whole });

export const TWOTONE_FLAKES = [
  flake('fern',
    part([spoke(0, 96), vee(62, 45, 26), vee(80, 45, 14)]),
    part([], [diamond(26, 62, 9)])),
  flake('hexstar',
    part([spoke(52, 82), vee(72, 50, 16)], [], [starRing(52, 28)]),
    part([diamond(86, 100, 6)], [], [hexRing(13)])),
  flake('crown',
    part([spoke(44, 64), vee(58, 50, 12)], [], [starRing(44, 24), hexRing(30, 30)]),
    part([diamond(66, 100, 10)], [diamond(52, 72, 7)])),
  flake('arrow',
    part([spoke(0, 30), spoke(56, 88), vee(76, 50, 14), diamondLine(22, 58, 12)]),
    part([diamond(88, 100, 5)], [vee(66, 45, 10)], [hexRing(9)])),
  flake('chevron',
    part([spoke(20, 64), line([-12, -46], [12, -46])], [vee(50, 35, 18)]),
    part([diamond(66, 96, 8)], [], [hexRing(12)])),
  flake('lens',
    part([spoke(16, 46)], [diamondLine(20, 80, 15)]),
    part([diamond(50, 100, 11)], [], [hexRing(14)])),
  flake('kite',
    part([diamondLine(26, 100, 17), spoke(26, 58)]),
    part([vee(80, 35, 10)], [diamond(76, 92, 5)], [hexRing(24, 30), hexRing(10, 30)])),
  flake('anchor',
    part([spoke(18, 96), vee(80, 45, 14), vee(56, 60, 20)], [diamond(64, 74, 4)]),
    part([], [spoke(22, 50), line([-12, -50], [12, -50])], [hexRing(12)])),
  flake('bloom',
    part([spoke(14, 82), vee(40, 60, 22), vee(60, 50, 14)], [], [hexRing(12)]),
    part([diamond(86, 100, 5)], [diamond(30, 72, 10)])),
];

const spin = (pts, deg) => pts.map((p) => rot(p, deg)).map(([x, y]) => [x * FIT, y * FIT]);

// all pieces of one colour, spun into place
function pieces(p) {
  const out = [];
  for (let k = 0; k < 6; k++) {
    p.arm.forEach((s) => out.push({ ...s, pts: spin(s.line || s.fill, k * 60) }));
    p.between.forEach((s) => out.push({ ...s, pts: spin(s.line || s.fill, k * 60 + 30) }));
  }
  p.whole.forEach((s) => out.push({ ...s, pts: spin(s.line || s.fill, 0) }));
  return out;
}

const d = (pts, closed) => 'M' + pts.map(([x, y]) => `${r(x)} ${r(y)}`).join('L') + (closed ? 'Z' : '');

function layer(p, color) {
  const all = pieces(p);
  const lines = all.filter((s) => s.line).map((s) => d(s.pts, s.closed)).join('');
  const fills = all.filter((s) => s.fill).map((s) => d(s.pts, true)).join('');
  return (
    (fills ? `<path d="${fills}" fill="${color}"/>` : '') +
    (lines ? `<path d="${lines}" fill="none" stroke="${color}" stroke-width="${W}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="6"/>` : '')
  );
}

// an <svg> string: `lineColor` for the main line-work, `accentColor` for the accents
export function twotoneSVG(f, [lineColor, accentColor], size = 64) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-104 -104 208 208" width="${size}" height="${size}">` +
    layer(f.b, accentColor) + layer(f.a, lineColor) + '</svg>'
  );
}

// colour pairs [line-work, accent]: every pair of colours that sit together
// in one of the stars' colour trios (Figma "stars", node 1833:392), orange
// now #ff5400
export const PAIRS = [
  ['#eb1763', '#ff5400'], ['#ff5400', '#ced629'], ['#eb1763', '#ced629'],
  ['#ffc74c', '#f8c9dd'], ['#ceeaee', '#ffc74c'], ['#f8c9dd', '#ceeaee'],
  ['#ff5400', '#ffc74c'], ['#ced629', '#ffc74c'],
  ['#eb1763', '#f8c9dd'], ['#5567af', '#f8c9dd'], ['#5567af', '#eb1763'],
  ['#ced629', '#ceeaee'], ['#5567af', '#ced629'], ['#5567af', '#ceeaee'],
];
