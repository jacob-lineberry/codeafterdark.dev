// code after dark: progressive enhancements. The site works without this file.

const WPM = 230;

function initCopy() {
  document.querySelectorAll("figure.code, figure.term").forEach((fig) => {
    const btn = fig.querySelector(".copy");
    const code = fig.querySelector("pre code") || fig.querySelector("pre");
    if (!btn || !code || !navigator.clipboard) return;
    btn.hidden = false;
    btn.setAttribute("aria-label", "Copy to clipboard");
    let timer;
    btn.addEventListener("click", async () => {
      // Terminal prompts are user-select:none; copy the same text a reader would select.
      const clone = code.cloneNode(true);
      clone.querySelectorAll(".p, .gp, .lnt, .ln").forEach((n) => {
        const next = n.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) next.textContent = next.textContent.replace(/^ /, "");
        n.remove();
      });
      const text = clone.textContent.replace(/\n$/, "");
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
        btn.dataset.state = "done";
      } catch {
        btn.textContent = "Copy failed";
        btn.dataset.state = "error";
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.textContent = "Copy";
        delete btn.dataset.state;
      }, 2000);
    });
  });
}

function initToc() {
  const prose = document.getElementById("prose");
  const tocs = document.querySelectorAll(".toc");
  if (!prose || !tocs.length) return;

  const headings = [...prose.querySelectorAll("h2[id], h3[id]")];
  if (!headings.length) return;

  // Minute marks: how far into the post each section starts, at a steady reading pace.
  const marks = new Map();
  let words = 0;
  const walker = document.createTreeWalker(prose, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  const pending = new Set(headings);
  let node;
  while ((node = walker.nextNode())) {
    if (pending.has(node)) {
      marks.set(node.id, Math.floor(words / WPM));
      pending.delete(node);
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      if (t) words += t.split(/\s+/).length;
    }
  }

  tocs.forEach((toc) => {
    toc.classList.add("has-marks");
    toc.querySelectorAll('a[href^="#"]').forEach((a) => {
      const id = decodeURIComponent(a.getAttribute("href").slice(1));
      if (!marks.has(id)) return;
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = `${marks.get(id)} min`;
      t.setAttribute("aria-hidden", "true");
      a.prepend(t);
    });
  });

  // Mark the section currently being read.
  const links = [...document.querySelectorAll('.rail .toc a[href^="#"]')];
  if (!links.length || !("IntersectionObserver" in window)) return;
  const byId = new Map(links.map((a) => [decodeURIComponent(a.getAttribute("href").slice(1)), a]));
  let current = null;
  const setCurrent = (id) => {
    if (id === current) return;
    current = id;
    links.forEach((a) => a.removeAttribute("aria-current"));
    const a = byId.get(id);
    if (a) a.setAttribute("aria-current", "location");
  };
  const io = new IntersectionObserver(
    () => {
      const line = window.innerHeight * 0.3;
      let active = headings[0].id;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= line) active = h.id;
        else break;
      }
      setCurrent(active);
    },
    { rootMargin: "0px 0px -70% 0px", threshold: [0, 1] }
  );
  headings.forEach((h) => io.observe(h));
}

function initMobileToc() {
  const details = document.querySelector(".toc-mobile");
  if (!details) return;
  details.addEventListener("click", (e) => {
    if (e.target.closest("a")) details.open = false;
  });
}

initCopy();
initToc();
initMobileToc();
