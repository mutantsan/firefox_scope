[![CI](https://github.com/mutantsan/firefox_scope/actions/workflows/ci.yml/badge.svg)](https://github.com/mutantsan/firefox_scope/actions/workflows/ci.yml)

# Scope

![Scope's pinned tooltip showing computed styles for a highlighted heading](image.png)

A Firefox and Chrome extension for checking an element's CSS without opening DevTools.

## Usage

Start Scope in a tab with the toolbar button or **Ctrl+Alt+S** (**Alt+Shift+S**
in Chrome). It stays on until you reload or leave the page. To skip this step,
switch on **Always ready** in the popup; the browser will ask for access to all
sites. Change the shortcut in `about:addons` → ⚙ → **Manage Extension
Shortcuts** (Firefox) or `chrome://extensions/shortcuts` (Chrome).

- **Hold Shift** over an element to see its styles. Move the pointer to
  inspect others, release Shift to close. Shift is ignored while typing in a
  text field.
- **Shift+click** to pin the tooltip. Then click a value, property, selector
  or class to copy it, or the copy icon to copy every row as CSS. Close it
  with **Esc**, the × button or a click elsewhere.
- **Arrow keys** on a pinned tooltip move to the parent (↑), first child (↓)
  or siblings (← →). Click any part of the element path to jump to it.
- **Hold Alt** (**Option** on a Mac) and point at another element to measure
  the distance between them in pixels.

Shadow DOM (including closed roots) and iframes work too. Frames from other
sites need **Always ready**. For local `file://` pages, start Scope manually;
in Chrome, also enable **Allow access to file URLs** in the extension's
details.

To turn Scope off for a site, switch off **Run on this site** in the popup.

## What it shows

- **Colors** as hex with swatches, including `oklch()`, `lab()` and P3 colors
  where they fit in sRGB
- **Contrast**: WCAG 2 ratio against what's actually behind the text, with
  AA/AAA results
- **Typography**: font family, size, weight, line height, and the font that
  is actually rendered
- **Box**: margin, padding, size, border, radius, plus a box model diagram
  with the regions shaded on the page
- **Layout**: display, position, overflow, transform, opacity, and flex/grid
  properties where they apply
- **Accessibility** (off by default): accessible name, role, and whether the
  element is reachable with Tab. Missing names on buttons, links, fields and
  images are flagged

Hover styles that differ from the normal state show as `normal → hover`.
Pick which rows appear under **Tooltip rows** in the popup.

## Development

**Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load
Temporary Add-on…** and select `manifest.json`.

**Chrome:** run `npm run build:chrome`, open `chrome://extensions`, enable
**Developer mode**, click **Load unpacked** and select `dist/chrome`. Rebuild
and reload after changes.

## Releasing

1. Bump `version` in `manifest.json`.
2. Lint and package:

   ```sh
   npx web-ext lint
   npx web-ext build --overwrite-dest
   ```

3. Upload `web-ext-artifacts/scope-<version>.zip` on
   [addons.mozilla.org](https://addons.mozilla.org/developers/), or sign from
   the command line:

   ```sh
   npx web-ext sign --channel=listed \
       --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
   ```

4. For Chrome, run `npm run build:chrome` and upload
   `web-ext-artifacts/scope-chrome-<version>.zip` in the
   [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole).

## Permissions

- **`activeTab`, `scripting`**: run Scope in the current tab when you start it.
- **All sites** (optional): only requested for **Always ready**.
- **`storage`**: saves your settings locally.

Scope sends no data anywhere. The only requests it makes are for stylesheets
the page already loads, to read their hover rules.

## License

[MIT](LICENSE)
