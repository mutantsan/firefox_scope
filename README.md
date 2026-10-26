# Scope

A small Firefox extension for checking an element's CSS without opening DevTools.

Hover over an element and hold **Shift**. A tooltip shows the element's key
computed styles, and a blue focus border marks the element being inspected.
Release Shift to dismiss it.

To copy values, press **Shift+Alt** to pin the tooltip in place. Then:

- click a value to copy it, e.g. `#4a7ab8`
- click a property name to copy the declaration, e.g. `color: #4a7ab8;`
- click **Copy all** to copy every row as CSS declarations
- drag to select any text as usual

Press **Esc**, press **Shift**, or click anywhere outside the tooltip to close
it.

To turn it off for a site, click the toolbar button and check
**Disable on this site**. This applies to the current hostname straight away,
without reloading the page.

## What it shows

- Colors: `color`, `backgroundColor`, border colors (collapsed to one
  `borderColor` row when all four sides match) and `outlineColor`, as hex
  values with a color swatch
- Typography: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`
- Box: `margin`, `padding`, `width`, `height`, `border`, `borderRadius`
- Layout: `display`, `position`, `opacity`

When the hovered state differs from the normal state, both are shown:
`normal → hover`. The normal state is approximated by measuring an off-screen
clone of the element that the pointer isn't over.

## Install for development

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json`.

Temporary add-ons are removed when Firefox restarts.

If nothing happens on a page, check the extension's site access under
`about:addons` → Scope → Permissions.

## Permissions

- **Content script on all `http://` and `https://` pages**: reads computed
  styles of the element under the cursor.
- **`storage`**: saves the list of hostnames where it's disabled, locally.
- **`activeTab`**: lets the toolbar popup read the current tab's hostname
  when you open it.

It makes no network requests and stores nothing besides that list.

## License

[MIT](LICENSE)
