"""Draws the site's Mermaid diagrams before Hugo runs, so each page carries its diagrams
already drawn and no reader downloads Mermaid.

    assets/diagrams/<key>.svg   one per diagram, keyed by its source (generated, not committed)

deploy.yml runs it on every build, so a drawing is never older than the palette, the code
font or Mermaid it was drawn with. It builds the site, drafts and future posts too, in the
"diagrams" environment, where the render hook (layouts/_markup/render-codeblock-mermaid.html)
leaves every diagram for the browser. It serves that build and has the site's own Mermaid
(static/vendor), set up as the page sets it up (layouts/_partials/scripts.html), draw each
diagram in the page it sits in, with the site's fonts loaded. SVGs that no diagram uses any
more are removed.

The dev server draws diagrams in the browser, so there is no need to run it while writing.
Run it locally before a production build (`hugo build` stops on a diagram not drawn):

    mise exec -- uv run --python 3.12 --with playwright==1.48.0 python3 scripts/diagrams.py

Set HUGO=/path/to/hugo to use a Hugo other than the one on PATH, and CHROMIUM=/path/to/chrome to
use a browser other than Playwright's own.
"""

import asyncio
import functools
import html
import http.server
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import threading

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/diagrams"
# a diagram the browser is left to draw, as the build writes it (minified or not)
PRE = re.compile(r'<pre\b[^>]*?\bdata-diagram="?([0-9a-f]+)"?[^>]*>(.*?)</pre>', re.S)
VENDOR = re.compile(r'import mermaid from "([^"]+)"')

DRAW = """
async ({ url, items }) => {
  // the module the page imported, already set up by the page
  const { default: mermaid } = await import(url);
  await Promise.allSettled([...document.fonts].map((f) => f.load()));
  await document.fonts.ready;
  const out = {};
  for (const [key, source] of items) {
    // drawn inside a box like the one the page will carry, so the labels are measured in the
    // type they will be shown in
    const figure = document.querySelector(`pre[data-diagram="${key}"]`).closest("figure");
    const box = document.createElement("div");
    box.className = "mermaid";
    box.setAttribute("data-processed", "");
    figure.prepend(box);
    try {
      out[key] = { svg: (await mermaid.render(`diagram-${key}`, source, box)).svg };
    } catch (e) {
      out[key] = { error: String(e && e.message || e) };
    }
    box.remove();
  }
  return out;
}
"""


def scope_ids(svg: str, key: str) -> str:
    """Mermaid gives some parts fixed IDs (a sequence diagram's arrowheads and actors), so two
    diagrams on one page would share them and a reference would find the first. Each ID that
    is not already the diagram's own takes the diagram's ID as a prefix, and so does every
    reference to it."""
    root = f"diagram-{key}"
    ids = {i for i in re.findall(r'\bid="([^"]+)"', svg) if root not in i}
    if not ids:
        return svg
    names = "|".join(sorted(map(re.escape, ids), key=len, reverse=True))
    svg = re.sub(rf'\bid="({names})"', rf'id="{root}-\1"', svg)
    return re.sub(rf"#({names})(?![\w-])", rf"#{root}-\1", svg)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:
        pass


async def draw(base: str, pages: dict) -> dict:
    drawn = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get("CHROMIUM") or None)
        page = await browser.new_page(viewport={"width": 1350, "height": 900})
        for path, items in pages.items():
            url = base + path
            await page.goto(url, wait_until="load")
            # the page's own Mermaid has run once it has drawn the page's diagrams
            await page.wait_for_function("!document.querySelector('pre.mermaid:not([data-processed])')")
            vendor = VENDOR.search(await page.content())
            if not vendor:
                raise SystemExit(f"{path}: the page does not import Mermaid")
            # Hugo writes the address as a JavaScript string, its slashes escaped
            out = await page.evaluate(DRAW, {"url": vendor.group(1).replace("\\/", "/"), "items": items})
            for key, r in out.items():
                if "error" in r:
                    raise SystemExit(f"{path}: diagram {key} did not draw: {r['error']}")
                drawn[key] = scope_ids(r["svg"], key)
        await browser.close()
    return drawn


def main() -> None:
    hugo = os.environ.get("HUGO") or shutil.which("hugo")
    if not hugo:
        raise SystemExit("hugo is not on PATH: run this under `mise exec --`, or set HUGO")
    with tempfile.TemporaryDirectory() as tmp:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=tmp))
        base = f"http://127.0.0.1:{server.server_port}"
        subprocess.run(
            [hugo, "build", "--source", str(ROOT), "--destination", tmp, "--environment", "diagrams",
             "--buildDrafts", "--buildFuture", "--baseURL", base + "/", "--quiet"],
            check=True,
        )
        # every diagram, and the first page it sits in
        pages, seen = {}, set()
        for f in sorted(pathlib.Path(tmp).rglob("*.html")):
            for key, source in PRE.findall(f.read_text(encoding="utf-8")):
                if key in seen:
                    continue
                seen.add(key)
                path = "/" + f.relative_to(tmp).as_posix().removesuffix("index.html")
                pages.setdefault(path, []).append([key, html.unescape(source)])
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            drawn = asyncio.run(draw(base, pages)) if pages else {}
        finally:
            server.shutdown()

    OUT.mkdir(parents=True, exist_ok=True)
    wrote = 0
    for key, svg in drawn.items():
        f = OUT / f"{key}.svg"
        if not f.exists() or f.read_text(encoding="utf-8") != svg + "\n":
            f.write_text(svg + "\n", encoding="utf-8")
            wrote += 1
    gone = [f for f in OUT.glob("*.svg") if f.stem not in drawn]
    for f in gone:
        f.unlink()
    print(f"{len(drawn)} diagrams: {wrote} drawn, {len(drawn) - wrote} unchanged, {len(gone)} removed")


if __name__ == "__main__":
    sys.exit(main())
