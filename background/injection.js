/*
 * Starts Scope in a tab on demand, or readies every page for it once the
 * user grants access to all sites. Shared by the background script and
 * the popup.
 */
(function (Scope) {
    "use strict";

    // Load order matters: each module uses the ones before it. Paths start
    // at the extension root because Firefox resolves relative ones against
    // the calling page, which is popup/ for the popup.
    const files = [
        "/shared/browser.js",
        "/content/ui.js",
        "/content/tree.js",
        "/content/accessibility.js",
        "/content/properties.js",
        "/content/colors.js",
        "/content/fonts.js",
        "/content/styles.js",
        "/content/overlays.js",
        "/content/gaps.js",
        "/content/measure.js",
        "/content/tooltip.js",
        "/content/render.js",
        "/content/inspector.js"
    ];

    // What "always ready" runs on every page: only a loader, which asks
    // the background script to start Scope on the first Shift press.
    const loaderFiles = [
        "/shared/browser.js",
        "/content/loader.js"
    ];

    const origins = ["http://*/*", "https://*/*"];
    const scriptId = "scope";

    /*
     * Injected and registered scripts share the extension's isolated world,
     * so a frame that already runs Scope is recognised by its global and
     * isn't given a second copy. activeTab covers frames from the page's
     * own origin, the all-sites permission every frame. Frames Scope can't
     * access come back without a result and are left alone.
     */
    async function start(tabId) {
        const results = await browser.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: () => Boolean(globalThis.Scope?.inspector)
        });

        const frameIds = results
            .filter(({ result }) => result === false)
            .map(({ frameId }) => frameId);

        if (frameIds.length > 0) {
            await browser.scripting.executeScript({
                target: { tabId, frameIds },
                files
            });
        }
    }

    function hasAllSites() {
        return browser.permissions.contains({ origins });
    }

    /*
     * Match patterns for the sites switched off in the popup, so pages
     * there don't load Scope at all. Only hostnames: "file://" isn't
     * registered anyway, and an IPv6 address can't be written as a
     * pattern. A frame from another site on a switched-off page still
     * loads, and turns itself off.
     */
    async function disabledPatterns() {
        const { disabledSites = [] } =
            await browser.storage.local.get("disabledSites");

        return disabledSites
            .filter(site => /^[a-z0-9.-]+$/i.test(site))
            .map(site => `*://${site}/*`);
    }

    // Registers the loader while the all-sites permission is granted and
    // removes it when it isn't. The permission can also be changed in
    // about:addons, so this follows it rather than the popup. The
    // registration is replaced rather than updated, since an update keeps
    // the old excluded sites when there are none left to pass.
    async function syncAlwaysReady() {
        const granted = await hasAllSites();

        const registered = (
            await browser.scripting.getRegisteredContentScripts({
                ids: [scriptId]
            })
        ).length > 0;

        if (registered) {
            await browser.scripting.unregisterContentScripts({
                ids: [scriptId]
            });
        }

        if (!granted) {
            return;
        }

        const script = {
            id: scriptId,
            matches: origins,
            js: loaderFiles,
            allFrames: true,
            runAt: "document_idle",
            persistAcrossSessions: true
        };

        const excludeMatches = await disabledPatterns();

        if (excludeMatches.length > 0) {
            script.excludeMatches = excludeMatches;
        }

        await browser.scripting.registerContentScripts([script]);
    }

    Scope.injection = { origins, start, hasAllSites, syncAlwaysReady };
})(globalThis.Scope ??= {});
