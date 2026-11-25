"""Draws the site's share card and its app icons from the site itself.

    static/images/card.png      1200 x 630, what a shared link shows (hugo.toml `images`)
    static/apple-touch-icon.png 180 x 180, a phone's home screen
    static/favicon.ico          16 and 32, for browsers and feed readers without SVG icons

The card is the home page with only the room, the wordmark and the tagline left, at midnight,
still, under a full moon; the icons are the favicon (assets/favicon.svg) drawn bigger. Run it
against the dev server (`hugo server`) after the room, the palette or the name changes:

    uv run --python 3.12 --with playwright==1.48.0 --with pillow python3 scripts/card.py

Options: --url (default http://127.0.0.1:1313), and CHROMIUM=/path/to/chrome to use a browser
other than Playwright's own.
"""

import argparse
import asyncio
import io
import json
import os
import pathlib

from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FULL_MOON = 15  # data/scenes.json has one window view per thirtieth of the moon's cycle

# Everything on the home page but the room, the wordmark and the tagline goes; the room is
# drawn at its own size (one pixel of the art is 8 of the card's) and the name sits under it.
CARD_CSS = """
.skip, .top, .pause, .intro .about, .intro nav, .home-list, .site-foot { display: none !important; }
html { overflow: hidden; }
.room { max-width: none; width: 960px; padding: 0; margin: 8px auto 0; }
.intro { margin-top: -14px; }
.wordmark { font-size: 62px; translate: 0 0; }
.tagline { margin-top: 2px; font-size: 25px; }
"""


async def main(url: str) -> None:
    moons = json.loads((ROOT / "data/scenes.json").read_text())["moons"]
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get("CHROMIUM") or None)
        page = await browser.new_page(viewport={"width": 1200, "height": 630}, reduced_motion="reduce")
        await page.goto(f"{url}/?hour=midnight&weather=clear", wait_until="networkidle")
        await page.evaluate("document.fonts.ready")
        await page.add_style_tag(content=CARD_CSS)
        await page.evaluate(
            "(m) => { const g = document.querySelector('.room .moon'); if (g) g.innerHTML = m; }",
            moons[FULL_MOON],
        )
        await page.wait_for_timeout(200)
        out = ROOT / "static/images/card.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        card = await page.screenshot(clip={"x": 0, "y": 0, "width": 1200, "height": 630})
        Image.open(io.BytesIO(card)).convert("RGB").save(out, optimize=True)

        # the favicon as the browser draws it, at 180 and 32 pixels
        icon = await page.evaluate("document.querySelector('link[rel=icon][type=\"image/svg+xml\"]').href")
        svg = await (await page.request.get(icon)).text()
        shots = {}
        for size in (180, 32):
            await page.set_viewport_size({"width": size, "height": size})
            await page.set_content(f'<style>html,body{{margin:0;background:transparent}}svg{{display:block;width:{size}px;height:{size}px}}</style>{svg}')
            shots[size] = Image.open(io.BytesIO(await page.screenshot(omit_background=True)))
        await browser.close()

    # a home-screen icon is square and the phone rounds it, so it is drawn edge to edge
    touch = shots[180].convert("RGBA")
    ground = Image.new("RGBA", touch.size, touch.getpixel((90, 2)))
    ground.alpha_composite(touch)
    ground.convert("RGB").save(ROOT / "static/apple-touch-icon.png", optimize=True)
    shots[32].convert("RGBA").save(ROOT / "static/favicon.ico", sizes=[(16, 16), (32, 32)])
    print("wrote static/images/card.png, static/apple-touch-icon.png, static/favicon.ico")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--url", default="http://127.0.0.1:1313")
    asyncio.run(main(ap.parse_args().url.rstrip("/")))
