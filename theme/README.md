# Miami Rice

*making the terminal cozy.* Miami nights, 1987, through a nostalgic lens: three dark flavours of the night on one set of lights.

| Flavour | Ground | Feel |
|---|---|---|
| Midnight | `#18172c` | violet-indigo, the neon coming on (the default) |
| 2am | `#051022` | deep navy, the darkest hour |
| 4am | `#1d2432` | dusk slate, the sky starting to pale |

**One source of truth: [`miami-rice.json`](miami-rice.json).** Edit it, then run `node scripts/theme.mjs` (no dependencies; `--check` fails if generated files are stale). It writes `assets/css/tokens.css` for the blog and everything in `export/`. Never edit generated files.

## The rules (the same in the blog, the code, the terminal and the TUIs)

- **Pink says what a thing is:** the title and tagline, keywords, the prompt character, the mode block, a focused panel's title. Flamingo `#fe9cc3` for display, azalea `#ee8ab2` for keywords (one step deeper, so it stays apart from turquoise for colour-blind readers).
- **Turquoise says what you can act on:** links, nav, function names, commands, key hints, the cursor, the focus border.
- **One status vocabulary:** palm `#96ba84` success, strings, added. Marigold `#df9f4b` numbers, modified, warnings. Coral `#e38e7b` errors, removed. Periwinkle `#a0c1f5` paths and info.
- **Orchid `#c796e9` is the language's own vocabulary:** builtins and predeclared types, untracked files. It has no ANSI slot.
- **Neutrals:** pearl text `#ece2e6`, secondary `#b9bcd1`, scaffold lilac `#9a9cb7` (comments, punctuation, ANSI bright black).
- **ANSI:** magenta = azalea (bright = flamingo), cyan = turquoise, red = coral, green = palm, yellow = marigold, blue = periwinkle.

## Terminal themes (`export/`)

| Terminal | File | Install |
|---|---|---|
| Windows Terminal (WSL) | `windows-terminal/miami-rice.json` | paste the three entries into the `schemes` array in `settings.json`, then set `"colorScheme"` on a profile |
| Ghostty | `ghostty/miami-rice-<flavour>` | copy to `~/.config/ghostty/themes/`, then `theme = miami-rice-midnight` |
| Alacritty | `alacritty/miami-rice-<flavour>.toml` | `general.import = ["~/.config/alacritty/themes/miami-rice-midnight.toml"]` |
| WezTerm | `wezterm/miami-rice-<flavour>.toml` | copy to `~/.config/wezterm/colors/`, then `config.color_scheme = 'Miami Rice Midnight'` |
| kitty | `kitty/miami-rice-<flavour>.conf` | `include miami-rice-midnight.conf` in `kitty.conf` |

## The blog

`tokens.css` defines midnight on `:root` and the other flavours on `:root[data-flavour="2am"]` and `[data-flavour="4am"]`. A small script in `head.html` picks the flavour from the reader's local hour (22:00-01:59 midnight, 02:00-03:59 2am, 04:00-05:59 4am, midnight by day and without JavaScript). `?flavour=2am` pins one for next time; `?flavour=clock` returns to the clock.

Evidence for every colour (48 measured themes, colour-blind and contrast checks, the choice of pink keywords) is in `.impeccable/research/terminal-themes/FINDINGS.md`, rules 28-35.
