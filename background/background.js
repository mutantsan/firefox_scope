// Starts Scope from the keyboard shortcut and keeps "always ready" in step
// with the all-sites permission.
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

    // Key presses only reach the focused frame, so Scope in one frame sends
    // Shift and Alt here to pass them on to the tab's other frames.
    browser.runtime.onMessage.addListener((message, sender) => {
        if (message.scopeKey && sender.tab) {
            browser.tabs.sendMessage(sender.tab.id, message)
                .catch(() => {});
        }
    });

    // DEBUG: remove once the shortcut is confirmed working.
    console.log("[Scope] background loaded");
    browser.commands?.getAll().then(commands =>
        console.log("[Scope] shortcuts:", JSON.stringify(commands))
    );

    // Firefox for Android has no keyboard shortcuts.
    browser.commands?.onCommand.addListener(async command => {
        console.log("[Scope] command received:", command);

        if (command !== "start") {
            return;
        }

        const [tab] = await browser.tabs.query({
            active: true,
            currentWindow: true
        });

        console.log("[Scope] active tab:", tab.id, tab.url);

        try {
            await injection.start(tab.id);
            console.log("[Scope] started in tab", tab.id);

            // The shortcut has no other visible effect.
            await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => globalThis.Scope.inspector.announceReady()
            });
            console.log("[Scope] ready message shown");
        } catch (error) {
            // Pages extensions can't run on, such as about: pages.
            console.error("[Scope] start failed:", error);
        }
    });
})(globalThis.Scope ??= {});
