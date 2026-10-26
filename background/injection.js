/*
 * Starts Scope in a tab on demand, or on every page once the user grants
 * access to all sites. Shared by the background script and the popup.
 */
(function (Scope) {
    "use strict";

    // Load order matters: each module uses the ones before it. Paths start
    // at the extension root because Firefox resolves relative ones against
    // the calling page, which is popup/ for the popup.
    const files = [
        "/content/ui.js",
        "/content/properties.js",
        "/content/colors.js",
        "/content/fonts.js",
        "/content/styles.js",
        "/content/overlays.js",
        "/content/measure.js",
        "/content/tooltip.js",
        "/content/render.js",
        "/content/inspector.js"
    ];

    const origins = ["http://*/*", "https://*/*"];
    const scriptId = "scope";

    /*
     * Injected and registered scripts share the extension's isolated world,
     * so a page that already runs Scope is recognised by its global and
     * isn't given a second copy. Needs activeTab or the all-sites
     * permission for the tab.
     */
    async function start(tabId) {
        const [{ result: running }] = await browser.scripting.executeScript({
            target: { tabId },
            func: () => Boolean(globalThis.Scope?.inspector)
        });

        if (!running) {
            await browser.scripting.executeScript({
                target: { tabId },
                files
            });
        }
    }

    function hasAllSites() {
        return browser.permissions.contains({ origins });
    }

    // Registers the content scripts while the all-sites permission is
    // granted and removes them when it isn't. The permission can also be
    // changed in about:addons, so this follows it rather than the popup.
    async function syncAlwaysReady() {
        const granted = await hasAllSites();

        const registered = (
            await browser.scripting.getRegisteredContentScripts({
                ids: [scriptId]
            })
        ).length > 0;

        if (granted && !registered) {
            await browser.scripting.registerContentScripts([{
                id: scriptId,
                matches: origins,
                js: files,
                runAt: "document_idle",
                persistAcrossSessions: true
            }]);
        } else if (!granted && registered) {
            await browser.scripting.unregisterContentScripts({
                ids: [scriptId]
            });
        }
    }

    Scope.injection = { origins, start, hasAllSites, syncAlwaysReady };
})(globalThis.Scope ??= {});
