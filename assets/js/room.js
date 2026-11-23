// The moon, for the room and for the small moon icons. Pure maths, no DOM.
//
// The room itself is drawn ahead of time by scripts/scenes.mjs (scripts/room/) as static SVG.
// The one thing in it that changes from night to night is the moon in the window, so this file
// holds the moon's phase maths and the pixel moon both the build and site.js draw with.

// A new moon at 2000-01-06 18:14 UTC; phases repeat every synodic month.
const NEW_MOON = 947182440;
const SYNODIC = 29.530588853;

/** Phase for a time in ms: 0 new, .25 first quarter, .5 full, .75 last quarter. */
export function moonPhase(ms) {
  const d = (ms / 1000 - NEW_MOON) / 86400 / SYNODIC;
  return d - Math.floor(d);
}

/** Share of the disc that is lit, 0 to 1. */
export const moonLit = (f) => (1 - Math.cos(2 * Math.PI * f)) / 2;

/** The phase's name. layouts/_partials/night.html uses the same cut-offs. */
export function moonName(f) {
  if (f < 0.0339 || f >= 0.9661) return "new moon";
  if (f < 0.2161) return "waxing crescent";
  if (f < 0.2839) return "first quarter";
  if (f < 0.4661) return "waxing gibbous";
  if (f < 0.5339) return "full moon";
  if (f < 0.7161) return "waning gibbous";
  if (f < 0.7839) return "last quarter";
  return "waning crescent";
}

/** The lit part of a 16px moon icon as an SVG path, or "" near a new moon.
    layouts/_partials/moon.html draws the same shape. */
export function moonPath(f) {
  if (f < 0.0339 || f >= 0.9661) return "";
  const rx = (7 * Math.abs(Math.cos(2 * Math.PI * f))).toFixed(2);
  const waxing = f <= 0.5;
  const sweep = waxing ? (f < 0.25 ? 0 : 1) : f > 0.75 ? 1 : 0;
  return `M8 1A7 7 0 0 ${waxing ? 1 : 0} 8 15A${rx} 7 0 0 ${sweep} 8 1Z`;
}

// ---- the pixel moon in the room's window ------------------------------------------------

// 4x4 ordered dither, the same one the room's light uses
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const CRATERS = new Set(["-1,-1", "1,1", "2,-2", "-2,2"]);

/** The moon on phase f as pixels round its centre (0, 0): the lit face, its craters, a softer
    shade where the shadow begins (and down the lower right of a broad moon), the unlit disc,
    and a dithered halo whose reach follows how much of it is lit. One pixel is 8 x 8 units in
    the room's SVG. Seen from the north, a waxing moon is lit on the right. */
export function moonPixels(f, r = 4.4) {
  const out = { halo: [], dark: [], lit: [], edge: [], crater: [] };
  const k = Math.cos(2 * Math.PI * f), waxing = f <= 0.5, lit = moonLit(f);
  const R = r + 2.8, n = Math.ceil(R);
  const on = (x, y) => {
    if (Math.hypot(x, y) >= r || lit < 0.02) return false;
    const w = Math.sqrt(r * r - y * y);
    return waxing ? x >= k * w : x <= -k * w;
  };
  for (let y = -n; y <= n; y++) {
    for (let x = -n; x <= n; x++) {
      const d = Math.hypot(x, y);
      if (d < r) {
        if (!on(x, y)) out.dark.push([x, y]);
        else if (CRATERS.has(`${x},${y}`)) out.crater.push([x, y]);
        else if (!on(waxing ? x - 1 : x + 1, y) && Math.hypot(waxing ? x - 1 : x + 1, y) < r) out.edge.push([x, y]);
        // a broad moon gets some volume: a softer band down its lower right
        else if (lit > 0.6 && x + y * 0.5 > 2.2) out.edge.push([x, y]);
        else out.lit.push([x, y]);
      } else if (d < R && bayer(x, y) < ((R - d) / 3.2) * Math.min(1, lit * 1.4)) out.halo.push([x, y]);
    }
  }
  return out;
}

/** The moon on phase f as the inside of the room's <g class="moon">. */
export function moonSVG(f) {
  const px = moonPixels(f);
  return Object.entries(px).map(([part, p]) => (p.length ? `<path class="mn-${part}" d="${pixelPath(p)}"/>` : "")).join("");
}

/** Pixels as one SVG path of 8 x 8 squares, runs along a row joined. */
export function pixelPath(px) {
  const rows = new Map();
  for (const [x, y] of px) (rows.get(y) || rows.set(y, []).get(y)).push(x);
  let d = "";
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length; ) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      d += `M${xs[i] * 8} ${y * 8}h${(j - i + 1) * 8}v8h-${(j - i + 1) * 8}z`;
      i = j + 1;
    }
  }
  return d;
}
