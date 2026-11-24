"""Sizes the fonts a reader already has to match the site's own, so text holds still while the
site's fonts load.

    assets/css/fallbacks.css    @font-face rules for the stand-ins (generated; don't edit)

Until a font in static/fonts arrives, the browser sets its text in the next font in the list
(font-display: swap), then swaps. A stand-in of another width wraps the text differently, and
the page moves when the swap comes. Each rule here takes a font the reader's system has, scales
it to the width of the site's font it stands in for (size-adjust), and gives it that font's
ascent, descent and line gap, so the swap changes the letters and nothing else.

The stand-ins are the fonts each platform has:
- Times New Roman, Arial and Courier New on Windows, macOS and iOS, with Liberation (Linux) and
  Tinos, Arimo and Cousine (ChromeOS), which are drawn to the same metrics.
- DejaVu, which many Linux systems fall back to (slanted for italics where it has none).
- Noto Serif, Roboto and Droid Sans Mono on Android.

main.css lists them after each of the site's families: "Spectral", "Spectral as Times", ...

Run it after a font in static/fonts changes:

    uv run --python 3.12 --with playwright==1.48.0 python3 scripts/fallbacks.py

It measures in Chromium, with open copies of the stand-ins downloaded once into
~/.cache/codeafterdark/fallback-fonts. Set CHROMIUM=/path/to/chrome to use a browser other than
Playwright's own.
"""

import asyncio
import base64
import functools
import http.server
import io
import os
import pathlib
import shutil
import tarfile
import tempfile
import threading
import urllib.request

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/css/fallbacks.css"
CACHE = pathlib.Path(os.environ.get("XDG_CACHE_HOME") or pathlib.Path.home() / ".cache") / "codeafterdark/fallback-fonts"

# The site's faces: family, style, the weights its stand-in covers, the file, the weight it is
# measured at (the middle of what the stylesheet asks for), and the role of the stand-in.
SITE = [
    # titles, 650-800: Hepta Slab widens as it gets bolder, so each band of weights is measured
    ("Hepta Slab", "normal", "100 674", "hepta-slab-latin.woff2", 650, "serif-bold"),
    ("Hepta Slab", "normal", "675 774", "hepta-slab-latin.woff2", 750, "serif-bold"),
    ("Hepta Slab", "normal", "775 900", "hepta-slab-latin.woff2", 800, "serif-bold"),
    ("Spectral", "normal", "400", "spectral-400-latin.woff2", 400, "serif"),
    ("Spectral", "italic", "400", "spectral-400-italic-latin.woff2", 400, "serif-italic"),
    ("Spectral", "normal", "600", "spectral-600-latin.woff2", 600, "serif-bold"),
    ("Spectral", "italic", "600", "spectral-600-italic-latin.woff2", 600, "serif-bold-italic"),
    ("Recursive", "normal", "100 549", "recursive-ui-latin.woff2", 400, "sans"),
    ("Recursive", "normal", "550 900", "recursive-ui-latin.woff2", 650, "sans-bold"),
    ("Recursive Mono", "normal", "100 549", "recursive-mono-latin.woff2", 400, "mono"),
    ("Recursive Mono", "normal", "550 900", "recursive-mono-latin.woff2", 600, "mono-bold"),
]

# The stand-ins, a group per platform. Per role: the name the family carries ("Spectral as
# Times"), the names local() can find the font by (its full name and its PostScript name), the
# open file measured in its place, and the weight that file is measured at.
GROUPS = [
    {
        "serif": ("Times", ["Times New Roman", "TimesNewRomanPSMT", "Liberation Serif", "LiberationSerif", "Tinos", "Tinos-Regular"], "LiberationSerif-Regular.ttf", 400),
        "serif-italic": ("Times", ["Times New Roman Italic", "TimesNewRomanPS-ItalicMT", "Liberation Serif Italic", "LiberationSerif-Italic", "Tinos Italic", "Tinos-Italic"], "LiberationSerif-Italic.ttf", 400),
        "serif-bold": ("Times", ["Times New Roman Bold", "TimesNewRomanPS-BoldMT", "Liberation Serif Bold", "LiberationSerif-Bold", "Tinos Bold", "Tinos-Bold"], "LiberationSerif-Bold.ttf", 700),
        "serif-bold-italic": ("Times", ["Times New Roman Bold Italic", "TimesNewRomanPS-BoldItalicMT", "Liberation Serif Bold Italic", "LiberationSerif-BoldItalic", "Tinos Bold Italic", "Tinos-BoldItalic"], "LiberationSerif-BoldItalic.ttf", 700),
        "sans": ("Arial", ["Arial", "ArialMT", "Liberation Sans", "LiberationSans", "Arimo", "Arimo-Regular"], "LiberationSans-Regular.ttf", 400),
        "sans-bold": ("Arial", ["Arial Bold", "Arial-BoldMT", "Liberation Sans Bold", "LiberationSans-Bold", "Arimo Bold", "Arimo-Bold"], "LiberationSans-Bold.ttf", 700),
        "mono": ("Courier", ["Courier New", "CourierNewPSMT", "Liberation Mono", "LiberationMono", "Cousine", "Cousine-Regular"], "LiberationMono-Regular.ttf", 400),
        "mono-bold": ("Courier", ["Courier New Bold", "CourierNewPS-BoldMT", "Liberation Mono Bold", "LiberationMono-Bold", "Cousine Bold", "Cousine-Bold"], "LiberationMono-Bold.ttf", 700),
    },
    {
        "serif": ("DejaVu", ["DejaVu Serif", "DejaVuSerif"], "DejaVuSerif.ttf", 400),
        "serif-italic": ("DejaVu", ["DejaVu Serif Italic", "DejaVuSerif-Italic"], "DejaVuSerif-Italic.ttf", 400),
        "serif-bold": ("DejaVu", ["DejaVu Serif Bold", "DejaVuSerif-Bold"], "DejaVuSerif-Bold.ttf", 700),
        "serif-bold-italic": ("DejaVu", ["DejaVu Serif Bold Italic", "DejaVuSerif-BoldItalic"], "DejaVuSerif-BoldItalic.ttf", 700),
        "sans": ("DejaVu", ["DejaVu Sans", "DejaVuSans"], "DejaVuSans.ttf", 400),
        "sans-bold": ("DejaVu", ["DejaVu Sans Bold", "DejaVuSans-Bold"], "DejaVuSans-Bold.ttf", 700),
        "mono": ("DejaVu", ["DejaVu Sans Mono", "DejaVuSansMono"], "DejaVuSansMono.ttf", 400),
        "mono-bold": ("DejaVu", ["DejaVu Sans Mono Bold", "DejaVuSansMono-Bold"], "DejaVuSansMono-Bold.ttf", 700),
    },
    # where DejaVu Serif has no italic (Debian's fonts-dejavu-core), the browser slants the
    # upright one, which is as wide as the upright one
    {
        "serif-italic": ("DejaVu slanted", ["DejaVu Serif", "DejaVuSerif"], "DejaVuSerif.ttf", 400),
        "serif-bold-italic": ("DejaVu slanted", ["DejaVu Serif Bold", "DejaVuSerif-Bold"], "DejaVuSerif-Bold.ttf", 700),
    },
    {
        "serif": ("Noto", ["Noto Serif", "NotoSerif", "NotoSerif-Regular"], "NotoSerif[wdth,wght].ttf", 400),
        "serif-italic": ("Noto", ["Noto Serif Italic", "NotoSerif-Italic"], "NotoSerif-Italic[wdth,wght].ttf", 400),
        "serif-bold": ("Noto", ["Noto Serif Bold", "NotoSerif-Bold"], "NotoSerif[wdth,wght].ttf", 700),
        "serif-bold-italic": ("Noto", ["Noto Serif Bold Italic", "NotoSerif-BoldItalic"], "NotoSerif-Italic[wdth,wght].ttf", 700),
        "sans": ("Roboto", ["Roboto", "Roboto Regular", "Roboto-Regular"], "Roboto[wdth,wght].ttf", 400),
        "sans-bold": ("Roboto", ["Roboto Bold", "Roboto-Bold"], "Roboto[wdth,wght].ttf", 700),
        # Android has no bold Droid Sans Mono; the browser emboldens the regular one, at the same width
        "mono": ("Droid", ["Droid Sans Mono", "DroidSansMono"], "DroidSansMono.ttf", 400),
    },
]

# Where the open copies come from, pinned. Each archive gives up the files named in GROUPS.
GOOGLE_FONTS = "https://raw.githubusercontent.com/google/fonts/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl"
SOURCES = [
    "https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz",
    "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2",
    f"{GOOGLE_FONTS}/notoserif/NotoSerif%5Bwdth,wght%5D.ttf",
    f"{GOOGLE_FONTS}/notoserif/NotoSerif-Italic%5Bwdth,wght%5D.ttf",
    f"{GOOGLE_FONTS}/roboto/Roboto%5Bwdth,wght%5D.ttf",
    # googlesource serves a file's bytes base64-encoded
    "https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-15.0.0_r9/data/fonts/DroidSansMono.ttf?format=TEXT",
]

# Running English of the kind the site sets, to measure widths over: letters at the rates prose
# uses them, capitals, figures and punctuation.
SAMPLE = (
    "I broke the deploy at 2am on a Tuesday, and it took me three hours to find out why. "
    "The service was fine; the load balancer was fine. What wasn't fine was a single line of "
    "configuration that told every region to drain its traffic to the same place, which is a "
    "quiet way to take down a system that was built to survive losing any one of its parts. "
    "Here is what happened, what I changed, and the questions I now ask before I ship a change "
    "like that again: who else reads this value, what happens when it's wrong, and how quickly "
    "would we know? Most outages aren't dramatic. They're small, reasonable decisions, made "
    "late at night by tired people, that add up to something nobody meant to build."
)


def fetch() -> None:
    """Downloads the open copies of the stand-ins into CACHE, once."""
    wanted = {f for g in GROUPS for _, _, f, _ in g.values()}
    CACHE.mkdir(parents=True, exist_ok=True)
    if all((CACHE / f).exists() for f in wanted):
        return
    for url in SOURCES:
        print("fetching", url)
        req = urllib.request.Request(url, headers={"User-Agent": "fallbacks.py"})
        data = urllib.request.urlopen(req, timeout=60).read()
        if url.endswith("format=TEXT"):
            data = base64.b64decode(data)
        name = urllib.request.unquote(url.split("?")[0].rsplit("/", 1)[1])
        if ".tar." in name:
            with tarfile.open(fileobj=io.BytesIO(data)) as tar:
                for m in tar.getmembers():
                    base = m.name.rsplit("/", 1)[-1]
                    if base in wanted:
                        (CACHE / base).write_bytes(tar.extractfile(m).read())
        else:
            (CACHE / name).write_bytes(data)
    missing = sorted(f for f in wanted if not (CACHE / f).exists())
    if missing:
        raise SystemExit(f"not found in the downloads: {', '.join(missing)}")


MEASURE = """
async ({ pairs, sample }) => {
  await Promise.all([...document.fonts].map((f) => f.load()));
  const span = document.createElement("span");
  span.style.cssText = "position:absolute;white-space:nowrap;font-size:100px;font-synthesis:none";
  span.textContent = sample;
  const line = document.createElement("div");
  line.style.cssText = "position:absolute;font-size:1000px;line-height:normal;font-synthesis:none";
  line.textContent = "x";
  document.body.append(span, line);
  const ctx = document.createElement("canvas").getContext("2d");
  const set = (el, [family, style, weight]) => Object.assign(el.style, { fontFamily: `"${family}"`, fontStyle: style, fontWeight: weight });
  const width = (face) => (set(span, face), span.getBoundingClientRect().width);
  return pairs.map(([site, standin]) => {
    ctx.font = `${site[1]} ${site[2]} 1000px "${site[0]}"`;
    const m = ctx.measureText("x");
    set(line, site);
    const height = line.getBoundingClientRect().height;
    return {
      size: width(site) / width(standin),
      ascent: m.fontBoundingBoxAscent / 1000,
      descent: m.fontBoundingBoxDescent / 1000,
      gap: Math.max(0, height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 1000,
    };
  });
}
"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:
        pass


async def measure(pairs: list) -> list:
    """Each pair is (site face, stand-in face), each face (family, style, weight, file); the page
    loads every file under its own family name and measures the pair in it."""
    with tempfile.TemporaryDirectory() as tmp:
        faces, css = {}, []
        for site, standin in pairs:
            for family, style, weight, path in (site, standin):
                if (family, style) in faces:
                    continue
                faces[family, style] = path
                served = f"{len(faces)}{pathlib.Path(path).suffix}"
                shutil.copyfile(path, pathlib.Path(tmp) / served)
                css.append(f'@font-face {{ font-family: "{family}"; font-style: {style}; font-weight: 100 900; src: url("{served}"); }}')
        (pathlib.Path(tmp) / "index.html").write_text(f"<!doctype html><style>{''.join(css)}</style><body>")
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=tmp))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(executable_path=os.environ.get("CHROMIUM") or None)
                page = await browser.new_page()
                await page.goto(f"http://127.0.0.1:{server.server_port}/")
                strip = lambda f: [f[0], f[1], f[2]]
                out = await page.evaluate(MEASURE, {"pairs": [[strip(a), strip(b)] for a, b in pairs], "sample": SAMPLE})
                await browser.close()
        finally:
            server.shutdown()
    return out


def pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def main() -> None:
    fetch()
    rules, pairs = [], []
    for group in GROUPS:
        for family, style, weights, file, at, role in SITE:
            if role not in group:
                continue
            label, names, standin, standin_at = group[role]
            # the measuring page names each file by what it is, so variable files measure at a weight
            site_face = (f"site {family} {file}", style, at, str(ROOT / "static/fonts" / file))
            standin_face = (f"standin {standin}", "italic" if "Italic" in standin else "normal", standin_at, str(CACHE / standin))
            pairs.append((site_face, standin_face))
            rules.append((f"{family} as {label}", style, weights, names))
    results = asyncio.run(measure(pairs))

    out = [
        "/* Generated by scripts/fallbacks.py: don't edit, run it again.",
        "   Fonts a reader already has, sized to the site's own: each is scaled to the width of the",
        "   font it stands in for and given that font's ascent, descent and line gap, so text sits",
        "   where it will sit once the site's fonts arrive. main.css lists them after each family. */",
    ]
    for (family, style, weights, names), r in zip(rules, results):
        s = r["size"]
        src = ", ".join(f'local("{n}")' for n in names)
        out += [
            "@font-face {",
            f'  font-family: "{family}"; font-style: {style}; font-weight: {weights};',
            f"  src: {src};",
            f"  size-adjust: {pct(s)}; ascent-override: {pct(r['ascent'] / s)};",
            f"  descent-override: {pct(r['descent'] / s)}; line-gap-override: {pct(r['gap'] / s)};",
            "}",
        ]
        print(f"{family:28} {style:7} {weights:8} size {pct(s):>8}")
    OUT.write_text("\n".join(out) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
