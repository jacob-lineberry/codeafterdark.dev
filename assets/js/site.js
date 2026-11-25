// code after dark: progressive enhancements. The site works without this file.
import { moonLit, moonName, moonPath, moonPhase, moonSVG } from "./room.js";

// One polite live region, so a screen reader hears what a button did.
let live;
function announce(text) {
  if (!live) {
    live = Object.assign(document.createElement("p"), { className: "vh" });
    live.setAttribute("aria-live", "polite");
    document.body.append(live);
  }
  live.textContent = "";
  setTimeout(() => { live.textContent = text; }, 50);
}

// Copy buttons. A terminal copies only its commands (no prompts, no output); source code
// and output-only blocks copy everything a reader would select.
function initCopy() {
  document.querySelectorAll("figure.code, figure.term").forEach((fig) => {
    const btn = fig.querySelector(".copy");
    const code = fig.querySelector("pre code") || fig.querySelector("pre");
    if (!btn || !code || !navigator.clipboard) return;
    btn.hidden = false;
    btn.setAttribute("aria-label", fig.matches(".term") && code.querySelector(".cmd") ? "Copy the commands" : "Copy code to clipboard");
    let timer;
    btn.addEventListener("click", async () => {
      let text;
      const cmds = fig.matches(".term") ? [...code.querySelectorAll(".cmd")] : [];
      if (cmds.length) {
        text = cmds.map((c) => c.textContent).join("\n");
      } else {
        // Line numbers are user-select:none; copy the same text a reader would select.
        const clone = code.cloneNode(true);
        clone.querySelectorAll(".lnt, .ln").forEach((n) => n.remove());
        text = clone.textContent.replace(/\n$/, "");
      }
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "copied";
        btn.dataset.state = "done";
        announce(cmds.length ? "Commands copied" : "Code copied");
      } catch {
        btn.textContent = "copy failed";
        btn.dataset.state = "error";
        announce("Copy failed. Select the code and copy it by hand.");
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.textContent = "copy";
        delete btn.dataset.state;
      }, 2000);
    });
  });
}

// "/" focuses the search box, or goes to the search page when there isn't one here.
function initKeys() {
  const search = document.querySelector('.top a[aria-keyshortcuts="/"]');
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
    const q = document.getElementById("q");
    if (!q && !search) return;
    e.preventDefault();
    if (q) q.focus();
    else location.href = search.href;
  });
}

// Wide code, tables and diagrams: mark which edge hides more content so CSS can fade it.
function initOverflow() {
  const els = document.querySelectorAll(".prose pre, .table-wrap, .fig-wrap, .prose .mermaid");
  if (!els.length) return;
  const update = (el) => {
    const max = el.scrollWidth - el.clientWidth;
    // diagrams that scroll on narrow screens need to be reachable from the keyboard
    if (el.matches(".fig-wrap, .mermaid")) {
      if (max > 1) { el.tabIndex = 0; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Diagram"); }
      else { el.removeAttribute("tabindex"); el.removeAttribute("role"); el.removeAttribute("aria-label"); }
    }
    if (max <= 1) { el.removeAttribute("data-clip"); return; }
    const sides = [];
    if (el.scrollLeft > 1) sides.push("start");
    if (el.scrollLeft < max - 1) sides.push("end");
    el.setAttribute("data-clip", sides.join(" "));
  };
  const ro = "ResizeObserver" in window ? new ResizeObserver((entries) => entries.forEach((e) => update(e.target))) : null;
  els.forEach((el) => {
    update(el);
    el.addEventListener("scroll", () => update(el), { passive: true });
    if (ro) ro.observe(el);
  });
}

// The night's small life: windows across the street light up and go dark, the beacon on the
// hotel roof blinks, the caret blinks on the monitor, the steam drifts, the cat's zzz rise and,
// now and then, rain falls on the glass.
// Without JavaScript, or with reduced motion asked for, the room is still.
function initNight() {
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = reduced.matches;

  // the room was drawn with the moon of the day the site was built; show tonight's
  const now = moonPhase(Date.now());
  document.querySelectorAll(".scene .moon[data-tonight]").forEach((g) => { g.innerHTML = moonSVG(now); });

  const rooms = [...document.querySelectorAll("svg.scene")].map((svg) => ({ svg, windows: [...svg.querySelectorAll(".w")] }));
  // a window's lit state comes from the hour (scene.css); a flip overrides it
  const isLit = (w) => getComputedStyle(w).display !== "none";
  const flip = (w) => { w.style.display = isLit(w) ? "none" : "inline"; };

  let away = null; // the room after dark, while it runs (see below)
  const set = (p) => {
    paused = p;
    root.classList.toggle("motion", !p);
    if (p) rest();
  };
  set(paused);
  // asking for less motion mid-visit stills the room, and moves it again when that's undone
  reduced.addEventListener("change", (e) => set(e.matches));

  // a window across the street, every few seconds, never on a beat; only rooms on screen
  const seen = new Set();
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target))));
    rooms.forEach((r) => io.observe(r.svg));
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const tick = () => {
    if (!paused && !document.hidden) {
      rooms.filter((r) => seen.has(r.svg) && r.windows.length && r !== away?.r).forEach((r) => flip(pick(r.windows)));
    }
    setTimeout(tick, 2600 + Math.random() * 3400);
  };
  if (rooms.length) setTimeout(tick, 2000);

  // After dark: when the home room has been left alone for a while, it comes alive a little
  // more. More windows light across the street, the cat's tail twitches, and now and then a
  // star falls behind the palm. It is only in the picture, never over text, and any input ends
  // it. It never starts with reduced motion, or on a post.
  const AWAY_MS = 90000;
  let last = Date.now();
  function rest() {
    if (!away) return;
    clearInterval(away.timer);
    away.lit.forEach(flip);
    away.star?.classList.remove("go");
    root.classList.remove("away");
    away = null;
  }
  ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach((type) =>
    window.addEventListener(type, () => { last = Date.now(); rest(); }, { passive: true, capture: true }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) rest(); });
  const home = rooms.find((r) => r.svg.dataset.room === "home");

  // Pet the cat: it wakes, a heart rises, its tail flicks and the screen purrs, then it goes back
  // to sleep (main.css). Petted again mid-purr, it starts over.
  const cat = document.querySelector(".pet");
  if (home && cat) {
    let nap = 0;
    cat.hidden = false;
    cat.addEventListener("click", () => {
      home.svg.classList.remove("petting");
      void home.svg.getBoundingClientRect();
      home.svg.classList.add("petting");
      clearTimeout(nap);
      nap = setTimeout(() => home.svg.classList.remove("petting"), 2400);
    });
  }

  // Rain comes and goes: a shower of half a minute to a minute and a quarter, then clear for
  // three quarters of a minute to two minutes. Its clock only runs while the room is in view
  // and moving, so a reader looking at it has a fair chance of seeing one arrive.
  // ?weather=rain or ?weather=clear holds the weather for the visit (head.html).
  if (home?.svg.querySelector(".rain") && !["rain", "clear"].includes(new URLSearchParams(location.search).get("weather"))) {
    const spell = (wet) => 1000 * (wet ? 30 + Math.random() * 45 : 45 + Math.random() * 75);
    let left = spell(root.dataset.weather === "rain");
    setInterval(() => {
      if (paused || document.hidden || !seen.has(home.svg) || (left -= 1000) > 0) return;
      const wet = root.dataset.weather !== "rain";
      if (wet) root.dataset.weather = "rain";
      else delete root.dataset.weather;
      left = spell(wet);
    }, 1000);
  }

  const star = home?.svg.querySelector(".falling");
  star?.addEventListener("animationend", () => star.classList.remove("go"));
  if (home)
    setInterval(() => {
      if (away || paused || document.hidden || reduced.matches || Date.now() - last < AWAY_MS || !seen.has(home.svg)) return;
      let n = 0;
      away = { r: home, lit: [], star, timer: 0 };
      root.classList.add("away");
      // twice a second: a window every second and a half, until about two in three are lit;
      // a star every fifteen seconds
      away.timer = setInterval(() => {
        n++;
        if (n % 3 === 0) {
          const dark = home.windows.filter((w) => !isLit(w));
          if (dark.length > home.windows.length * 0.35) {
            const w = pick(dark);
            flip(w);
            away.lit.push(w);
          }
        }
        if (star && n % 30 === 8) star.classList.add("go");
      }, 500);
    }, 5000);

  // the moon tonight, in the footer
  document.querySelectorAll(".tonight").forEach((el) => {
    el.querySelector(".moon-lit").setAttribute("d", moonPath(now));
    el.querySelector("span").textContent = `the moon tonight: ${moonName(now)}, ${Math.round(moonLit(now) * 100)}% lit`;
    el.closest(".site-foot").hidden = false;
  });
}

// Contents: the section you're reading is lit. On narrow screens the list folds.
function initContents() {
  const toc = document.querySelector(".toc");
  if (!toc) return;
  const details = toc.querySelector("details");
  const wide = window.matchMedia("(min-width: 1121px)");
  // wide, the list is always open, so its heading is no button: out of the tab order
  const fold = () => {
    details.open = wide.matches;
    details.querySelector("summary").tabIndex = wide.matches ? -1 : 0;
  };
  fold();
  wide.addEventListener("change", fold);
  details.querySelector("summary").addEventListener("click", (e) => { if (wide.matches) e.preventDefault(); });

  const links = new Map([...toc.querySelectorAll('a[href^="#"]')].map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.removeAttribute("aria-current"));
      links.get(e.target.id)?.setAttribute("aria-current", "location");
    });
  }, { rootMargin: "0px 0px -70% 0px" });
  links.forEach((_, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
}

initCopy();
initKeys();
initNight();
initContents();
initOverflow();
