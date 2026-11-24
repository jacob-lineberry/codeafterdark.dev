# Mermaid 11.4.1

The ES module build of [Mermaid](https://github.com/mermaid-js/mermaid) (`dist/mermaid.esm.min.mjs`
and the chunks it loads, without source maps), copied unchanged from the npm package
`mermaid@11.4.1`, so diagrams load from this site and not from a CDN. Loaded only on pages with
a diagram (`layouts/_partials/scripts.html`); a page fetches only the chunks its diagrams need.
MIT licensed: see `LICENSE`.

To update: `npm pack mermaid@<version>`, then copy `package/dist/mermaid.esm.min.mjs`,
`package/dist/chunks/mermaid.esm.min/*.mjs` and `package/LICENSE` into a new
`static/vendor/mermaid-<version>/`, and change the path in `scripts.html`.
