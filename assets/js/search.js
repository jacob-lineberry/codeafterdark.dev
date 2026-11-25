// Client-side search over /index.json (self-hosted, no third parties).
// Works like a launcher: type, arrow down through results, enter opens the first hit.
//
// Every word typed must be in the post. A word of three letters or fewer (go, cli, tui, mtu)
// matches only that whole word, or its plural; a longer one matches the start of a word, so
// rust finds rustc and kube finds kubernetes. A hit in the title counts most, then the tags,
// the summary, the text and the code. Each result shows the line it matched, with the words
// marked: a sentence when the words are in the prose, or else the code, set as code.
// Only when nothing matches, and the query is five letters or more, does Fuse.js look for
// near misses (a long word with a typo), and the status says they are only close.

const input = document.getElementById("q");
const list = document.getElementById("search-results");
const status = document.getElementById("search-status");
const say = (text) => {
  status.textContent = text;
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const FIELDS = [["title", 3], ["tags", 2], ["summary", 1.5], ["content", 1], ["code", 0.5]];
// a letter or digit, in any script
const ALNUM = "[\\p{L}\\p{N}]";
const NOT_ALNUM = "[^\\p{L}\\p{N}]";
const pattern = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (w.length <= 3 ? `s?(?!${ALNUM})` : "");
const words = (q) => q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
// a word at the start of the text or after anything but a letter or digit; group 2 is the word
const find = (ps, flags = "iu") => new RegExp(`(^|${NOT_ALNUM})(${ps.join("|")})`, flags);

// Text with every word found marked, escaped.
function marked(text, ws) {
  let out = "", last = 0;
  for (const m of text.matchAll(find(ws.map(pattern), "giu"))) {
    const i = m.index + m[1].length;
    out += `${esc(text.slice(last, i))}<mark>${esc(m[2])}</mark>`;
    last = i + m[2].length;
  }
  return out + esc(text.slice(last));
}

// About a summary's length of text around the first word found, cut at spaces; or null.
function passage(c, any) {
  const m = any.exec(c);
  if (!m) return null;
  const at = m.index + m[1].length;
  let a = Math.max(0, at - 50), b = Math.min(c.length, at + 110);
  const sa = c.indexOf(" ", a), sb = c.lastIndexOf(" ", b);
  if (a > 0 && sa >= 0 && sa < at) a = sa + 1;
  if (b < c.length && sb > at) b = sb;
  return { text: c.slice(a, b).replace(/\s+/g, " ").trim(), before: a > 0 ? "…" : "", after: b < c.length ? "…" : "" };
}

// The line a result matched: its summary if a word is there, or else the passage of the post
// around the first word found, or else the passage of the first block of code that has one.
function excerpt(item, ws) {
  const any = find(ws.map(pattern));
  if (any.test(item.summary || "")) return marked(item.summary, ws);
  const p = passage(item.content || "", any);
  if (p) return `${p.before}${marked(p.text, ws)}${p.after}`;
  for (const block of [].concat(item.code || [])) {
    const c = passage(block, any);
    if (c) return `${c.before}<code>${marked(c.text, ws)}</code>${c.after}`;
  }
  return esc(item.summary || "");
}

// One result, set like a post in the home page's list (layouts/_partials/post-row.html). The
// moon is the site's own drawing, made at build time (layouts/home.json), so it goes in as is.
function row(item, i, ws) {
  const tags = (item.tags || [])
    .map((t) => `<span class="tag"><span class="th" aria-hidden="true">#</span>${esc(String(t).toLowerCase())}</span>`)
    .join("");
  return `<li${i === 0 ? " data-selected" : ""}><a href="${esc(item.permalink)}">
    <span class="r-title">${esc(item.title)}</span>
    <span class="r-sum">${ws ? excerpt(item, ws) : esc(item.summary)}</span>
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

  const docs = data.map((item) => ({ item, text: FIELDS.map(([k]) => [].concat(item[k] || []).join(" ")) }));
  const exact = (ws) => {
    const res = ws.map((w) => find([pattern(w)]));
    return docs
      .map((d) => {
        let score = 0;
        for (const re of res) {
          const s = FIELDS.reduce((n, [, weight], i) => n + (re.test(d.text[i]) ? weight : 0), 0);
          if (!s) return null;
          score += s;
        }
        return { item: d.item, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  };
  const fuse = new window.Fuse(data, {
    keys: FIELDS.map(([name, weight]) => ({ name, weight })),
    threshold: 0.3,
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
    const ws = words(q);
    hits = ws.length ? exact(ws).slice(0, 30) : [];
    const close = !hits.length && q.length >= 5;
    if (close) hits = fuse.search(q, { limit: 10 });
    list.innerHTML = hits.map((h, i) => row(h.item, i, close ? null : ws)).join("");
    if (close && hits.length) say(`No post has “${q}”. ${hits.length === 1 ? "This one comes" : "These come"} close.`);
    else if (hits.length) say(`${hits.length} ${hits.length === 1 ? "result" : "results"} for “${q}”.`);
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
