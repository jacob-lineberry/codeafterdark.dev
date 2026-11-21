// Client-side search over /index.json with Fuse.js (self-hosted, no third parties).

const input = document.getElementById("q");
const list = document.getElementById("search-results");
const status = document.getElementById("search-status");

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function row(item) {
  const hue = item.hue ? ` h-${esc(item.hue)}` : "";
  const fmt = item.format ? `<span class="fmt"><i></i>${esc(item.format)}</span>` : "";
  return `<li class="row${hue}">
    <time datetime="${esc(item.date)}">${esc(item.dateLabel)} <span>${esc(item.year)}</span></time>
    <div class="row-body"><h3 class="row-title"><a href="${esc(item.permalink)}">${esc(item.title)}</a></h3>
    <p class="row-sum">${esc(item.summary)}</p></div>
    <p class="row-meta">${fmt}<span>${esc(item.minutes)} min</span></p>
  </li>`;
}

async function init() {
  if (!input || !window.Fuse) return;
  let data = [];
  try {
    const res = await fetch(input.dataset.index);
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    status.textContent = "The search index didn't load. Try the archive instead.";
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

  const run = () => {
    const q = input.value.trim();
    const url = new URL(location.href);
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);

    if (q.length < 2) {
      list.innerHTML = "";
      status.textContent = q ? "Keep typing…" : `${data.length} ${data.length === 1 ? "post" : "posts"} to search.`;
      return;
    }
    const hits = fuse.search(q, { limit: 30 });
    list.innerHTML = hits.map((h) => row(h.item)).join("");
    status.textContent = hits.length
      ? `${hits.length} ${hits.length === 1 ? "result" : "results"} for “${q}”.`
      : `Nothing matches “${q}”. Try a broader word, or browse the archive.`;
  };

  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(run, 120);
  });
  input.form.addEventListener("submit", (e) => {
    e.preventDefault();
    run();
  });

  const initial = new URLSearchParams(location.search).get("q");
  if (initial) input.value = initial;
  run();
}

init();
