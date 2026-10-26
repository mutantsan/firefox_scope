[![CI](https://github.com/mutantsan/firefox_scope/actions/workflows/ci.yml/badge.svg)](https://github.com/mutantsan/firefox_scope/actions/workflows/ci.yml)

# Scope

![Scope's pinned tooltip showing computed styles for a highlighted heading](image.png)

A small Firefox extension for checking an element's CSS without opening DevTools.

Hover over an element and hold **Shift**. A tooltip shows the element's key
computed styles, and a blue focus border marks the element being inspected.
Keep holding Shift and move the pointer to inspect other elements. Release
Shift to dismiss it.

Shift is ignored while a text field has focus (inputs, textareas and rich-text
editors), so typing capitals doesn't open the tooltip. Holding Shift on its own
in a field shows a short hint instead. Click outside the field first to
inspect.

To copy values, click while holding **Shift** to pin the tooltip in place. The
click doesn't reach the page, so it won't follow links. Then:

- click a value to copy it, e.g. `#4a7ab8`
- click a property name to copy the declaration, e.g. `color: #4a7ab8;`
- click the copy icon in the top-right corner to copy every row as CSS
  declarations
- drag to select any text as usual

Press **Esc**, press **Shift**, or click anywhere outside the tooltip to close
it.

To measure the distance to another element, hold **Alt** (**Option** on a Mac)
while an element is inspected, pinned or not, and point at the other element.
It gets a red outline, and red lines show the gaps between the two in pixels.
When one element is inside the other, the lines show how far each of its edges
is from the outer one's. The tooltip fades while Alt is held, and you can point
at elements underneath it. Release Alt to go back to inspecting.

To turn it off for a site, click the toolbar button and check
**Disable on this site**. This applies to the current hostname straight away,
without reloading the page.

## What it shows

- Colors: `color`, `backgroundColor`, border colors (collapsed to one
  `borderColor` row when all four sides match) and `outlineColor`, as hex
  values with a color swatch. Modern colors such as `oklch()`, `lab()` and
  `color(display-p3 …)` are converted to hex too, unless they fall outside
  the sRGB range a hex value can hold, in which case they're shown as
  written
- Contrast: the WCAG 2 contrast ratio of the text against what is visually
  behind it, with AA and AAA pass/fail. Translucent backgrounds and
  `opacity` are blended with what's behind them, elements positioned behind
  the text (not just its parents) count, and large text uses the lower
  thresholds. The result is `unknown` when an image, gradient or video shows
  through behind the text
- Typography: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, and the
  rendered font: the first font in the `fontFamily` list that is installed
  or loaded, which is the one the text is actually drawn in
- Box: `margin`, `padding`, `width`, `height`, `border`, `borderRadius`
- Layout: `display`, `position`, `opacity`
- A box model diagram with each side's margin, border and padding, and the
  content size. The same regions are shaded on the page: margin in orange,
  border in yellow, padding in green and content in blue

When the hovered state differs from the normal state, both are shown:
`normal → hover`.

To choose which rows the tooltip shows, click the toolbar button and open
**Shown properties**. Unchecked rows are hidden everywhere, including from
"copy all", and an open tooltip updates straight away. **Show all** and
**none** check or uncheck every row at once.

## Install for development

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json`.

Temporary add-ons are removed when Firefox restarts.

If nothing happens on a page, check the extension's site access under
`about:addons` → Scope → Permissions.

## Release a new version

1. Bump `version` in `manifest.json`. AMO rejects a version that was already
   uploaded.
2. Lint and package with [web-ext](https://github.com/mozilla/web-ext):

   ```sh
   npx web-ext lint
   npx web-ext build --overwrite-dest
   ```

   This writes `web-ext-artifacts/scope-<version>.zip`. Repo-only files are
   excluded via `web-ext-config.mjs`.
3. Upload the zip on [addons.mozilla.org](https://addons.mozilla.org/developers/)
   → Scope → **Upload New Version**, or sign and submit from the command line
   with API keys from **Tools → Manage API Keys**:

   ```sh
   npx web-ext sign --channel=listed \
       --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
   ```

## Permissions

- **Content script on all `http://` and `https://` pages**: reads computed
  styles of the element under the cursor.
- **`storage`**: saves your settings locally: the hostnames where it's
  disabled, and which rows the tooltip shows.
- **`activeTab`**: lets the toolbar popup read the current tab's hostname
  when you open it.

It makes no network requests and stores nothing besides those settings.

## License

[MIT](LICENSE)
