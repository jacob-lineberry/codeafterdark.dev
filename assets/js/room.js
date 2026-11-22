// The 2am room, drawn in characters. Pure drawing, no DOM.
//
// Light decides every cell. The lamp, the monitor and the moon each light what is near them;
// a cell's character comes from how much light lands there (" .:;+*#", dark to bright)
// and its colour from whichever light wins. Darkness is blank, so the eye ranks the sources
// lamp, then screen, then moon. A few parts are drawn with line characters (the window frame,
// the lamp's arm, the monitor's bezel), and they take their colour from the light too.
//
// scripts/scenes.mjs writes first frames into data/scenes.json so pages show the room before,
// or without, JavaScript. site.js redraws the home room with tonight's moon and lets windows
// across the street come and go. After editing this file, run:  node scripts/scenes.mjs

const ASP = 0.5; // a cell's width over its height, for distances and round shapes
const RAMP = " .:;+*#";
const SEED = 20261122;

// ---- the moon -------------------------------------------------------------------------

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

// ---- the rooms ------------------------------------------------------------------------

// Every place the room appears. Coordinates are cells: x across, y down.
//   home   the whole room, above the post list
//   phone  a narrower cut of it: lamp edge, window and moon, the monitor's edge
//   view   the view from the window, for a post's header (with that night's moon)
export const ROOMS = {
  home: {
    W: 120, H: 30,
    win: { x0: 36, x1: 82, y0: 3, y1: 20, mull: 59 },
    moon: { x: 72, y: 7.6, r: 3.3 },
    band: 10,
    plant: { x: 38, y: 20 },
    lamp: { bulb: [27, 13.4], dir: [0.2, 1], cone: [0.62, 0.88], power: 1.8, reach: 10, wash: 0.55,
      shade: [21, 33, 12], arm: [[18, 26], [13, 7], [22, 11]], base: [12, 24, 27] },
    desk: { y0: 24, y1: 29, x0: 0, x1: 120 },
    cat: { x: 25, y: 23 },
    patch: [[47, 24], [67, 24], [61, 28], [40, 28]],
    screen: { x0: 91, x1: 117, y0: 11, y1: 21, power: 0.6, reach: 5 },
    stand: { x: 103, y0: 22, y1: 24 },
    keys: { x0: 92, x1: 114, y: 26 },
    mug: { x: 80, y: 24 },
  },
  phone: {
    W: 48, H: 25,
    win: { x0: 8, x1: 37, y0: 3, y1: 15, mull: 22 },
    moon: { x: 30, y: 6.4, r: 2.8 },
    band: 7,
    plant: { x: 9, y: 15 },
    lamp: { bulb: [3, 11.4], dir: [0.25, 1], cone: [0.62, 0.88], power: 1.9, reach: 9, wash: 0.5,
      shade: [-3, 9, 10], arm: [[-3, 6], [-1, 4], [2, 9]], base: null },
    desk: { y0: 19, y1: 24, x0: 0, x1: 48 },
    cat: { x: 3, y: 18 },
    patch: [[17, 19], [31, 19], [27, 23], [12, 23]],
    screen: { x0: 40, x1: 47, y0: 8, y1: 17, power: 0.6, reach: 4.5 },
    stand: { x: 43, y0: 18, y1: 19 },
    keys: { x0: 38, x1: 48, y: 21 },
    mug: { x: 32, y: 19 },
  },
  view: {
    W: 46, H: 18,
    win: { x0: 6, x1: 40, y0: 2, y1: 15, mull: 23 },
    moon: { x: 32, y: 5.8, r: 3 },
    band: 8,
    plant: { x: 8, y: 15 },
    // The lamp and the screen are behind you, off the edges: only their light comes in.
    lamp: { bulb: [-7, 13], dir: [0.6, 0.8], cone: [0.2, 0.6], power: 0.75, reach: 9, wash: 0 },
    screen: { x0: 50, x1: 56, y0: 10, y1: 18, power: 0.5, reach: 6, off: true },
    sill: true,
  },
};

// ---- small tools ----------------------------------------------------------------------

const rng = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const esc = (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c);

function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Colour steps for each light, dim to bright (see .room in main.css).
const STEPS = { l: [0.17, 0.32, 0.52, 0.78], s: [0.2, 0.4, 0.7], m: [0.2, 0.38, 0.62] };
const step = (fam, v) => fam + (STEPS[fam].findIndex((t) => v < t) + 1 || STEPS[fam].length + 1);
const glyph = (v) => RAMP[clamp(Math.floor(v * 8), 0, RAMP.length - 1)];

// ---- the scene ------------------------------------------------------------------------

/** The skyline: buildings across the window, their windows, and the antenna. Fixed by SEED. */
function skyline(R) {
  const { x0, x1, y1 } = R.win;
  const r = rng(SEED + x1 * 31);
  const span = y1 - R.win.y0;
  const out = { blocks: [], windows: [], antenna: null };
  let x = x0 - 1;
  let tallest = null;
  while (x < x1) {
    const w = 3 + Math.floor(r() * 5);
    const top = y1 - Math.max(2, Math.round(span * (0.12 + r() * 0.3)));
    const b = { x0: x, x1: Math.min(x1, x + w), top };
    out.blocks.push(b);
    if (!tallest || top < tallest.top) tallest = b;
    x += w + (r() < 0.25 ? 1 : 0);
  }
  for (const b of out.blocks)
    for (let yy = b.top + 1; yy < y1; yy++)
      for (let xx = b.x0 + 1; xx < b.x1 - 1; xx += 2)
        if (xx !== R.win.mull) out.windows.push({ x: xx, y: yy, on: r() < 0.3 });
  const ax = Math.floor((tallest.x0 + tallest.x1) / 2);
  out.antenna = { x: ax, y: tallest.top - 2 };
  return out;
}
const SKY = {};
export function windowsOf(name) {
  return (SKY[name] ||= skyline(ROOMS[name])).windows;
}

/**
 * Draws a room. opts.phase is the moon (0 to 1); opts.flip is a set of window indexes
 * whose light is the opposite of how the skyline starts.
 * Returns { W, H, ch, cl, fields } for html().
 */
export function draw(name, opts = {}) {
  const R = ROOMS[name];
  const { W, H } = R;
  const phase = opts.phase ?? 0.5;
  const flip = opts.flip || new Set();
  const sky = (SKY[name] ||= skyline(R));
  const mk = (v) => Array.from({ length: H }, () => Array(W).fill(v));
  const ch = mk(" "), cl = mk(""), mat = mk("wall");
  const put = (x, y, c, k) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ch[y][x] = c; cl[y][x] = k;
  };
  const setMat = (x, y, m) => { if (x >= 0 && y >= 0 && x < W && y < H) mat[y][x] = m; };
  const fields = [];

  // -- light from each source at a cell
  const L = R.lamp;
  const lamp = (x, y, vol) => {
    if (!L) return 0;
    const dx = (x - L.bulb[0]) * ASP, dy = y - L.bulb[1];
    const d = Math.hypot(dx, dy) || 0.01;
    const n = Math.hypot(...L.dir);
    const cos = (dx * L.dir[0] + dy * L.dir[1]) / d / n;
    const cone = smooth(L.cone[0], L.cone[1], cos);
    const fall = 1 / (1 + (d / L.reach) ** 2);
    if (vol) return L.power * fall * cone;
    return L.power * fall * (dy < -0.5 ? 0.04 : 0.07 + 0.93 * cone);
  };
  const S = R.screen;
  const screen = (x, y) => {
    if (!S) return 0;
    const dx = Math.max(S.x0 - x, 0, x - (S.x1 - 1)) * ASP;
    const dy = Math.max(S.y0 - y, 0, y - (S.y1 - 1));
    const d = Math.hypot(dx, dy);
    return (S.power / (1 + (d / S.reach) ** 2)) * (y < S.y0 ? 0.5 : 1);
  };
  const patch = (x, y) => (R.patch && inPoly(R.patch, x + 0.5, y + 0.5) ? 0.3 : 0);

  // Lights a surface cell: character from brightness, colour from the strongest light.
  const light = (x, y, albedo, { moon = 0, ramp = null, floor = 0, vol = false } = {}) => {
    const a = lamp(x, y, vol) * albedo, s = screen(x, y) * albedo, m = (moon + patch(x, y)) * albedo;
    const v = Math.max(a + s + m, floor);
    if (v < 0.1) return null;
    const fam = a >= s && a >= m ? "l" : s >= m ? "s" : "m";
    const g = ramp ? ramp[clamp(Math.floor(v * ramp.length), 0, ramp.length - 1)] : glyph(v);
    return [g, step(fam, v)];
  };
  const lit = (x, y, albedo, o) => { const r = light(x, y, albedo, o); if (r) put(x, y, r[0], r[1]); };

  const { x0, x1, y0, y1, mull } = R.win;
  const inWin = (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;

  // -- the wall: dark, except where the lamp and the screen reach it
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!inWin(x, y)) lit(x, y, 0.32, { ramp: " ..:" });

  // -- the sky: the city's glow low down, stars above, the moon
  const r = rng(SEED);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      put(x, y, " ", "");
    }
  // the city's glow is a wash behind the skyline (see .field.glow); buildings stand in front of it
  fields.push({ k: "glow", x: x0, y: y1 - R.band, w: x1 - x0, h: R.band });
  const M = R.moon;
  const halo = moonLit(phase);
  const nearMoon = (x, y) => Math.hypot((x - M.x) * ASP, y - M.y) < M.r * 2;
  for (let i = 0; i < (x1 - x0) * (y1 - y0) * 0.035; i++) {
    const x = x0 + Math.floor(r() * (x1 - x0)), y = y0 + Math.floor(r() * (y1 - y0 - R.band));
    const b = r();
    if (!nearMoon(x, y)) put(x, y, b > 0.92 ? "+" : ".", b > 0.92 ? "st2" : "st1");
  }
  // The disc: lit side bright, the far side a faint rim, and a halo that grows with the light.
  for (let y = Math.floor(M.y - M.r * 2); y <= Math.ceil(M.y + M.r * 2); y++)
    for (let x = Math.floor(M.x - (M.r * 2) / ASP); x <= Math.ceil(M.x + (M.r * 2) / ASP); x++) {
      if (!inWin(x, y)) continue;
      const nx = ((x + 0.5 - M.x) * ASP) / M.r, ny = (y + 0.5 - M.y) / M.r;
      const d2 = nx * nx + ny * ny;
      if (d2 <= 1) {
        const k = Math.cos(2 * Math.PI * phase) * Math.sqrt(Math.max(0, 1 - ny * ny));
        const on = phase <= 0.5 ? nx > k : nx < -k;
        if (on) {
          let b = 0.72 + 0.28 * Math.sqrt(1 - d2);
          if (Math.hypot(nx + 0.3, ny + 0.25) < 0.28 || Math.hypot(nx - 0.25, ny - 0.3) < 0.22) b -= 0.18;
          put(x, y, b > 0.86 ? "█" : b > 0.72 ? "▓" : "▒", b > 0.8 ? "m4" : "m3");
        } else put(x, y, "░", "m0");
      } else if (d2 < 2.6 && halo > 0.12) {
        const v = halo * (2.6 - d2) / 1.6;
        if (v > dither(x, y) * 0.8 + 0.1) put(x, y, v > 0.55 ? "·" : ".", v > 0.5 ? "m2" : "m1");
      }
    }
  // Buildings: dark shapes against the glow, with their windows and one antenna.
  for (const b of sky.blocks)
    for (let y = b.top; y < y1; y++) for (let x = b.x0; x < b.x1; x++) if (inWin(x, y)) put(x, y, "█", "bd");
  sky.windows.forEach((w, i) => { if (w.on !== flip.has(i)) put(w.x, w.y, ":", (w.x * 7 + w.y) % 3 ? "w1" : "w2"); });
  const A = sky.antenna;
  if (inWin(A.x, A.y)) { put(A.x, A.y + 1, "|", "v1"); put(A.x, A.y, "*", "an"); }

  // -- the window: frame, the bar down the middle, the sill
  const frame = (x, y, c) => {
    const v = lamp(x, y) * 0.9 + screen(x, y) * 0.6;
    put(x, y, c, v > 0.3 ? step("l", v) : "m1");
  };
  for (let y = y0; y < y1; y++) { frame(x0 - 1, y, "│"); frame(x1, y, "│"); if (mull) frame(mull, y, "│"); }
  for (let x = x0; x < x1; x++) frame(x, y0 - 1, x === mull ? "┬" : "─");
  frame(x0 - 1, y0 - 1, "┌"); frame(x1, y0 - 1, "┐");
  // the sill catches a little moonlight along its edge, and the lamp near it
  for (let x = x0 - 3; x <= x1 + 2; x++) {
    const a = lamp(x, y1) * 0.7, sc = screen(x, y1) * 0.5;
    const fam = a > 0.2 && a >= sc ? "l" : sc > 0.2 ? "s" : "m";
    const v = fam === "m" ? 0.22 + 0.1 * dither(x, 0) : Math.min(0.5, a + sc);
    put(x, y1, v > 0.3 ? "▁" : "_", step(fam, v));
  }


  // -- a plant on the sill, a silhouette against the glow
  if (R.plant) {
    const p = R.plant;
    const leaves = ["  \\ /", "\\ |/ /", " \\|/", " [_]"];
    leaves.forEach((row, j) =>
      [...row].forEach((c, i) => {
        if (c === " ") return;
        const x = p.x + i, y = p.y - leaves.length + j;
        if (c === "[" || c === "]" || c === "_") lit(x, y, 1.4, { moon: 0.25, ramp: "  " + c + c });
        else put(x, y, c, "g2");
      }));
  }

  // -- the desk: a surface lit by everything, a front edge, dark underneath
  const D = R.desk;
  if (D) {
    for (let y = D.y0; y < D.y1; y++) for (let x = D.x0; x < D.x1; x++) setMat(x, y, "desk");
    // the moon patch first, so things on the desk cover it
    for (let y = D.y0; y < D.y1; y++) for (let x = D.x0; x < D.x1; x++) lit(x, y, 1);
    for (let x = D.x0; x < D.x1; x++) {
      const res = light(x, D.y1, 1.1);
      if (res) put(x, D.y1, "▔", res[1]);
    }
    for (let y = D.y1 + 1; y < H; y++) for (let x = 0; x < W; x++) put(x, y, " ", "");
  }

  // -- the lamp: its cone of light in the air, the shade, the arm, the base
  if (L && L.shade) {
    for (let y = Math.ceil(L.bulb[1]); y < (D ? D.y0 : H); y++)
      for (let x = 0; x < W; x++) {
        if (inWin(x, y) || ch[y][x] !== " " && !/^l/.test(cl[y][x])) continue;
        const v = lamp(x, y, true) * 0.3;
        if (v > 0.08 + dither(x, y) * 0.3) put(x, y, v > 0.3 ? ":" : ".", step("l", v + 0.1));
      }
    const [s0, s1, sy] = L.shade;
    const mid = (s0 + s1) / 2;
    const line = (pts, cFor) => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let k = 0; k <= n; k++) {
          const x = Math.round(ax + ((bx - ax) * k) / n), y = Math.round(ay + ((by - ay) * k) / n);
          const sx = (bx - ax) * ASP, sy2 = by - ay;
          const c = Math.abs(sx) < Math.abs(sy2) * 0.35 ? "│" : Math.abs(sy2) < Math.abs(sx) * 0.35 ? "─" : sx * sy2 > 0 ? "╲" : "╱";
          cFor(x, y, c);
        }
      }
    };
    const metal = (x, y, c) => { const v = lamp(x, y) * 0.8; put(x, y, c, v > 0.17 ? step("l", v) : "v1"); };
    line(L.arm, metal);
    if (L.base) for (let x = L.base[0]; x <= L.base[1]; x++) metal(x, L.base[2], x === L.base[0] ? "▟" : x === L.base[1] ? "▙" : "▄");
    // the shade: dark outside, its rim catching the bulb
    for (let x = s0; x <= s1; x++) {
      const t = Math.abs(x - mid) / ((s1 - s0) / 2);
      if (t < 0.55) put(x, sy - 1, "▄", "v1");
      put(x, sy, t > 0.85 ? (x < mid ? "▟" : "▙") : "█", "v1");
      put(x, sy + 1, "▔", t < 0.7 ? "l5" : "l4");
    }
    put(Math.round(L.bulb[0]), Math.ceil(L.bulb[1]) , "@", "l5");
    fields.push({ k: "lampwash", x: L.bulb[0], y: L.bulb[1] + 7, w: 34, h: 16, o: L.wash });
  }


  // -- the cat, asleep in the lamp's pool: a dark shape, its back catching the light
  if (R.cat) {
    const c = R.cat;
    // # is the body (left dark); the other characters are its edge, lit from the lamp.
    const CAT = [
      "  /\\_/\\",
      " /#####\\._.-~~~-._",
      "(###############  )",
      " `-.__########__.-'~",
    ];
    // shadow on the desk, away from the lamp
    for (let j = 1; j < CAT.length + 1; j++)
      for (let i = 4; i < 23; i++) {
        const x = c.x + i, y = c.y + j;
        if (mat[y]?.[x] === "desk") { const r2 = light(x, y, 0.35); put(x, y, r2 ? r2[0] : " ", r2 ? r2[1] : ""); }
      }
    CAT.forEach((row, j) =>
      [...row].forEach((ch2, i) => {
        if (ch2 === " ") return;
        const x = c.x + i, y = c.y + j;
        if (ch2 === "#") { put(x, y, " ", ""); return; }
        const v = lamp(x, y) * 1.3;
        if (v > 0.3 || "/\\".includes(ch2) && j === 0) put(x, y, ch2, step("l", v + 0.15));
        else put(x, y, " ", "");
      }));
  }

  // -- the monitor: a lit field in a bezel, a graph, the player along the bottom
  if (S && !S.off) {
    const bx0 = S.x0 - 1, bx1 = S.x1, by0 = S.y0 - 1, by1 = S.y1;
    const bez = (x, y, c) => put(x, y, c, "s1");
    for (let x = bx0; x <= bx1; x++) { bez(x, by0, "─"); bez(x, by1, "─"); }
    for (let y = by0; y <= by1; y++) { bez(bx0, y, "│"); bez(bx1, y, "│"); }
    bez(bx0, by0, "┌"); bez(bx1, by0, "┐"); bez(bx0, by1, "└"); bez(bx1, by1, "┘");
    for (let y = S.y0; y < S.y1; y++) for (let x = S.x0; x < S.x1; x++) put(x, y, " ", "");
    fields.push({ k: "screen", x: S.x0, y: S.y0, w: S.x1 - S.x0, h: S.y1 - S.y0 });
    const gw = S.x1 - S.x0 - 2, top = S.y0 + 1, gh = S.y1 - S.y0 - 4;
    // a latency line, quiet, with one spike; the dashed line is its target
    const sloY = top + Math.round(gh * 0.3);
    for (let i = 0; i < gw; i += 2) put(S.x0 + 1 + i, sloY, "-", "l2");
    if (gw >= 10) [..."p99"].forEach((c, i) => put(S.x0 + 1 + i, top, c, "s2"));
    let prev = null;
    for (let i = 0; i < gw; i++) {
      const t = i / gw;
      const v = 0.32 + 0.12 * Math.sin(t * 9) + 0.07 * Math.sin(t * 23 + 1) + (Math.abs(t - 0.62) < 0.05 ? 0.42 : 0);
      const yy = top + gh - v * gh;
      const row = Math.floor(yy), frac = yy - row;
      const c = frac < 0.34 ? "‾" : frac < 0.67 ? "-" : "_";
      const x = S.x0 + 1 + i;
      if (prev !== null && Math.abs(prev - row) > 1)
        for (let k = Math.min(prev, row) + 1; k < Math.max(prev, row); k++) put(x, k, "│", "s4");
      put(x, row, c, "s4");
      prev = row;
    }
    // the player: what's on, and how far through
    const py = S.y1 - 1;
    const label = gw >= 20 ? "▶ 03:42" : "▶";
    [...label].forEach((c, i) => put(S.x0 + 1 + i, py, c, i < 2 ? "gr" : "s3"));
    // and the spectrum analyser beside it, as every player had
    const bands = gw >= 20 ? 8 : 0;
    const bar = gw - label.length - 1 - (bands ? bands + 1 : 0);
    for (let i = 0; i < bar; i++) put(S.x0 + label.length + 2 + i, py, i < bar * 0.45 ? "━" : "─", i < bar * 0.45 ? "gr" : "s1");
    const LEVELS = "▁▂▃▄▅▆▇";
    [3, 5, 6, 4, 6, 3, 2, 4].slice(0, bands).forEach((h, i) => put(S.x1 - 1 - bands + i, py, LEVELS[h], h > 5 ? "s4" : h > 3 ? "s3" : "s2"));
    if (R.stand) {
      for (let y = R.stand.y0; y < R.stand.y1; y++) { bez(R.stand.x - 1, y, "│"); bez(R.stand.x + 1, y, "│"); }
      for (let x = R.stand.x - 4; x <= R.stand.x + 4; x++) bez(x, R.stand.y1, x === R.stand.x - 4 ? "▟" : x === R.stand.x + 4 ? "▙" : "▄");
    }
  }

  // -- the keyboard, in the screen's light
  if (R.keys) {
    const K = R.keys;
    for (let x = K.x0; x < K.x1; x++) {
      lit(x, K.y, 1.6, { ramp: " .::", floor: 0.15 });
      lit(x, K.y + 1, 1.3, { ramp: " .::", floor: 0.15 });
    }
    for (let x = K.x0; x < K.x1; x++) { const res = light(x, K.y + 2, 1.2, { floor: 0.15 }); put(x, K.y + 2, "▔", res ? res[1] : "v1"); }
  }

  // -- a mug, with steam lit by the moon
  if (R.mug) {
    const g = R.mug;
    const body = ["╭──╮", "│  │╮", "╰──╯"];
    body.forEach((row, j) => [...row].forEach((c, i) => {
      if (c === " ") { put(g.x + i, g.y + j, " ", ""); return; }
      const res = light(g.x + i, g.y + j, 1.5, { moon: 0.2, floor: 0.2 });
      put(g.x + i, g.y + j, c, res[1]);
    }));
    [[1, -1, "("], [2, -2, ")"], [1, -3, "("]].forEach(([dx, dy, c]) => put(g.x + dx, g.y + dy, c, "m1"));
  }


  return { W, H, ch, cl, fields };
}

/** A drawn room as HTML for a <pre>: runs of one colour share a span; light fields go first. */
export function html(g) {
  const f = g.fields.map((d) =>
    d.k !== "lampwash"
      ? `<span class="field ${d.k}" style="--x:${d.x};--y:${d.y};--w:${d.w};--h:${d.h}"></span>`
      : `<span class="field ${d.k}" style="--x:${d.x - d.w / 2};--y:${d.y - d.h / 2};--w:${d.w};--h:${d.h};--o:${d.o}"></span>`,
  ).join("");
  const rows = [];
  for (let y = 0; y < g.H; y++) {
    let h = "", run = "", cls = null;
    for (let x = 0; x < g.W; x++) {
      const c = g.ch[y][x] === " " ? cls ?? "" : g.cl[y][x];
      if (c !== cls) { if (run) h += cls ? `<b class="${cls}">${run}</b>` : run; run = ""; cls = c; }
      run += esc(g.ch[y][x]);
    }
    h += cls ? `<b class="${cls}">${run}</b>` : run.replace(/ +$/, "");
    rows.push(h);
  }
  return f + rows.join("\n");
}
