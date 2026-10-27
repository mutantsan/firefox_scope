// Starts Scope from the keyboard shortcut and keeps "always ready" in step
// with the all-sites permission and the sites switched off in the popup.
(function (Scope) {
    "use strict";

    const { injection } = Scope;

    // Events can arrive together, e.g. on install, so syncs run one at a
    // time and none registers the scripts twice.
    let syncing = Promise.resolve();

    function sync() {
        syncing = syncing
            .then(injection.syncAlwaysReady)
            .catch(error => console.error("Scope:", error));
    }

    browser.runtime.onInstalled.addListener(sync);
    browser.runtime.onStartup.addListener(sync);
    browser.permissions.onAdded.addListener(sync);
    browser.permissions.onRemoved.addListener(sync);

    // Sites switched off in the popup are left out of the registration.
    browser.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.disabledSites) {
            sync();
        }
    });

    // Key presses only reach the focused frame, so Scope in one frame sends
    // Shift and Alt here to pass them on to the tab's other frames.
    browser.runtime.onMessage.addListener((message, sender) => {
        if (message.scopeKey && sender.tab) {
            browser.tabs.sendMessage(sender.tab.id, message)
                .catch(() => {});
        }
    });

    // Firefox for Android has no keyboard shortcuts.
    browser.commands?.onCommand.addListener(async command => {
        if (command !== "start") {
            return;
        }

        const [tab] = await browser.tabs.query({
            active: true,
            currentWindow: true
        });

        try {
            await injection.start(tab.id);

            // The shortcut has no other visible effect.
            await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => globalThis.Scope.inspector.announceReady()
            });
        } catch {
            // Pages extensions can't run on, such as about: pages.
        }
    });
})(globalThis.Scope ??= {});
