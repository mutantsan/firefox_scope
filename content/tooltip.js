// The tooltip itself: its frame, pinning, copying and positioning. What
// goes inside it is built by render.js.
(function (Scope) {
    "use strict";

    let pinned = false;

    // CSS declarations copied by the "Copy all" button.
    let copyAllText = "";

    // Only a pinned tooltip takes the pointer, unless it's faded, see
    // fade().
    Scope.ui.addStyles(`
        .tooltip {
            position: fixed;
            z-index: 2147483647;
            display: none;

            padding: 10px 12px;
            max-width: min(1200px, calc(100vw - 32px));
            max-height: calc(100vh - 22px);
            overflow-y: auto;
            overscroll-behavior: contain;
            scrollbar-width: thin;
            scrollbar-color: #555 transparent;

            background: #111;
            color: #eee;
            border: 1px solid #555;
            border-radius: 6px;

            font-family: monospace;
            font-size: 12px;
            line-height: 1.6;

            white-space: pre;
            pointer-events: none;
            transition: opacity 0.15s;

            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        }

        .tooltip.pinned {
            user-select: text;
            border-color: #3b9eff;
        }

        .tooltip.pinned:not(.faded) {
            pointer-events: auto;
        }

        .tooltip.faded {
            opacity: 0.25;
        }

        .pin-bar,
        .pin-tip,
        .path {
            margin-bottom: 6px;
            padding-bottom: 6px;
            border-bottom: 1px solid #333;

            color: #888;
        }

        .pin-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
        }

        .tooltip:not(.pinned) .pin-bar,
        .tooltip:not(.pinned) .path,
        .tooltip.pinned .pin-tip {
            display: none;
        }

        .pin-status.flash {
            color: #3b9eff;
        }

        .copy-all {
            padding: 3px 5px;

            background: #222;
            color: #eee;
            border: 1px solid #555;
            border-radius: 4px;

            font: inherit;
            cursor: pointer;
        }

        .copy-all svg {
            display: block;
        }

        .copy-buffer {
            position: fixed;
            opacity: 0;
        }

        .copyable {
            cursor: pointer;
        }
    `);

    const tooltip = document.createElement("div");

    tooltip.className = "tooltip";

    Scope.ui.root.append(tooltip);

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

    const pinHint =
        "Click to copy · Arrows to move · Alt to measure · Esc to close";

    const pinBar = document.createElement("div");

    pinBar.className = "pin-bar";

    const pinStatus = document.createElement("span");

    pinStatus.className = "pin-status";
    pinStatus.textContent = pinHint;

    const copyAllButton = document.createElement("button");

    copyAllButton.className = "copy-all";
    copyAllButton.type = "button";
    copyAllButton.title = "Copy all";
    copyAllButton.setAttribute("aria-label", "Copy all");

    // Two overlapping sheets, built with DOM calls rather than innerHTML.
    // Page CSS can't reach into the shadow root, so plain presentation
    // attributes are enough for the paint.
    const svgNS = "http://www.w3.org/2000/svg";

    function setAttributes(el, attributes) {
        for (const [name, value] of Object.entries(attributes)) {
            el.setAttribute(name, value);
        }
    }

    const copyIcon = document.createElementNS(svgNS, "svg");

    setAttributes(copyIcon, {
        viewBox: "0 0 24 24",
        width: "14",
        height: "14",
        fill: "none",
        stroke: "#eee",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
    });

    const front = document.createElementNS(svgNS, "rect");

    setAttributes(front, {
        x: "9", y: "9", width: "13", height: "13", rx: "2"
    });

    const back = document.createElementNS(svgNS, "path");

    back.setAttribute(
        "d",
        "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
    );

    copyIcon.append(front, back);
    copyAllButton.append(copyIcon);

    copyAllButton.addEventListener("click", () => {
        copyText(copyAllText, "Copied all styles");
    });

    pinBar.append(pinStatus, copyAllButton);

    // Takes the pin bar's place until the tooltip is pinned. Shift is
    // already held at this point, so a plain click is all that's left.
    const pinTip = document.createElement("div");

    pinTip.className = "pin-tip";
    pinTip.textContent = "Click to pin";

    function pin() {
        pinned = true;
        tooltip.classList.add("pinned");
    }

    function hide() {
        pinned = false;
        tooltip.classList.remove("pinned");
        tooltip.style.display = "none";
    }

    // -------------------------------------------------------------------------
    // Copying
    // -------------------------------------------------------------------------

    let statusTimer = null;

    function flashStatus(message) {
        pinStatus.textContent = message;
        pinStatus.classList.add("flash");

        clearTimeout(statusTimer);

        statusTimer = setTimeout(() => {
            pinStatus.textContent = pinHint;
            pinStatus.classList.remove("flash");
        }, 1200);
    }

    async function copyText(text, message = "Copied " + text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // navigator.clipboard is missing on plain http:// pages, so fall
            // back to a hidden textarea. Still inside the click, so allowed.
            const textarea = document.createElement("textarea");

            textarea.className = "copy-buffer";
            textarea.value = text;

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
        node.classList.add("copyable");

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

    // Keeps the tooltip where it is, moving it only as far as needed to
    // stay in the viewport when its content grew.
    function keepInView() {
        const rect = tooltip.getBoundingClientRect();

        const x = Math.min(rect.left, window.innerWidth - rect.width);
        const y = Math.min(rect.top, window.innerHeight - rect.height);

        tooltip.style.left = Math.max(0, x) + "px";
        tooltip.style.top = Math.max(0, y) + "px";
    }

    // -------------------------------------------------------------------------
    // Content
    // -------------------------------------------------------------------------

    // Faded while measuring, so the lines under it show through. It lets
    // the pointer through too, to measure to elements beneath it.
    function fade(value) {
        tooltip.classList.toggle("faded", value);
    }

    // Shows `nodes` below the pin bar, next to the pointer, and `path`, the
    // element's place in the page, under the bar while pinned. A pinned
    // tooltip is being redrawn, e.g. after a setting changed in the popup
    // or the arrow keys moved to another element, so it stays put rather
    // than jumping to where the pointer left the page.
    function show(nodes, allText, mouseX, mouseY, path) {
        copyAllText = allText;

        // The pin tip stays right before the rows, which rely on it to drop
        // their divider when they come first.
        tooltip.replaceChildren(pinBar, path, pinTip, ...nodes);
        tooltip.style.display = "block";

        if (pinned) {
            keepInView();
        } else {
            position(mouseX, mouseY);
        }
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
        pin,
        hide,
        show,
        showMessage,
        position,
        fade,
        makeCopyable
    };
})(globalThis.Scope ??= {});
