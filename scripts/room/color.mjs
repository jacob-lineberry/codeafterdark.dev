// OKLab helpers and the Miami Rice palette, read from the blog's single source of truth.
import { readFileSync } from "node:fs";

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function linOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLin(v / 255));
}
export function labOfLin([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function linOfLab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export const lab = (hex) => labOfLin(linOf(hex));
export function hexOf(L) {
  const lin = linOfLab(L);
  return "#" + lin.map((v) => Math.round(Math.max(0, Math.min(1, toSrgb(Math.max(0, v)))) * 255).toString(16).padStart(2, "0")).join("");
}
export const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
export const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
// lightness/chroma nudges in OKLab
export const lift = (p, dL) => [p[0] + dL, p[1], p[2]];
export const chroma = (p, k) => [p[0], p[1] * k, p[2] * k];
// average of two colours as light adds (linear RGB), back in OKLab
export const mixLin = (p, q, t) => labOfLin(linOfLab(p).map((v, i) => v + (linOfLab(q)[i] - v) * t));

const THEME = JSON.parse(readFileSync(new URL("../../theme/miami-rice.json", import.meta.url)));

/** The palette for one flavour: every accent and neutral as OKLab, plus the flavour's ground family. */
export function palette(flavour) {
  const f = THEME.flavours[flavour];
  const P = {};
  for (const [k, v] of Object.entries(THEME.accents)) P[k] = lab(v);
  for (const [k, v] of Object.entries(THEME.neutrals)) P[k] = lab(v);
  for (const k of ["ground", "surface", "overlay", "hlLow", "hlMed", "hlHigh", "muted"]) P[k] = lab(f[k]);
  P.glow = P[f.glow];
  P.flavour = flavour;
  return P;
}

