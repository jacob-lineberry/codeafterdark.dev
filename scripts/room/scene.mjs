// The room: lofi pixel art, drawn the way a truecolour terminal shows it.
//
// One picture, authored at 120 x 60 square pixels: a 120 x 30 cell terminal with two pixels to a
// cell (the upper half-block, ▀). Every pixel says what it is (a material), how much screen light
// lands on it (It, 0..1), how much window light (Iw, 0..1), or that it gives off its own light
// (an emissive key). Real characters sit on cells too: the code on the CRT, the stars, the cat's
// zzz, the steam. Nothing here is a colour yet. A pixel resolves to a key, and colours() turns
// every key into a colour for each hour, so one drawing serves the whole night. Every hour is
// painted from the midnight palette; only the sky, the window's light, the moon and the street
// change.
import { palette, mix, lift, chroma, hexOf } from "./color.mjs";
import { bayer } from "../../assets/js/room.js";

export const PW = 120, PH = 60;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const rng = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;

// where things are (pixels)
export const GLASS = { x0: 66, x1: 97, y0: 12, y1: 35 };    // the CRT's screen: 32 cols x 12 rows of text
const CASE = { x0: 62, x1: 101, y0: 9, y1: 39 };
export const WIN = { x0: 4, x1: 43, y0: 5, y1: 36 };        // the window's glass
const DESK = { top: 43, lip: 50 };
export const CAT = { x: 33, y: 35, w: 28, h: 12 };

// The hours. The moon sinks through the night, the street goes to sleep, the haze over the city
// changes colour. sky is five bands from the top of the window down, each an accent mixed into
// the midnight ground; glow is the colour of the window's light on the sill, the frame and the cat.
export const HOURS = {
  midnight: { moon: [31, 12], lit: 0.55, clock: "12:47 am", glow: "flamingo", sky: [["periwinkle", 0.07], ["orchid", 0.13], ["orchid", 0.22], ["flamingo", 0.32], ["flamingo", 0.44]] },
  // the darkest hour: the haze over the city deepens to magenta
  "2am": { moon: [35, 17], lit: 0.28, clock: " 2:13 am", glow: "azalea", sky: [["orchid", 0.06], ["orchid", 0.12], ["azalea", 0.2], ["azalea", 0.29], ["flamingo", 0.37]] },
  // first light: still night overhead, coral and marigold coming up behind the towers
  "4am": { moon: [38, 24], lit: 0.1, clock: " 4:06 am", glow: "coral", sky: [["orchid", 0.1], ["orchid", 0.18], ["flamingo", 0.28], ["coral", 0.38], ["marigold", 0.44]] },
};
export const TIMES = Object.keys(HOURS);

// The moon's path through the night. It crosses the window from left to right, at these columns
// at 22:00, 0:00, 2:00, 4:00 and 6:00 (the middle three are the hours' own places), and its
// height is one curve through the three hours' places: it tops out before midnight, then sinks
// faster and faster until it sets behind the towers at dawn. head.html moves it along this path
// by the reader's clock, a pixel at a time.
export const MOON_X = [28, 31, 35, 38, 41];
export function moonPath() {
  const [p, q, r] = TIMES.map((h) => HOURS[h].moon), x0 = p[0];
  if (MOON_X.slice(1, 4).join() !== [p[0], q[0], r[0]].join()) throw new Error("MOON_X must pass through the hours' moons");
  const u1 = q[0] - x0, u2 = r[0] - x0, a = p[1];
  const c = ((r[1] - a) / u2 - (q[1] - a) / u1) / (u2 - u1), b = (q[1] - a) / u1 - c * u1;
  return { x: MOON_X, x0, y: [a, +b.toFixed(5), +c.toFixed(5)], stars: STARS.map(([col, row]) => [col, row * 2]), clear: STAR_CLEAR };
}
// the stars, as [column, row, glyph, brightness]; one within STAR_CLEAR pixels of the moon hides
export const STARS = [[6, 3, ".", 0.7], [11, 5, "+", 0.6], [21, 3, ".", 0.5], [26, 7, ".", 0.55], [38, 4, "+", 0.75], [41, 9, ".", 0.6], [19, 9, ".", 0.45], [35, 10, ".", 0.4]];
export const STAR_CLEAR = 7;
const SKY_EDGES = [WIN.y0, 14, 21, 26, 30, WIN.y1 + 1];
const skyBand = (y) => SKY_EDGES.findIndex((e, i) => y >= e && y < SKY_EDGES[i + 1]);
// where each band's middle row falls, and a row's place between them: 0 (the top band) to 4
const SKY_MID = SKY_EDGES.slice(0, -1).map((e, i) => (e + SKY_EDGES[i + 1] - 1) / 2);
const skyAt = (y) => {
  if (y <= SKY_MID[0]) return 0;
  for (let i = 0; i < 4; i++) if (y <= SKY_MID[i + 1]) return i + (y - SKY_MID[i]) / (SKY_MID[i + 1] - SKY_MID[i]);
  return 4;
};
/** The sky's colour key at a pixel, in one of four styles:
    "bands"   the five colours, flat, each meeting the next on one row;
    "seams"   the same five, with two rows of ordered dither where one band meets the next;
    "dither"  the same five, as one ordered-dither gradient, flat only at each band's middle;
    "shades"  nine colours (the five and the halfway shade between each pair), as one finer
              ordered-dither gradient. */
function skyKey(x, y, style) {
  const b = skyBand(y);
  if (style === "seams") {
    if (b < 4 && y === SKY_EDGES[b + 1] - 1 && bayer(x, y) < 1 / 3) return "sky" + (b + 1);
    if (b > 0 && y === SKY_EDGES[b] && bayer(x, y) < 1 / 3) return "sky" + (b - 1);
    return "sky" + b;
  }
  if (style === "dither") {
    const t = skyAt(y), lo = Math.floor(t);
    return "sky" + (t - lo > bayer(x, y) ? Math.min(4, lo + 1) : lo);
  }
  if (style === "shades") {
    const t = skyAt(y) * 2, lo = Math.floor(t), k = t - lo > bayer(x, y) ? Math.min(8, lo + 1) : lo;
    return k % 2 ? "sky" + (k - 1) / 2 + "h" : "sky" + k / 2;
  }
  return "sky" + b;
}

// the code on the screen: [role, text] runs per row, in Miami Rice's own syntax colours
const CODE = [
  [["tab", " main.go "], ["dim", "  cat.go"]],
  [["ln", " 1 "], ["kw", "package"], ["id", " main"]],
  [["ln", " 2 "]],
  [["ln", " 3 "], ["kw", "func"], ["fn", " main"], ["pu", "() {"]],
  [["ln", " 4 "], ["kw", "  for"], ["pu", " !"], ["fn", "sleepy"], ["pu", "() {"]],
  [["ln", " 5 "], ["fn", "    write"], ["pu", "("], ["st", "\"posts\""], ["pu", ")"]],
  [["ln", " 6 "], ["fn", "    sip"], ["pu", "("], ["st", "\"coffee\""], ["pu", ")"]],
  [["ln", " 7 "], ["pu", "  }"]],
  [["ln", " 8 "], ["fn", "  pet"], ["pu", "("], ["id", "cat"], ["pu", ")"], ["cm", " // zzz", " // purr"]],
  [["ln", " 9 "], ["pu", "}"], ["cur", " "]],
  [["dim", " ~"]],
  [["mode", " NORMAL "], ["dim", " main.go"], ["clock", "CLOCK"]],
];

// A black cat asleep, head on the right (toward the monitor), tail round the front. k is fur; the
// rim light is worked out from which side faces which light, so only the shape is drawn here.
const CAT_ROWS = [
  "...................k....k...",
  "..................kkk..kkk..",
  ".........kkkkk....kkkkkkkk..",
  "......kkkkkkkkkk.kkkkkkkkkk.",
  "....kkkkkkkkkkkkkkkkkkkkkkk.",
  "...kkkkkkkkkkkkkkkkkkkkkkkk.",
  "..kkkkkkkkkkkkkkkkkkkkkkkkk.",
  ".kkkkkkkkkkkkkkkkkkkkkkkkk..",
  ".kkkkkkkkkkkkkkkkkkkkkkkkkk.",
  "kkkkkkkkkkkkkkkkkkkkkkkkkkk.",
  "kkkkkkkkkkkkkkkkkkkkkkkkkk..",
  ".kkkkkkkkkkkkkkkkkkkkkkkk...",
];
// on top of the fur: e a shut eye, n the nose, i an inner ear, t the tail's lit upper edge
const CAT_MARKS = [
  [19, 5, "e"], [20, 5, "e"], [23, 5, "e"], [24, 5, "e"], [21, 6, "n"], [22, 6, "n"], [19, 1, "i"], [24, 1, "i"],
  [1, 9, "t"], [2, 9, "t"], [3, 10, "t"], [4, 10, "t"], [5, 10, "t"], [6, 10, "t"], [7, 10, "t"], [8, 10, "t"], [9, 10, "t"], [10, 10, "t"], [11, 10, "t"],
  [12, 10, "t"], [13, 10, "t"], [14, 10, "t"], [15, 10, "t"], [16, 10, "t"], [17, 9, "t"], [18, 9, "t"], [19, 9, "t"], [20, 9, "t"],
];
// The tail's tip, lifted against the wall: the twitch the room does after dark, and its flick
// when the cat is petted.
const TAIL_UP = [[0, 8, "cat"], [-1, 7, "catRimP2"], [0, 7, "catRimP2"]];
// Petted (site.js), the cat wakes: its eyes open, two round eyes catching the screen's light,
// and its ears prick up a pixel. Drawn over the sleeping cat, shown only while it is awake.
const AWAKE = [
  [19, 4, "catEyeOpen"], [20, 4, "catEyeOpen"], [19, 5, "catEyeOpen"], [20, 5, "catEyeOpen"],
  [23, 4, "catEyeOpen"], [24, 4, "catEyeOpen"], [23, 5, "catEyeOpen"], [24, 5, "catEyeOpen"],
  [19, -1, "catRimT"], [24, -1, "catRimT"],
];
// and a heart rises from it where the zzz were, a pixel at a time (main.css)
const HEART = [".X.X.", "XXXXX", ".XXX.", "..X.."];

// a pothos in a terracotta pot at the left end of the desk, trailing over the edge
// G a leaf in the window's light, g a leaf in shadow, s stem, R the pot's rim, P the pot
const PLANT = [
  "......Gg....",
  "..Gg.GGgg...",
  ".GGgg.sGg...",
  ".Ggg.s.s.Gg.",
  "..s..s..GGgg",
  ".GG..s.s.Gg.",
  "GGgg.ss..s..",
  ".Ggs..s.GGg.",
  "...s.ss.Ggg.",
  ".GG.sss..s..",
  "GgRRRRRRRR..",
  "Gg.PPPPPP...",
  ".s.PPPPPP...",
  ".s.PPPPPP...",
  "GG..PPPP....",
  "Gg..PPPP....",
  ".s..........",
  ".s..........",
  "GG..........",
  "Gg..........",
  ".s..........",
  ".GG.........",
  ".Gg.........",
  "..s.........",
];

// How many light steps each material is posterised into (screen light; window light is 3).
const LEVELS = { wall: 3 };
const FIXED = new Set(["cat", "catRimT", "catRimT2", "catRimP", "catRimP2", "catEye", "catPink", "leafG", "leafD", "stem"]);

/** Every material at one hour: its dark base and what it becomes in full screen light (teal)
    and in full window light (that hour's glow). */
function materials(P, H) {
  const g = P.ground, turq = P.turquoise, pink = P[H.glow];
  const M = {};
  const mat = (k, base, tealK, pinkK, tealTo = turq, pinkTo = pink) => (M[k] = { base, teal: mix(base, tealTo, tealK), pink: mix(base, pinkTo, pinkK) });
  const fixed = (k, c) => (M[k] = { base: c, teal: c, pink: c });
  mat("wall", g, 0.3, 0.3);
  mat("deskT", mix(mix(g, P.overlay, 0.55), P.marigold, 0.04), 0.62, 0.42);
  mat("deskBack", lift(g, -0.03), 0.3, 0.2);
  mat("lip", mix(g, P.hlMed, 0.55), 0.72, 0.45);
  mat("deskF", lift(chroma(g, 0.9), -0.045), 0.18, 0.15);
  const caseBase = mix(mix(g, P.hlMed, 0.5), P.marigold, 0.05);
  mat("case", caseBase, 0.45, 0.35);
  mat("caseSide", lift(caseBase, -0.045), 0.3, 0.25);
  mat("caseTop", lift(caseBase, 0.035), 0.5, 0.4);
  mat("bezelIn", lift(g, -0.035), 0.62, 0.2);
  // the cat is lit by hand, not by the light maths: the fur stays one solid black, the rim one clean line
  const cat = lift(chroma(g, 0.6), -0.085);
  fixed("cat", cat);
  fixed("catRimT", mix(cat, turq, 0.74));
  fixed("catRimT2", mix(cat, turq, 0.42));
  fixed("catRimP", mix(cat, pink, 0.6));
  fixed("catRimP2", mix(cat, pink, 0.32));
  fixed("catEye", mix(cat, P.soft, 0.3));
  fixed("catPink", mix(g, P.azalea, 0.45));
  fixed("leafG", mix(mix(g, P.palm, 0.8), pink, 0.1));
  fixed("leafD", mix(g, P.palm, 0.44));
  fixed("stem", mix(g, P.palm, 0.36));
  mat("kbd", lift(g, -0.035), 0.32, 0.2);
  mat("key", mix(g, P.hlMed, 0.6), 0.78, 0.4);
  mat("mug", mix(g, P.azalea, 0.42), 0.4, 0.3);
  mat("mugRim", mix(g, P.azalea, 0.58), 0.4, 0.3);
  mat("coffee", lift(mix(g, P.marigold, 0.12), -0.05), 0.15, 0.1);
  mat("pot", mix(g, P.coral, 0.36), 0.35, 0.4);
  mat("potRim", mix(g, P.coral, 0.48), 0.35, 0.4);
  mat("frame", mix(g, P.hlMed, 0.32), 0.3, 0.5);
  mat("sill", mix(g, P.hlMed, 0.4), 0.3, 0.62);
  mat("sillF", mix(g, P.hlMed, 0.18), 0.2, 0.25);
  mat("cable", lift(g, -0.05), 0.2, 0.1);
  return M;
}

/** The room's structure, the same at every hour. With things false it is only the wall,
    the window and the desk: what the window view shows, with nothing in front of the glass.
    frame: the window light on the frame's side posts; at .5 they catch it in alternate pixels.
    city: how the street is lit. windows "marigold" (every one the same warm light) or "mixed"
    (marigold with some flamingo and turquoise); neon, the hotel's flamingo roof line and
    turquoise sign; beacon "red" or "coral". The default is the quiet city of PR #6.
    sky: how the sky's bands meet (see skyKey); nine shades, finely dithered, unless asked. */
export function scene({ things = true, frame = 0.5, city = {}, sky = "shades" } = {}) {
  const { windows = "marigold", neon = false, beacon = "red" } = city;
  const R = rng(1987);
  const grid = (v) => Array.from({ length: PH }, () => Array(PW).fill(v));
  // mat: material name; emit: an emissive key instead; cls: an extra class (for motion)
  const S = { mat: grid("wall"), It: grid(0), Iw: grid(0), emit: grid(null), cls: grid(""), glyphs: [], windows: [], tail: [], awake: [], heart: [] };
  const inside = (x, y) => x >= 0 && y >= 0 && x < PW && y < PH;
  const set = (x, y, m, it = null, iw = null) => {
    if (!inside(x, y)) return;
    S.mat[y][x] = m; S.emit[y][x] = null; S.cls[y][x] = "";
    if (it !== null) S.It[y][x] = it;
    if (iw !== null) S.Iw[y][x] = iw;
  };
  const glow = (x, y, key, cls = "") => { if (inside(x, y)) { S.emit[y][x] = key; S.cls[y][x] = cls; } };
  // a character on a cell: col, row (cells are 1 x 2 pixels), the colour key, extra classes
  const text = (c, r, ch, key, cls = "", bg = null) => S.glyphs.push({ c, r, ch, key, cls, bg });

  // ---- the wall, lit by the screen: a halo round the monitor ----
  const gcx = (GLASS.x0 + GLASS.x1) / 2, gcy = (GLASS.y0 + GLASS.y1) / 2;
  for (let y = 0; y < DESK.top; y++) for (let x = 0; x < PW; x++) {
    const t = clamp((1.62 - Math.hypot((x - gcx) / 18.5, (y - gcy) / 15)) / 0.55);
    S.It[y][x] = 0.62 * t * t * (3 - 2 * t);
  }

  // ---- the window: a single plain pane onto Miami, 1987 ----
  for (let y = WIN.y0 - 1; y <= WIN.y1; y++) { set(WIN.x0 - 1, y, "frame", 0, frame); set(WIN.x1 + 1, y, "frame", null, frame); }
  for (let x = WIN.x0 - 1; x <= WIN.x1 + 1; x++) set(x, WIN.y0 - 1, "frame", null, 0.35);
  // the sky, its bands blended (skyKey); the moon is its own layer (see moonPixels in assets/js/room.js)
  for (let y = WIN.y0; y <= WIN.y1; y++) for (let x = WIN.x0; x <= WIN.x1; x++) glow(x, y, skyKey(x, y, sky));
  // the skyline: art-deco blocks, low, so the horizon glows above them
  const blocks = [[4, 7, 31], [8, 11, 28], [12, 13, 31], [14, 19, 24], [20, 23, 29], [24, 28, 27], [29, 31, 31], [32, 37, 26], [38, 40, 29], [41, 43, 31]];
  const slots = [];
  for (const [x0, x1, top] of blocks) {
    for (let y = top; y <= WIN.y1; y++) for (let x = x0; x <= x1; x++) glow(x, y, "city");
    for (let y = top + 2; y <= WIN.y1 - 1; y += 2) for (let x = x0 + 1; x <= x1 - 1; x += 2) {
      // the same draws either way, so the same windows light whatever their colour
      const u = R(), a = R(), b = R();
      const hue = windows === "mixed" ? (a < 0.72 ? "marigold" : b < 0.6 ? "flamingo" : "turquoise") : "marigold";
      slots.push({ x, y, u, key: "win-" + hue });
    }
  }
  // the deco hotel: its neon, a flamingo line along its roof and a turquoise one down its face,
  // and the beacon on top
  if (neon) {
    for (let x = 14; x <= 19; x++) glow(x, 24, "neonP");
    for (let y = 26; y <= 33; y++) glow(19, y, "neonT");
  }
  glow(16, 22, beacon === "coral" ? "beacon-coral" : "beacon", "beacon");
  glow(16, 23, "city");
  // a palm in front of the city, its crown against the haze. Drawn as shapes and rasterised by
  // coverage (6 x 6 samples a pixel), so the fronds come out as clean tapered arcs with a ragged
  // fringe of leaflets, not as stair-stepped lines.
  const bez = (p0, p1, p2, t) => { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; };
  const caps = [];
  const curve = (p0, p1, p2, r0, r1, n = 24) => { let a = p0; for (let i = 1; i <= n; i++) { const t = i / n, b = bez(p0, p1, p2, t); caps.push([a[0], a[1], b[0], b[1], r0 + (r1 - r0) * t]); a = b; } };
  const CROWN = [14, 17.6];
  curve([9.2, 38], [7.4, 27], CROWN, 1.0, 0.5);
  for (const [ctrl, tip] of [[[7, 11.5], [1.2, 19.5]], [[9.5, 10.6], [4.2, 12.6]], [[12.6, 12.4], [10.4, 10.6]], [[16.2, 11.6], [19.4, 10.8]], [[20, 10.8], [25, 13]], [[22.6, 12.2], [28.4, 19.6]], [[19.4, 16], [22.6, 24.6]], [[10.4, 16.2], [6.6, 24.4]]]) {
    curve(CROWN, ctrl, tip, 0.62, 0.2);
    for (let t = 0.22; t < 0.94; t += 0.11) {
      const [sx, sy] = bez(CROWN, ctrl, tip, t), [nx, ny] = bez(CROWN, ctrl, tip, t + 0.02);
      const dx = nx - sx, dy = ny - sy, len = Math.hypot(dx, dy) || 1;
      const L = 1.9 * Math.sin(Math.PI * Math.min(1, t * 1.05));
      caps.push([sx, sy, sx + 0.35 * dx / len * L, sy + L, 0.2]);
    }
  }
  const dSeg = (px, py, [ax, ay, bx, by]) => { const vx = bx - ax, vy = by - ay, t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)); return Math.hypot(px - ax - vx * t, py - ay - vy * t); };
  for (let y = WIN.y0; y <= WIN.y1; y++) for (let x = WIN.x0; x <= Math.min(WIN.x1, 31); x++) {
    let hit = 0;
    for (let sy = 0; sy < 6; sy++) for (let sx = 0; sx < 6; sx++) {
      const px = x + (sx + 0.5) / 6 - 0.5, py = y + (sy + 0.5) / 6 - 0.5;
      if (caps.some((k) => dSeg(px, py, k) < k[4])) hit++;
    }
    if (hit / 36 > 0.3) glow(x, y, "palm");
  }
  for (const [x, y] of [[13, 18], [15, 18]]) glow(x, y, "palm");
  // the sill
  for (let x = WIN.x0 - 3; x <= WIN.x1 + 3; x++) { set(x, WIN.y1 + 1, "sill", 0, 0.9); set(x, WIN.y1 + 2, "sillF", null, 0.2); }

  // ---- the CRT ----
  const inCase = (x, y) => !((x === CASE.x0 || x === CASE.x1) && (y === CASE.y0 || y === CASE.y1));
  for (let y = CASE.y0; y <= CASE.y1; y++) for (let x = CASE.x0; x <= CASE.x1; x++) if (inCase(x, y)) set(x, y, y === CASE.y0 ? "caseTop" : "case", 0.05, clamp((70 - x) / 40) * 0.5);
  // its deep back, seen from left of centre
  for (let x = CASE.x1 + 1; x <= CASE.x1 + 6; x++) {
    const k = x - CASE.x1;
    for (let y = CASE.y0 + 1 + Math.round(k * 0.7); y <= CASE.y1 - 1 - Math.round(k * 0.7); y++) set(x, y, "caseSide", 0, 0);
  }
  // the recess round the glass, lit by the glass
  for (let y = GLASS.y0 - 1; y <= GLASS.y1 + 1; y++) for (let x = GLASS.x0 - 1; x <= GLASS.x1 + 1; x++) set(x, y, "bezelIn", 0.55, 0);
  // the glass, a little brighter in the middle
  for (let y = GLASS.y0; y <= GLASS.y1; y++) for (let x = GLASS.x0; x <= GLASS.x1; x++) {
    if ((x === GLASS.x0 || x === GLASS.x1) && (y === GLASS.y0 || y === GLASS.y1)) continue;
    glow(x, y, Math.hypot((x - gcx) / 17, (y - gcy) / 13) < 0.7 ? "glass1" : "glass0");
  }
  glow(97, 37, "led");
  for (const x of [66, 67, 68]) set(x, 37, "caseTop", 0.05, 0);
  // the stand
  for (let y = 40; y <= 41; y++) for (let x = 77; x <= 86; x++) set(x, y, "caseSide", 0.2, 0);
  for (let y = 42; y <= 44; y++) for (let x = 73; x <= 90; x++) set(x, y, y === 42 ? "caseTop" : "case", 0.12, 0);

  // ---- the desk, and the pool of screen light on it ----
  for (let y = DESK.top; y < PH; y++) for (let x = 0; x < PW; x++) {
    if (y >= 42 && y <= 44 && x >= 73 && x <= 90) continue;
    const z = (y - DESK.top) / (DESK.lip - DESK.top);
    if (y < DESK.lip) {
      const pool = Math.exp(-(((x - gcx) / (21 + 18 * z)) ** 2)) * (1 - 0.3 * z);
      // the window's light lands on the desk near the wall, sheared by the angle
      const wx0 = WIN.x0 + 2 + z * 5, wx1 = WIN.x1 - 4 + z * 5;
      const inPatch = y <= DESK.top + 4 && x >= wx0 && x <= wx1;
      const iw = inPatch ? (Math.min(x - wx0, wx1 - x) < 2 ? 0.25 : 0.5) * (1 - (y - DESK.top) * 0.12) : 0;
      set(x, y, y === DESK.top ? "deskBack" : "deskT", pool, iw);
    } else if (y === DESK.lip) {
      set(x, y, "lip", Math.exp(-(((x - gcx) / 36) ** 2)) * 0.85, x > 8 && x < 44 ? 0.25 : 0);
    } else {
      set(x, y, "deskF", Math.exp(-(((x - gcx) / 30) ** 2)) * 0.35 * Math.max(0, 1 - (y - DESK.lip) / 6), 0);
    }
  }
  // the keyboard: keys two pixels wide with a one-pixel gap, rows split by a dark seam, a long space bar
  for (let y = 45; y <= 49; y++) for (let x = 64; x <= 99; x++) {
    const it = Math.exp(-(((x - gcx) / 26) ** 2)) * (1 - 0.25 * ((y - 45) / 4));
    if (y === 49) { set(x, y, "kbd", it * 0.5, 0); continue; }
    const isKey = x > 64 && x < 99 && (y === 45 ? (x - 65) % 3 !== 2 : y === 47 ? (x - 66) % 3 !== 2 : y === 48 ? x >= 74 && x <= 89 : false);
    set(x, y, isKey ? "key" : "kbd", it, 0);
  }
  // a cable from the back of the CRT, slack across the desk
  for (const [x, y] of [[104, 38], [104, 39], [105, 40], [105, 41], [104, 42], [103, 43], [102, 44]]) set(x, y, "cable", 0.1, 0);

  // ---- the mug, steaming ----
  const mug = { x: 106, y: 40 };
  for (let y = 0; y <= 6; y++) for (let x = 0; x <= 5; x++) {
    const X = mug.x + x, Y = mug.y + y, it = 0.18 + 0.32 * clamp(1 - x / 5);
    if (y === 0) set(X, Y, "mugRim", it, 0);
    else if (y === 1 && x > 0 && x < 5) set(X, Y, "coffee", 0.05, 0);
    else if (y === 6 && (x === 0 || x === 5)) continue;
    else set(X, Y, "mug", it, 0);
  }
  for (const [x, y] of [[6, 2], [7, 2], [7, 3], [7, 4], [6, 4]]) set(mug.x + x, mug.y + y, "mug", 0.08, 0);
  // the steam in two frames that take turns (the second only shows while the room moves)
  for (const [c, r, ch, k] of [[107, 19, ")", 0], [109, 19, "(", 1], [108, 18, "(", 1], [107, 17, ")", 2]]) text(c, r, ch, "steam" + k, "steam s1");
  for (const [c, r, ch, k] of [[108, 19, "(", 0], [107, 18, ")", 1], [109, 18, ")", 1], [108, 17, "(", 2]]) text(c, r, ch, "steam" + k, "steam s2");

  // ---- the plant, the cat and the zzz (not in the window view) ----
  if (things) {
    const PM = { G: ["leafG", 0, 0], g: ["leafD", 0, 0], s: ["stem", 0, 0], R: ["potRim", 0.08, 0.45] };
    PLANT.forEach((row, j) => [...row].forEach((ch, i) => {
      if (PM[ch]) set(1 + i, 31 + j, ...PM[ch]);
      if (ch === "P") set(1 + i, 31 + j, "pot", 0.06, i < 5 ? 0.2 : 0.05);
    }));

    // ---- the cat, asleep in the screen's light ----
    // light from the glass (up and to the right) and from the window (up and to the left)
    const filled = (i, j) => CAT_ROWS[j]?.[i] === "k";
    CAT_ROWS.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch !== "k") return;
      const openR = !filled(i + 1, j), openU = !filled(i, j - 1), openL = !filled(i - 1, j);
      let m = "cat";
      if (openL && i < 8) m = "catRimP2";
      if (openU) m = i >= 18 ? "catRimT" : i >= 10 ? "catRimT2" : "catRimP";
      if (openR) m = i >= 18 ? "catRimT" : "catRimT2";
      set(CAT.x + i, CAT.y + j, m, 0, 0);
    }));
    for (const [i, j, k] of CAT_MARKS) {
      const m = { e: "catEye", n: "catPink", i: "catPink", t: i < 7 ? "catRimP2" : "catRimT2" }[k];
      set(CAT.x + i, CAT.y + j, m, 0, 0);
    }
    // the tail's lifted tip, drawn as its own frame
    for (const [i, j, m] of TAIL_UP) S.tail.push({ x: CAT.x + i, y: CAT.y + j, key: m });
    // awake: open eyes and pricked ears, then the heart, each its own frame
    for (const [i, j, m] of AWAKE) S.awake.push({ x: CAT.x + i, y: CAT.y + j, key: m });
    HEART.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "X") S.heart.push({ x: CAT.x + 20 + i, y: 29 + j, key: "heart" }); }));
    // zzz, drifting up from the cat toward the light, one at a time while the room moves
    text(CAT.x + 21, 16, "z", "z0", "z z1"); text(CAT.x + 23, 15, "z", "z1", "z z2"); text(CAT.x + 25, 14, "Z", "z2", "z z3");
  }

  // ---- the street's windows, lit by the hour; site.js turns them on and off ----
  // each hour lights its share exactly: the windows are ranked once, and an hour lights the first
  // `lit` of them, so the later hours keep a subset of the earlier ones' lights
  const open = slots.filter((s) => S.emit[s.y][s.x] === "city");        // not behind the palm or the plant
  [...open].sort((a, b) => a.u - b.u).forEach((s, i, all) => { s.rank = i / all.length; });
  for (const s of open) {
    s.hide = TIMES.filter((f) => s.rank >= HOURS[f].lit);
    S.windows.push(s);
  }

  // ---- stars, as characters; each is st<n> by its place in STARS, so the page can hide the
  // ones the moon passes (scenes.mjs, head.html) ----
  STARS.forEach(([c, r, ch, k], n) => {
    // only where the window is dark: the upper sky, or a dark shape against it
    const y = r * 2, dark = (k, yy) => /^(palm|city)$/.test(k ?? "") || (/^sky/.test(k ?? "") && skyBand(yy) <= 2);
    if (!dark(S.emit[y][c], y) || !dark(S.emit[y + 1][c], y + 1)) return;
    text(c, r, ch, "star" + Math.round(k * 100), `star st${n}`);
  });

  // ---- the screen's text; the clock is the hour's own ----
  CODE.forEach((runs, j) => {
    let col = GLASS.x0;
    for (const [role, s, alt] of runs) {
      const r = GLASS.y0 / 2 + j;
      const bg = { tab: "tabBg", mode: "modeBg", cur: "curBg" }[role] ?? null;
      if (s === "CLOCK") {
        for (const f of TIMES) {
          const t = HOURS[f].clock.padStart(GLASS.x1 - col);
          const cls = ["screen", ...TIMES.filter((o) => o !== f).map((o) => "h-" + o)].join(" ");
          [...t].forEach((ch, i) => { if (ch !== " ") text(col + i, r, ch, "sx-clock", cls); });
        }
        continue;
      }
      [...s].forEach((ch, i) => text(col + i, r, ch, "sx-" + role, role === "cur" ? "screen cur" : alt ? "screen asleep" : "screen", bg));
      if (alt) [...alt].forEach((ch, i) => text(col + i, r, ch, "sx-" + role, "screen awake", bg));
      col += Math.max(s.length, alt?.length ?? 0);
    }
  });
  return S;
}

// ---- keys: what each pixel is, the same at every hour ----

/** The key of one pixel: its emissive key, or its material and posterised light. Light is cut
    into a few flat steps that dither only at their seams, the way pixel artists shade. */
export function pixelKey(S, x, y) {
  if (S.emit[y][x]) return S.emit[y][x];
  const m = S.mat[y][x];
  if (FIXED.has(m)) return m;
  const q = (v, n) => {
    const f = clamp(v) * n, lo = Math.floor(f), t = clamp((f - lo - 0.5) / 0.34 + 0.5);
    return Math.min(n, lo + (t > bayer(x, y) ? 1 : 0));
  };
  return `${m}.${q(S.It[y][x], LEVELS[m] ?? 5)}.${q(S.Iw[y][x], 3)}`;
}

/** The room as it sits on the home page. The drawing moves dx pixels right inside its frame, so
    its weight (the window and the moon on the left, the screen on the right) balances on the
    page's centre line, and the columns it uncovers repeat its left edge. Then the desk's two
    ends dither into the dark over `fade` pixels, so the room has no hard sides; only the desk
    fades, never what stands on it. Keys are fixed before the move, so no dither pattern in the
    drawing changes. render() moves the moon and the falling star by S.dx too. */
export function framed(S, { dx = 0, fade = 0 } = {}) {
  const K = Array.from({ length: PH }, (_, y) => Array.from({ length: PW }, (_, x) => pixelKey(S, x, y)));
  const move = (row) => [...Array(dx).fill(row[0]), ...row.slice(0, PW - dx)];
  const emit = K.map(move), cls = S.cls.map(move);
  const desk = /^(deskT|deskBack|lip|deskF)\./;
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const d = Math.min(x, PW - 1 - x);
    if (d < fade && desk.test(emit[y][x]) && bayer(x, y) > (d + 0.5) / fade) { emit[y][x] = "wall.0.0"; cls[y][x] = ""; }
  }
  const at = (o) => ({ ...o, x: o.x + dx });
  return { ...S, emit, cls, dx, glyphs: S.glyphs.map((g) => ({ ...g, c: g.c + dx })), windows: S.windows.map(at), tail: S.tail.map(at), awake: S.awake.map(at), heart: S.heart.map(at) };
}

/** Every key's colour at one hour, as hex: the midnight palette under that hour's sky. */
export function colours(hour, keys, hours = HOURS) {
  const P = palette("midnight"), H = hours[hour], M = materials(P, H), g = P.ground;
  const city = lift(chroma(g, 0.8), -0.04);
  const sky = (b) => mix(g, P[H.sky[b][0]], H.sky[b][1]);
  const E = {
    city, palm: lift(chroma(g, 0.7), -0.07),
    // the beacon is an aircraft light, so a true red: coral, the palette's red, reads salmon as
    // one pixel, so this is coral taken deeper and redder, oklch(0.64 0.2 27)
    beacon: [0.64, 0.2 * Math.cos((27 * Math.PI) / 180), 0.2 * Math.sin((27 * Math.PI) / 180)],
    glass0: mix(g, P.turquoise, 0.105), glass1: mix(g, P.turquoise, 0.13), led: mix(g, P.palm, 0.95),
    "win-marigold": mix(city, P.marigold, 0.62), "win-flamingo": mix(city, P.flamingo, 0.62), "win-turquoise": mix(city, P.turquoise, 0.62),
    // the cat awake: eyes the screen's light catches; the heart it gives off; and the rain on
    // the glass, some nights (head.html)
    catEyeOpen: mix(P.palm, P.marigold, 0.55), heart: P.flamingo,
    rain: mix(sky(1), P.periwinkle, 0.42),
    neonP: mix(g, P.flamingo, 0.9), neonT: mix(g, P.turquoise, 0.8), "beacon-coral": mix(g, P.coral, 0.95),
    tabBg: mix(g, P.turquoise, 0.78), modeBg: P.flamingo, curBg: P.turquoise,
    steam0: mix(g, P.soft, 0.7), steam1: mix(g, P.soft, 0.52), steam2: mix(g, P.soft, 0.36),
    fall0: P.text, fall1: mix(sky(1), P.periwinkle, 0.62), fall2: mix(sky(1), P.periwinkle, 0.3),
    z0: mix(g, P.soft, 0.55), z1: mix(g, P.soft, 0.7), z2: mix(g, P.soft, 0.85),
    "sx-tab": g, "sx-dim": P.subtle, "sx-ln": mix(g, P.subtle, 0.62), "sx-kw": P.azalea, "sx-fn": P.turquoise, "sx-pu": P.subtle,
    "sx-id": P.text, "sx-st": P.palm, "sx-cm": P.subtle, "sx-mode": g, "sx-clock": P.subtle, "sx-cur": g,
    // the moon: its face, craters, the soft edge of its shadow, and its unlit disc against that hour's sky
    "moon-lit": P.text, "moon-crater": mix(P.text, P.periwinkle, 0.32), "moon-edge": mix(P.text, P.periwinkle, 0.18),
    "moon-dark": mix(sky(skyBand(H.moon[1])), P.periwinkle, 0.1), "moon-halo": P.periwinkle,
  };
  for (let b = 0; b < 5; b++) E["sky" + b] = sky(b);
  for (let b = 0; b < 4; b++) E["sky" + b + "h"] = mix(sky(b), sky(b + 1), 0.5);
  const out = {};
  for (const k of keys) {
    let c = E[k];
    if (!c && k.startsWith("star")) c = mix(g, P.text, +k.slice(4) / 100);
    if (!c) {
      const [m, lt, lw] = k.split(".");
      const mm = M[m];
      if (!mm) throw new Error(`no colour for key ${k}`);
      c = lt === undefined ? mm.base : mix(mix(mm.base, mm.teal, +lt / (LEVELS[m] ?? 5)), mm.pink, +lw / 3);
    }
    out[k] = hexOf(c);
  }
  return out;
}
