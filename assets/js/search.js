// Client-side search over /index.json with Fuse.js (self-hosted, no third parties).
// Works like a launcher: type, arrow down through results, enter opens the first hit.

const input = document.getElementById("q");
const list = document.getElementById("search-results");
const status = document.getElementById("search-status");
const say = (text) => {
  status.textContent = text;
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// One result, set like a post in the home page's list (layouts/_partials/post-row.html). The
// moon is the site's own drawing, made at build time (layouts/home.json), so it goes in as is.
function row(item, i) {
  const tags = (item.tags || [])
    .map((t) => `<span class="tag"><span class="th" aria-hidden="true">#</span>${esc(String(t).toLowerCase())}</span>`)
    .join("");
  return `<li${i === 0 ? " data-selected" : ""}><a href="${esc(item.permalink)}">
    <span class="r-title">${esc(item.title)}</span>
    <span class="r-sum">${esc(item.summary)}</span>
    <span class="meta"><span class="when" title="${esc(item.night)}">${item.moon}<time datetime="${esc(item.date)}">${esc(item.dateLabel)}</time></span><span>${esc(item.minutes)} min read</span>${tags ? `<span class="tags">${tags}</span>` : ""}</span>
  </a></li>`;
}

async function init() {
  if (!input || !window.Fuse) return;
  let data = [];
  try {
    const res = await fetch(input.dataset.index);
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    say("The search index didn't load. Try the archive instead.");
    return;
  }

  const fuse = new window.Fuse(data, {
    keys: [
      { name: "title", weight: 3 },
      { name: "tags", weight: 2 },
      { name: "summary", weight: 1.5 },
      { name: "content", weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  let hits = [];
  const run = () => {
    const q = input.value.trim();
    const url = new URL(location.href);
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);

    if (q.length < 2) {
      hits = [];
      list.innerHTML = "";
      say(q ? "Keep typing…" : `${data.length} ${data.length === 1 ? "post" : "posts"} to search.`);
      return;
    }
    hits = fuse.search(q, { limit: 30 });
    list.innerHTML = hits.map((h, i) => row(h.item, i)).join("");
    if (hits.length) say(`${hits.length} ${hits.length === 1 ? "result" : "results"} for “${q}”.`);
    else {
      say(`Nothing matches “${q}”. Try a broader word, or browse the `);
      const a = document.createElement("a");
      a.href = status.dataset.archive;
      a.textContent = "archive";
      status.append(a, ".");
    }
  };

  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(run, 120);
  });
  input.form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(t);
    run();
    if (hits.length) location.href = hits[0].item.permalink;
  });

  // Arrow keys move between the input and the result links.
  const links = () => [...list.querySelectorAll("a")];
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && links().length) {
      e.preventDefault();
      links()[0].focus();
    }
  });
  list.addEventListener("keydown", (e) => {
    const items = links();
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(i + 1, items.length - 1)].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i === 0) input.focus();
      else items[i - 1].focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.focus();
    }
  });
  list.addEventListener("focusin", (e) => {
    list.querySelectorAll("li").forEach((li) => li.removeAttribute("data-selected"));
    const li = e.target.closest("li");
    if (li) li.setAttribute("data-selected", "");
  });

  const initial = new URLSearchParams(location.search).get("q");
  if (initial) input.value = initial;
  run();
}

init();
