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

    // One checkbox per tooltip row, unchecked when the row is hidden.
    const { propertyGroups, propertyLabel } = Scope.properties;
    const propertiesList = document.getElementById("properties");

    const { hiddenProperties = [] } =
        await browser.storage.local.get("hiddenProperties");

    const inputs = new Map();

    for (const { title, keys } of propertyGroups) {
        const group = document.createElement("fieldset");
        const legend = document.createElement("legend");

        legend.textContent = title;
        group.append(legend);

        for (const key of keys) {
            const label = document.createElement("label");
            const input = document.createElement("input");

            input.type = "checkbox";
            input.checked = !hiddenProperties.includes(key);

            input.addEventListener("change", async () => {
                // Re-read so a change made in another window isn't
                // overwritten.
                const { hiddenProperties = [] } =
                    await browser.storage.local.get("hiddenProperties");

                const hidden = new Set(hiddenProperties);

                if (input.checked) {
                    hidden.delete(key);
                } else {
                    hidden.add(key);
                }

                await browser.storage.local.set({
                    hiddenProperties: [...hidden]
                });
            });

            inputs.set(key, input);
            label.append(input, propertyLabel(key));
            group.append(label);
        }

        propertiesList.append(group);
    }

    // One write for the whole list, so a pinned tooltip redraws once.
    function setAllShown(shown) {
        for (const input of inputs.values()) {
            input.checked = shown;
        }

        browser.storage.local.set({
            hiddenProperties: shown ? [] : [...inputs.keys()]
        });
    }

    document.getElementById("show-all")
        .addEventListener("click", () => setAllShown(true));

    document.getElementById("hide-all")
        .addEventListener("click", () => setAllShown(false));

    /*
     * Off by default, so Scope needs no access to sites until it's started.
     * The background script registers or removes the content scripts when
     * the permission changes.
     */
    const { injection } = Scope;
    const alwaysReadyCheckbox = document.getElementById("always-ready");

    alwaysReadyCheckbox.checked = await injection.hasAllSites();

    alwaysReadyCheckbox.addEventListener("change", async () => {
        const permissions = { origins: injection.origins };

        // Requested straight from the click, which Firefox requires.
        if (alwaysReadyCheckbox.checked) {
            alwaysReadyCheckbox.checked =
                await browser.permissions.request(permissions);
        } else {
            await browser.permissions.remove(permissions);
        }
    });

    // Firefox for Android has no keyboard shortcuts, and the user may have
    // removed this one.
    const commands = (await browser.commands?.getAll()) ?? [];
    const shortcut = commands.find(c => c.name === "start")?.shortcut;

    document.getElementById("start-hint").textContent = shortcut
        ? `Otherwise Scope starts when you open this panel or press ${shortcut}.`
        : "Otherwise Scope starts when you open this panel.";

    // activeTab exposes the tab's URL while the popup is open.
    const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true
    });

    // The site the checkbox below applies to: the hostname, or "file://"
    // for local files, which have none. The inspector names it the same way.
    let site = null;

    try {
        const url = new URL(tab.url);

        if (url.protocol === "http:" || url.protocol === "https:") {
            site = url.hostname;
        } else if (url.protocol === "file:") {
            site = "file://";
        }
    } catch {
        // No readable URL; treated as unavailable below.
    }

    if (!site) {
        document.body.classList.add("unavailable");
        siteLabel.textContent = "Not available on this page";
        return;
    }

    siteLabel.textContent = site === "file://" ? "Local files" : site;

    // Opening the popup grants activeTab, which lets Scope start here.
    injection.start(tab.id)
        .catch(error => console.error("Scope:", error));

    const { disabledSites = [] } =
        await browser.storage.local.get("disabledSites");

    checkbox.checked = disabledSites.includes(site);
    checkbox.disabled = false;

    checkbox.addEventListener("change", async () => {
        // Re-read so a change made in another window isn't overwritten.
        const { disabledSites = [] } =
            await browser.storage.local.get("disabledSites");

        const sites = new Set(disabledSites);

        if (checkbox.checked) {
            sites.add(site);
        } else {
            sites.delete(site);
        }

        await browser.storage.local.set({
            disabledSites: [...sites]
        });
    });
})();
