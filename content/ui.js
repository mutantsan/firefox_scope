/*
 * One host element on the page holds all of Scope's UI in a closed shadow
 * root, so page CSS can't style it and page scripts can't reach into it.
 *
 * Events from inside reach the page's listeners, and Scope's own listeners
 * on document and window, retargeted to the host.
 */
(function (Scope) {
    "use strict";

    const host = document.createElement("scope-inspector");

    // Rules in the shadow root (:host) lose to page CSS aimed at the host,
    // so its reset is an inline !important style instead. It also stops
    // inherited properties like font and color leaking in.
    host.style.setProperty("all", "initial", "important");

    const root = host.attachShadow({ mode: "closed" });

    document.documentElement.append(host);

    /*
     * Adds a module's rules to the shadow root. The text is set before the
     * element is inserted: Firefox then treats it as the content script's
     * styling and exempts it from the page's CSP, which it doesn't for a
     * <style> filled in after insertion (bug 1706787).
     */
    function addStyles(css) {
        const style = document.createElement("style");

        style.textContent = css;
        root.append(style);
    }

    Scope.ui = { host, root, addStyles };
})(globalThis.Scope ??= {});
