[![CI](https://github.com/mutantsan/firefox_scope/actions/workflows/ci.yml/badge.svg)](https://github.com/mutantsan/firefox_scope/actions/workflows/ci.yml)

# Scope

![Scope's pinned tooltip showing computed styles for a highlighted heading](image.png)

A small Firefox extension for checking an element's CSS without opening DevTools.

Scope only runs in a tab once you start it there: click the toolbar button or
press **Ctrl+Alt+S**. It then stays ready in that tab until the page is
reloaded or you leave it. To have it ready on every page without starting it,
click the toolbar button and check **Always ready on every site**. Firefox
then asks for access to all websites. Unchecking it removes that access.
The shortcut can be changed in `about:addons` → ⚙ → **Manage Extension
Shortcuts**.

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

A pinned tooltip also shows where the element sits in the page, e.g.
`main > section.hero > h1`. To inspect a nearby element that is hard to point
at, use the arrow keys: **↑** moves to the parent, **↓** to the first child,
and **←** and **→** to the previous and next sibling. Elements that aren't
displayed are skipped. Click a parent in the path to jump straight to it.

Elements inside web components are inspected like any other, including ones
in closed shadow roots. The path and the arrow keys follow the page as it is
displayed: **↓** on a component goes into its shadow root, and **↑** from
content placed in a slot goes to the slot's parent. A `»` in the path marks
where it crosses into or out of a shadow root.

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
- Box: `margin`, `padding`, `width`, `height`, `boxSizing`, `border`,
  `borderRadius`
- Layout: `display`, `position`, `zIndex`, `overflow`, `transform`,
  `opacity`. Rows that only matter for some elements appear only there:
  `justifyContent`, `alignItems` and `gap` on flex and grid containers,
  `flexDirection` on flex containers, `gridTemplateColumns` and
  `gridTemplateRows` on grid containers, and `zIndex` on positioned elements
  and flex and grid items
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

If nothing happens on a page, start Scope there with the toolbar button or
**Ctrl+Alt+S** first.

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

- **`activeTab`** and **`scripting`**: start Scope in the current tab when
  you click the toolbar button or press the shortcut, so it can read the
  computed styles of the element under the cursor. The popup also reads the
  tab's hostname for **Disable on this site**.
- **Access to all `http://` and `https://` sites**, optional: only asked
  for when you check **Always ready on every site**, to start Scope on every
  page by itself.
- **`storage`**: saves your settings locally: the hostnames where it's
  disabled, and which rows the tooltip shows.

It makes no network requests and stores nothing besides those settings.

## License

[MIT](LICENSE)
