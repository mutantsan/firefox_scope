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
        "/content/tree.js",
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

    // Registers the content scripts while the all-sites permission is
    // granted and removes them when it isn't. The permission can also be
    // changed in about:addons, so this follows it rather than the popup.
    // A registration kept from an older version is brought up to date.
    async function syncAlwaysReady() {
        const granted = await hasAllSites();

        const registered = (
            await browser.scripting.getRegisteredContentScripts({
                ids: [scriptId]
            })
        ).length > 0;

        const script = {
            id: scriptId,
            matches: origins,
            js: files,
            allFrames: true,
            runAt: "document_idle",
            persistAcrossSessions: true
        };

        if (granted && !registered) {
            await browser.scripting.registerContentScripts([script]);
        } else if (granted) {
            await browser.scripting.updateContentScripts([script]);
        } else if (registered) {
            await browser.scripting.unregisterContentScripts({
                ids: [scriptId]
            });
        }
    }

    Scope.injection = { origins, start, hasAllSites, syncAlwaysReady };
})(globalThis.Scope ??= {});
