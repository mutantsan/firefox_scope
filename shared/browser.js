// Chrome names the extension API `chrome`, with the same promise-based
// methods as Firefox's `browser`. Checked by `runtime`, since in a
// content script an element with id="browser" can also show up as
// `browser`.
if (!globalThis.browser?.runtime) {
    globalThis.browser = globalThis.chrome;
}
