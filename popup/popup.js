(async function () {
    "use strict";

    const checkbox = document.getElementById("disabled");
    const siteLabel = document.getElementById("site");

    // activeTab exposes the tab's URL while the popup is open.
    const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true
    });

    let hostname = null;

    try {
        const url = new URL(tab.url);

        if (url.protocol === "http:" || url.protocol === "https:") {
            hostname = url.hostname;
        }
    } catch {
        // No readable URL; treated as unavailable below.
    }

    if (!hostname) {
        document.body.classList.add("unavailable");
        siteLabel.textContent = "Not available on this page";
        return;
    }

    siteLabel.textContent = hostname;

    const { disabledSites = [] } =
        await browser.storage.local.get("disabledSites");

    checkbox.checked = disabledSites.includes(hostname);
    checkbox.disabled = false;

    checkbox.addEventListener("change", async () => {
        // Re-read so a change made in another window isn't overwritten.
        const { disabledSites = [] } =
            await browser.storage.local.get("disabledSites");

        const sites = new Set(disabledSites);

        if (checkbox.checked) {
            sites.add(hostname);
        } else {
            sites.delete(hostname);
        }

        await browser.storage.local.set({
            disabledSites: [...sites]
        });
    });
})();
