(async function () {
    "use strict";

    const enabledSwitch = document.getElementById("enabled");
    const siteLabel = document.getElementById("site");
    const siteDesc = document.getElementById("site-desc");
    const status = document.getElementById("status");

    // Global switches, on by default, keyed by their storage key. Set up
    // before the site check below can bail out.
    const switches = {
        showDefaultValues: document.getElementById("show-defaults"),
        showGaps: document.getElementById("show-gaps")
    };

    const switchSettings = await browser.storage.local.get(Object.keys(switches));

    for (const [key, checkbox] of Object.entries(switches)) {
        checkbox.checked = switchSettings[key] ?? true;

        checkbox.addEventListener("change", () => {
            browser.storage.local.set({ [key]: checkbox.checked });
        });
    }

    // One pill per tooltip row, unchecked when the row is hidden.
    const { propertyGroups, hiddenByDefault, hiddenKeys, propertyLabel } =
        Scope.properties;
    const propertiesList = document.getElementById("properties");
    const rowsCount = document.getElementById("rows-count");

    const settings =
        await browser.storage.local.get(["hiddenProperties", "shownProperties"]);

    const hiddenAtStart =
        hiddenKeys(settings.hiddenProperties, settings.shownProperties);

    const inputs = new Map();
    const groupCounts = [];

    function updateCounts() {
        for (const { keys, count } of groupCounts) {
            const shown = keys.filter(key => inputs.get(key).checked).length;
            count.textContent = `${shown}/${keys.length}`;
        }

        const shown = [...inputs.values()].filter(input => input.checked);
        rowsCount.textContent = `${shown.length} of ${inputs.size} shown`;
    }

    /*
     * One write per change, so a pinned tooltip redraws once. Re-read so a
     * change made in another window isn't overwritten. A row that's hidden
     * by default is stored when shown, any other when hidden.
     */
    async function setShown(keys, shown) {
        for (const key of keys) {
            inputs.get(key).checked = shown;
        }

        updateCounts();

        const { hiddenProperties = [], shownProperties = [] } =
            await browser.storage.local.get(["hiddenProperties", "shownProperties"]);

        const hidden = new Set(hiddenProperties);
        const shownByChoice = new Set(shownProperties);

        for (const key of keys) {
            const stored = hiddenByDefault.has(key) ? shownByChoice : hidden;

            if (shown === hiddenByDefault.has(key)) {
                stored.add(key);
            } else {
                stored.delete(key);
            }
        }

        await browser.storage.local.set({
            hiddenProperties: [...hidden],
            shownProperties: [...shownByChoice]
        });
    }

    for (const { title, keys } of propertyGroups) {
        const group = document.createElement("fieldset");
        const toggle = document.createElement("button");
        const count = document.createElement("span");
        const pills = document.createElement("div");

        // Shows the whole group, or hides it when it's all shown already.
        toggle.type = "button";
        toggle.className = "group-toggle";
        toggle.title = `Show or hide all ${title.toLowerCase()} rows`;
        count.className = "count";
        toggle.append(title, count);

        toggle.addEventListener("click", () => {
            const allShown = keys.every(key => inputs.get(key).checked);
            setShown(keys, !allShown);
        });

        pills.className = "pills";

        for (const key of keys) {
            const label = document.createElement("label");
            const input = document.createElement("input");

            label.className = "pill";
            input.type = "checkbox";
            input.checked = !hiddenAtStart.has(key);

            input.addEventListener("change", () => {
                setShown([key], input.checked);
            });

            inputs.set(key, input);
            label.append(input, propertyLabel(key));
            pills.append(label);
        }

        groupCounts.push({ keys, count });
        group.append(toggle, pills);
        propertiesList.append(group);
    }

    updateCounts();

    document.getElementById("show-all")
        .addEventListener("click", () => setShown([...inputs.keys()], true));

    document.getElementById("hide-all")
        .addEventListener("click", () => setShown([...inputs.keys()], false));

    // Remembers whether the list was open, per browser profile.
    const rowsDetails = document.getElementById("rows");

    try {
        rowsDetails.open = localStorage.getItem("rowsOpen") === "1";
    } catch {
        // Storage blocked; starts closed.
    }

    rowsDetails.addEventListener("toggle", () => {
        try {
            localStorage.setItem("rowsOpen", rowsDetails.open ? "1" : "0");
        } catch {
            // Not remembered.
        }
    });

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
    const startHint = document.getElementById("start-hint");

    startHint.textContent = "Otherwise starts when you open this panel";

    if (shortcut) {
        const kbd = document.createElement("kbd");

        kbd.textContent = shortcut;
        startHint.append(" or press ", kbd);
    }

    // activeTab exposes the tab's URL while the popup is open.
    const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true
    });

    // The site the switch below applies to: the hostname, or "file://"
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
        siteDesc.textContent = "Browser pages can't be inspected";
        return;
    }

    const siteName = site === "file://" ? "Local files" : site;

    siteLabel.textContent = siteName;
    siteLabel.title = siteName;

    // Opening the popup grants activeTab, which lets Scope start here.
    // Not on a site it's turned off for, where it would only sit idle.
    function start() {
        injection.start(tab.id)
            .catch(error => console.error("Scope:", error));
    }

    function showSiteState() {
        status.classList.toggle("active", enabledSwitch.checked);
        siteDesc.textContent = enabledSwitch.checked
            ? "Hover an element and press Shift"
            : `Turned off on ${site === "file://" ? "local files" : site}`;
    }

    const { disabledSites = [] } =
        await browser.storage.local.get("disabledSites");

    enabledSwitch.checked = !disabledSites.includes(site);
    enabledSwitch.disabled = false;
    showSiteState();

    if (enabledSwitch.checked) {
        start();
    }

    enabledSwitch.addEventListener("change", async () => {
        showSiteState();

        if (enabledSwitch.checked) {
            start();
        }

        // Re-read so a change made in another window isn't overwritten.
        const { disabledSites = [] } =
            await browser.storage.local.get("disabledSites");

        const sites = new Set(disabledSites);

        if (enabledSwitch.checked) {
            sites.delete(site);
        } else {
            sites.add(site);
        }

        await browser.storage.local.set({
            disabledSites: [...sites]
        });
    });
})();
