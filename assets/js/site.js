// code after dark: progressive enhancements. The site works without this file.
import { draw, html, moonLit, moonName, moonPath, moonPhase, windowsOf } from "./room.js";

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
      } catch {
        btn.textContent = "copy failed";
        btn.dataset.state = "error";
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

// The night's small life: windows across the street light up and go dark, the antenna
// blinks, a long track name scrolls. One pause control stops all of it, and is remembered.
// Without JavaScript, or with reduced motion asked for, the room starts still.
function initNight() {
  const root = document.documentElement;
  let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    const saved = localStorage.getItem("cad-paused");
    if (saved !== null) paused = saved === "1";
  } catch {}

  const now = moonPhase(Date.now());
  const rooms = [...document.querySelectorAll("pre[data-room]")].map((pre) => ({
    pre,
    name: pre.dataset.room,
    phase: pre.dataset.phase ? Number(pre.dataset.phase) : now,
    flip: new Set(),
  }));
  const paint = (r) => { r.pre.innerHTML = html(draw(r.name, { phase: r.phase, flip: r.flip })); };
  // the home room shows tonight's moon, not the one it was built with
  rooms.filter((r) => !r.pre.dataset.phase).forEach(paint);

  // a long track name scrolls, carrying a second copy so the loop is seamless
  document.querySelectorAll(".np-track").forEach((box) => {
    const span = box.firstElementChild;
    if (!span || span.scrollWidth <= box.clientWidth) return;
    const text = span.textContent;
    const copy = (hidden) => Object.assign(document.createElement("span"), { textContent: text, ...(hidden && { ariaHidden: "true" }) });
    span.replaceChildren(copy(false), copy(true));
    box.classList.add("scroll");
  });

  const buttons = [...document.querySelectorAll(".pause")];
  const set = (p) => {
    paused = p;
    root.classList.toggle("motion", !p);
    buttons.forEach((b) => {
      b.dataset.state = p ? "paused" : "playing";
      b.querySelector("span").textContent = p ? "play" : "pause";
    });
  };
  buttons.forEach((b) => {
    b.hidden = false;
    b.addEventListener("click", () => {
      set(!paused);
      try { localStorage.setItem("cad-paused", paused ? "1" : "0"); } catch {}
    });
  });
  set(paused);

  // a window across the street, every few seconds, never on a beat; only rooms on screen
  const seen = new Set();
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target))));
    rooms.forEach((r) => io.observe(r.pre));
  }
  const tick = () => {
    if (!paused && !document.hidden) {
      rooms.filter((r) => seen.has(r.pre) && r.pre.offsetParent).forEach((r) => {
        const n = windowsOf(r.name).length;
        const i = Math.floor(Math.random() * n);
        if (!r.flip.delete(i)) r.flip.add(i);
        paint(r);
      });
    }
    setTimeout(tick, 2600 + Math.random() * 3400);
  };
  if (rooms.length) setTimeout(tick, 2000);

  // the moon tonight, in the footer
  document.querySelectorAll(".tonight").forEach((el) => {
    el.querySelector(".moon-lit").setAttribute("d", moonPath(now));
    el.querySelector("span").textContent = `the moon tonight: ${moonName(now)}, ${Math.round(moonLit(now) * 100)}% lit`;
    el.hidden = false;
  });
}

// Contents: the lamp follows the section you're reading. On narrow screens the list folds.
function initContents() {
  const toc = document.querySelector(".toc");
  if (!toc) return;
  const details = toc.querySelector("details");
  const wide = window.matchMedia("(min-width: 1121px)");
  const fold = () => { details.open = wide.matches; };
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
