// The room as SVG, the way a modern terminal draws a half-block picture: the blocks are geometry
// (pixel-exact, no font needed, no seams between rows) and everything else is Recursive Mono on
// an 8 x 16 cell. Fills are classes, not colours: assets/css/scene.css colours each class for each
// flavour, so one drawing serves the whole night and needs no JavaScript.
//
// Layers, back to front: the sky; the moon (inserted by the template or by site.js, between
// `head` and `tail`); a falling star (home only); the room; the street's windows; the characters.
import { PW, PH, pixelKey } from "./scene.mjs";

const U = 8, FS = 13.333, BASE = 12.67;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One short class per colour key, shared by every drawing on the site. */
export function registry() {
  const map = new Map();
  return {
    map,
    cls(key) {
      if (key.startsWith("moon-")) return "mn-" + key.slice(5);
      if (!map.has(key)) map.set(key, "k" + map.size.toString(36));
      return map.get(key);
    },
  };
}

// pixels -> one path of rectangles: runs along each row, merged down where a run repeats
function rects(px) {
  const rows = new Map();
  for (const [x, y] of px) (rows.get(y) || rows.set(y, []).get(y)).push(x);
  const runs = [];
  for (const [y, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length; ) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      runs.push({ y, x0: xs[i], x1: xs[j] });
      i = j + 1;
    }
  }
  const open = new Map(), done = [];
  for (const r of runs) {
    const k = `${r.x0},${r.x1}`, o = open.get(k);
    if (o && o.y1 === r.y - 1) o.y1 = r.y;
    else { if (o) done.push(o); open.set(k, { ...r, y1: r.y }); }
  }
  done.push(...open.values());
  return done.map((r) => `M${r.x0 * U} ${r.y * U}h${(r.x1 - r.x0 + 1) * U}v${(r.y1 - r.y + 1) * U}h-${(r.x1 - r.x0 + 1) * U}z`).join("");
}

/** The drawing of `S` inside `crop` (pixels; y0 even and y1 odd, so the crop falls on cell rows).
    Returns { head, tail }: the moon's <g> goes between them (inside a move by S.dx, if any). */
export function render(S, reg, { room, crop = { x0: 0, x1: PW - 1, y0: 0, y1: PH - 1 }, bloom = false, falling = false }) {
  const dx = S.dx ?? 0;   // how far framed() moved the drawing: the moon and the falling star follow it
  const inCrop = (x, y) => x >= crop.x0 && x <= crop.x1 && y >= crop.y0 && y <= crop.y1;
  const K = Array.from({ length: PH }, (_, y) => Array.from({ length: PW }, (_, x) => pixelKey(S, x, y)));
  const C = S.cls.map((r) => r.slice());
  // a cell with a character has one background: its upper pixel's, or the character's own
  for (const g of S.glyphs) {
    const y = g.r * 2, k = g.bg ?? K[y][g.c];
    K[y][g.c] = K[y + 1][g.c] = k;
    if (g.cls.split(" ").includes("cur")) C[y][g.c] = C[y + 1][g.c] = "cur";
  }
  const back = new Map(), front = new Map();
  for (let y = crop.y0; y <= crop.y1; y++) for (let x = crop.x0; x <= crop.x1; x++) {
    const k = K[y][x], layer = k.startsWith("sky") ? back : front, id = `${k}|${C[y][x]}`;
    (layer.get(id) || layer.set(id, []).get(id)).push([x, y]);
  }
  const paths = (layer) => [...layer].map(([id, px]) => {
    const [k, extra] = id.split("|");
    return `<path class="${[reg.cls(k), extra].filter(Boolean).join(" ")}" d="${rects(px)}"/>`;
  }).join("");

  // the street's windows, one element each so site.js can switch them
  const wins = S.windows.filter((w) => inCrop(w.x, w.y)).map((w) =>
    `<rect class="${[reg.cls(w.key), "w", ...w.hide.map((f) => "h-" + f)].join(" ")}" x="${w.x * U}" y="${w.y * U}" width="${U}" height="${U}"/>`).join("");
  // the tail's lifted tip (home only; shown during the twitch)
  const byKey = new Map();
  if (falling) for (const t of S.tail) (byKey.get(t.key) || byKey.set(t.key, []).get(t.key)).push([t.x, t.y]);
  const tail = [...byKey].map(([k, px]) => `<path class="${reg.cls(k)} tail-up" d="${rects(px)}"/>`).join("");
  // a falling star: three pixels on a slant, sliding down the sky in pixel steps (see main.css)
  const star = falling
    ? `<g transform="translate(${(8 + dx) * U} ${6 * U})"><g class="falling"><path class="${reg.cls("fall0")}" d="${rects([[0, 0]])}"/><path class="${reg.cls("fall1")}" d="${rects([[-1, 0], [-2, -1]])}"/><path class="${reg.cls("fall2")}" d="${rects([[-3, -1], [-4, -2]])}"/></g></g>`
    : "";

  // characters: one <text> per row, colour and class, every glyph placed on its own cell
  const groups = new Map();
  for (const g of S.glyphs) {
    if (g.ch === " " || !inCrop(g.c, g.r * 2)) continue;
    const id = `${g.r}|${g.key}|${g.cls}`;
    (groups.get(id) || groups.set(id, []).get(id)).push(g);
  }
  const plain = [], screen = [];
  for (const [id, gs] of groups) {
    const [r, key, cls] = id.split("|");
    const extra = cls.split(" ").filter((c) => c && c !== "screen");
    const t = `<text class="${[reg.cls(key), ...extra].join(" ")}" y="${(+r * 16 + BASE).toFixed(2)}" x="${gs.map((g) => g.c * U).join(" ")}">${esc(gs.map((g) => g.ch).join(""))}</text>`;
    (cls.split(" ").includes("screen") ? screen : plain).push(t);
  }

  const vb = [crop.x0 * U, crop.y0 * U, (crop.x1 - crop.x0 + 1) * U, (crop.y1 - crop.y0 + 1) * U];
  const fid = `${room}-bloom`;
  const defs = bloom && screen.length
    ? `<defs><filter id="${fid}" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="1.4" result="b"/><feComponentTransfer in="b" result="s"><feFuncA type="linear" slope="0.85"/></feComponentTransfer><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
    : "";
  const head = `<svg class="scene" data-room="${room}" viewBox="${vb.join(" ")}" aria-hidden="true" focusable="false">${defs}<g shape-rendering="crispEdges">${paths(back)}${dx ? `<g transform="translate(${dx * U} 0)">` : ""}`;
  const tailOut = `${dx ? "</g>" : ""}${star}${paths(front)}${wins}${tail}</g>` +
    (plain.length || screen.length
      ? `<g class="chars" font-family="'Recursive Mono', ui-monospace, monospace" font-size="${FS}">${plain.join("")}` +
        (screen.length ? `<g${bloom ? ` filter="url(#${fid})"` : ""}>${screen.join("")}</g>` : "") + `</g>`
      : "") +
    `</svg>`;
  return { head, tail: tailOut };
}
