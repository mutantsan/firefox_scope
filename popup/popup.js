(async function () {
    "use strict";

    const checkbox = document.getElementById("disabled");
    const siteLabel = document.getElementById("site");
    const showDefaultsCheckbox = document.getElementById("show-defaults");

    // Global, so it's set up before the site check below can bail out.
    const { showDefaultValues = true } =
        await browser.storage.local.get("showDefaultValues");

    showDefaultsCheckbox.checked = showDefaultValues;

    showDefaultsCheckbox.addEventListener("change", () => {
        browser.storage.local.set({
            showDefaultValues: showDefaultsCheckbox.checked
        });
    });

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
