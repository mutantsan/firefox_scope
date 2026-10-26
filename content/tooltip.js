// The tooltip itself: its frame, pinning, copying and positioning. What
// goes inside it is built by render.js.
(function (Scope) {
    "use strict";

    let pinned = false;

    // CSS declarations copied by the "Copy all" button.
    let copyAllText = "";

    const tooltip = document.createElement("div");

    Object.assign(tooltip.style, {
        position: "fixed",
        zIndex: "2147483647",
        display: "none",

        padding: "10px 12px",
        maxWidth: "min(1200px, calc(100vw - 32px))",

        background: "#111",
        color: "#eee",
        border: "1px solid #555",
        borderRadius: "6px",

        fontFamily: "monospace",
        fontSize: "12px",
        lineHeight: "1.6",

        whiteSpace: "pre",
        pointerEvents: "none",

        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)"
    });

    document.documentElement.appendChild(tooltip);

    // Clicks inside a pinned tooltip must not reach the page, or clicking a
    // value over a link or button would trigger it.
    [
        "mousedown",
        "mouseup",
        "click",
        "dblclick",
        "pointerdown",
        "pointerup"
    ].forEach(type => {
        tooltip.addEventListener(type, event => event.stopPropagation());
    });

    // -------------------------------------------------------------------------
    // Pin bar (only visible while pinned)
    // -------------------------------------------------------------------------

    const pinHint = "Click to copy · Esc to close";

    const pinBar = document.createElement("div");

    Object.assign(pinBar.style, {
        display: "none",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "16px",

        marginBottom: "6px",
        paddingBottom: "6px",
        borderBottom: "1px solid #333",

        color: "#888"
    });

    const pinStatus = document.createElement("span");

    pinStatus.textContent = pinHint;

    const copyAllButton = document.createElement("button");

    copyAllButton.type = "button";
    copyAllButton.title = "Copy all";
    copyAllButton.setAttribute("aria-label", "Copy all");

    // Two overlapping sheets, built with DOM calls rather than innerHTML.
    // SVG presentation attributes lose to any page CSS (e.g. a site-wide
    // `svg { fill: currentColor }`), so paint is set as !important styles.
    const svgNS = "http://www.w3.org/2000/svg";

    function forceStyles(el, styles) {
        for (const [name, value] of Object.entries(styles)) {
            el.style.setProperty(name, value, "important");
        }
    }

    const copyIcon = document.createElementNS(svgNS, "svg");

    copyIcon.setAttribute("viewBox", "0 0 24 24");

    forceStyles(copyIcon, {
        display: "block",
        width: "14px",
        height: "14px",
        color: "#eee"
    });

    const front = document.createElementNS(svgNS, "rect");

    for (const [name, value] of Object.entries({
        x: "9", y: "9", width: "13", height: "13", rx: "2"
    })) {
        front.setAttribute(name, value);
    }

    const back = document.createElementNS(svgNS, "path");

    back.setAttribute(
        "d",
        "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
    );

    for (const shape of [front, back]) {
        forceStyles(shape, {
            fill: "none",
            stroke: "#eee",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
        });
    }

    copyIcon.append(front, back);
    copyAllButton.append(copyIcon);

    Object.assign(copyAllButton.style, {
        padding: "3px 5px",

        background: "#222",
        color: "#eee",
        border: "1px solid #555",
        borderRadius: "4px",

        font: "inherit",
        cursor: "pointer"
    });

    copyAllButton.addEventListener("click", () => {
        copyText(copyAllText, "Copied all styles");
    });

    pinBar.append(pinStatus, copyAllButton);

    // Takes the pin bar's place until the tooltip is pinned. Shift is
    // already held at this point, so a plain click is all that's left.
    const pinTip = document.createElement("div");

    pinTip.textContent = "Click to pin";

    Object.assign(pinTip.style, {
        marginBottom: "6px",
        paddingBottom: "6px",
        borderBottom: "1px solid #333",

        color: "#888"
    });

    function pin() {
        pinned = true;
        pinTip.style.display = "none";

        Object.assign(tooltip.style, {
            pointerEvents: "auto",
            userSelect: "text",
            borderColor: "#3b9eff"
        });

        pinBar.style.display = "flex";
    }

    function hide() {
        pinned = false;

        Object.assign(tooltip.style, {
            pointerEvents: "none",
            userSelect: "",
            borderColor: "#555"
        });

        pinBar.style.display = "none";
        pinTip.style.display = "";

        tooltip.style.display = "none";
    }

    // -------------------------------------------------------------------------
    // Copying
    // -------------------------------------------------------------------------

    let statusTimer = null;

    function flashStatus(message) {
        pinStatus.textContent = message;
        pinStatus.style.color = "#3b9eff";

        clearTimeout(statusTimer);

        statusTimer = setTimeout(() => {
            pinStatus.textContent = pinHint;
            pinStatus.style.color = "";
        }, 1200);
    }

    async function copyText(text, message = "Copied " + text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // navigator.clipboard is missing on plain http:// pages, so fall
            // back to a hidden textarea. Still inside the click, so allowed.
            const textarea = document.createElement("textarea");

            textarea.value = text;

            Object.assign(textarea.style, {
                position: "fixed",
                opacity: "0"
            });

            tooltip.append(textarea);
            textarea.select();

            const copied = document.execCommand("copy");

            textarea.remove();

            if (!copied) {
                flashStatus("Copy failed");
                return;
            }
        }

        flashStatus(message);
    }

    // Clicking copies, unless the click ended a drag-selection of text.
    function makeCopyable(node, text) {
        node.title = "Click to copy";
        node.style.cursor = "pointer";

        node.addEventListener("click", () => {
            if (!pinned || String(window.getSelection())) {
                return;
            }

            copyText(text);
        });
    }

    // -------------------------------------------------------------------------
    // Positioning
    // -------------------------------------------------------------------------

    function position(mouseX, mouseY) {
        const offset = 16;

        let x = mouseX + offset;
        let y = mouseY + offset;

        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";

        const rect = tooltip.getBoundingClientRect();

        // Move to the left side of the cursor if there isn't enough
        // horizontal space.
        if (rect.right > window.innerWidth) {
            x = mouseX - rect.width - offset;
        }

        // Move above the cursor if there isn't enough vertical space.
        if (rect.bottom > window.innerHeight) {
            y = mouseY - rect.height - offset;
        }

        tooltip.style.left =
            Math.max(0, x) + "px";

        tooltip.style.top =
            Math.max(0, y) + "px";
    }

    // -------------------------------------------------------------------------
    // Content
    // -------------------------------------------------------------------------

    // Shows `nodes` below the pin bar, next to the pointer.
    function show(nodes, allText, mouseX, mouseY) {
        copyAllText = allText;

        tooltip.replaceChildren(pinBar, pinTip, ...nodes);
        tooltip.style.display = "block";

        position(mouseX, mouseY);
    }

    // A plain message in place of the styles, e.g. a hint.
    function showMessage(text, mouseX, mouseY) {
        tooltip.textContent = text;
        tooltip.style.display = "block";

        position(mouseX, mouseY);
    }

    Scope.tooltip = {
        isPinned: () => pinned,
        isVisible: () => tooltip.style.display !== "none",
        contains: node => tooltip.contains(node),
        pin,
        hide,
        show,
        showMessage,
        position,
        makeCopyable
    };
})(globalThis.Scope ??= {});
