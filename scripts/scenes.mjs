// Writes data/scenes.json: the room's first frames as HTML, so every page shows the room
// before (or without) JavaScript. Run after editing assets/js/room.js:
//   node scripts/scenes.mjs
//
//   home, phone  the room above the post list, wide and narrow. site.js redraws it with
//                tonight's moon; without JavaScript it shows a waxing gibbous.
//   view         30 frames of the view from the window, one per day of the moon's month.
//                A post shows the frame for the night it was written (see _partials/night.html).
import { writeFileSync } from "node:fs";
import { draw, html } from "../assets/js/room.js";

export const VIEWS = 30;
const scenes = {
  home: html(draw("home", { phase: 0.4 })),
  phone: html(draw("phone", { phase: 0.4 })),
  view: Array.from({ length: VIEWS }, (_, i) => html(draw("view", { phase: i / VIEWS }))),
};
writeFileSync(new URL("../data/scenes.json", import.meta.url), `${JSON.stringify(scenes)}\n`);
console.log(`wrote data/scenes.json (home, phone, ${VIEWS} views)`);
