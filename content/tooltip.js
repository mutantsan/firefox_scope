// The tooltip itself: its frame, pinning, copying and positioning. What
// goes inside it is built by render.js.
(function (Scope) {
    "use strict";

    let pinned = false;

    // CSS declarations copied by the "Copy all" button.
    let copyAllText = "";

    // Called by the close button, set by the inspector so closing also
    // removes the page overlays.
    let closeHandler = null;

    /*
     * Always dark, whatever the page's theme, like DevTools' highlighter:
     * it sits over arbitrary content and has to read the same everywhere.
     * Only a pinned tooltip takes the pointer, unless it's faded, see
     * fade().
     */
    Scope.ui.addStyles(`
        .tooltip {
            --bg: #18181d;
            --raised: #24242b;
            --line: rgba(255, 255, 255, 0.08);
            --fg: #ececf1;
            --muted: #9a9aa6;
            --dim: #686874;
            --accent: #3b9eff;
            --pass: #4ade80;
            --fail: #f87171;
            --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;

            position: fixed;
            z-index: 2147483647;
            display: none;

            box-sizing: border-box;
            width: max-content;
            min-width: 320px;
            max-width: min(520px, calc(100vw - 32px));
            max-height: calc(100vh - 22px);
            flex-direction: column;
            overflow: hidden;

            background: var(--bg);
            color: var(--fg);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            box-shadow:
                0 1px 2px rgba(0, 0, 0, 0.3),
                0 12px 32px rgba(0, 0, 0, 0.35);

            font: 12px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
            text-align: left;

            pointer-events: none;
            transition: opacity 0.15s, border-color 0.15s;
        }

        .tooltip.pinned {
            user-select: text;
            border-color: var(--accent);
            box-shadow:
                0 0 0 3px rgba(59, 158, 255, 0.18),
                0 12px 32px rgba(0, 0, 0, 0.35);
        }

        .tooltip.pinned:not(.faded) {
            pointer-events: auto;
        }

        .tooltip.faded {
            opacity: 0.25;
        }

        .head {
            display: flex;
            flex: none;
            align-items: flex-start;
            gap: 8px;
            padding: 10px 12px 8px;
        }

        .head > :first-child {
            flex: 1;
            min-width: 0;
        }

        .actions {
            display: flex;
            gap: 4px;
            margin: -2px -4px 0 0;
        }

        .tooltip:not(.pinned) .actions,
        .tooltip:not(.pinned) .path {
            display: none;
        }

        .icon-button {
            display: grid;
            place-items: center;
            width: 24px;
            height: 24px;
            padding: 0;

            background: none;
            color: var(--muted);
            border: none;
            border-radius: 6px;

            cursor: pointer;
        }

        .icon-button:hover {
            background: var(--raised);
            color: var(--fg);
        }

        .icon-button:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }

        .icon-button svg {
            display: block;
        }

        /* Only the body scrolls, so the header and the key hints stay in
           view on a tall tooltip. */
        .body {
            flex: 1 1 auto;
            min-height: 0;
            padding: 2px 12px 10px;
            overflow-y: auto;
            overscroll-behavior: contain;
            scrollbar-width: thin;
            scrollbar-gutter: stable;
            scrollbar-color: #4a4a55 transparent;
        }

        .foot {
            display: flex;
            flex: none;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px 7px;
            padding: 7px 12px;

            background: rgba(255, 255, 255, 0.025);
            border-top: 1px solid var(--line);
            border-radius: 0 0 9px 9px;
            color: var(--dim);

            font-size: 11px;

            /* Wraps at the tooltip's width rather than widening it. */
            contain: inline-size;
        }

        .foot.flash {
            color: var(--accent);
        }

        .hint {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            white-space: nowrap;
        }

        kbd {
            padding: 0 4px;
            min-width: 8px;

            background: var(--raised);
            color: var(--muted);
            border: 1px solid var(--line);
            border-bottom-color: rgba(0, 0, 0, 0.5);
            border-radius: 4px;

            font: 10px/15px var(--mono);
            text-align: center;
        }

        .message {
            padding: 10px 12px;
            max-width: 320px;
            color: var(--muted);
        }

        .copy-buffer {
            position: fixed;
            opacity: 0;
        }

        .copyable {
            cursor: pointer;
        }

        .pinned .copyable:hover {
            color: var(--accent);
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

    function element(tag, className) {
        const el = document.createElement(tag);

        el.className = className;

        return el;
    }

    // -------------------------------------------------------------------------
    // Icons, built with DOM calls rather than innerHTML. Page CSS can't
    // reach into the shadow root, so plain presentation attributes are
    // enough for the paint.
    // -------------------------------------------------------------------------

    const svgNS = "http://www.w3.org/2000/svg";

    function icon(paths) {
        const svg = document.createElementNS(svgNS, "svg");

        const attributes = {
            viewBox: "0 0 24 24",
            width: "14",
            height: "14",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
        };

        for (const [name, value] of Object.entries(attributes)) {
            svg.setAttribute(name, value);
        }

        for (const d of paths) {
            const path = document.createElementNS(svgNS, "path");

            path.setAttribute("d", d);
            svg.append(path);
        }

        return svg;
    }

    function iconButton(label, paths, onClick) {
        const button = element("button", "icon-button");

        button.type = "button";
        button.title = label;
        button.setAttribute("aria-label", label);
        button.append(icon(paths));
        button.addEventListener("click", onClick);

        return button;
    }

    // -------------------------------------------------------------------------
    // Header actions and footer hints (actions only while pinned)
    // -------------------------------------------------------------------------

    // Two overlapping sheets, and a cross.
    const copyAllButton = iconButton(
        "Copy all",
        [
            "M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z",
            "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        ],
        () => copyText(copyAllText, "Copied all styles")
    );

    const closeButton = iconButton(
        "Close (Esc)",
        ["M18 6 6 18", "M6 6l12 12"],
        () => closeHandler?.()
    );

    const actions = element("div", "actions");

    actions.append(copyAllButton, closeButton);

    // A key and what it does, e.g. [Esc] close.
    function hint(key, text) {
        const node = element("span", "hint");
        const kbd = document.createElement("kbd");

        kbd.textContent = key;
        node.append(kbd, text);

        return node;
    }

    // Shift is already held while unpinned, so a plain click is all that's
    // left to pin.
    function footHints() {
        return pinned
            ? [
                hint("Click", "copy"),
                hint("↑↓←→", "walk"),
                hint("Alt", "measure"),
                hint("Esc", "close")
            ]
            : [hint("Click", "pin"), hint("Alt", "measure")];
    }

    const foot = element("div", "foot");

    function showHints() {
        foot.classList.remove("flash");
        foot.replaceChildren(...footHints());
    }

    function pin() {
        pinned = true;
        tooltip.classList.add("pinned");
        showHints();
    }

    function hide() {
        pinned = false;
        tooltip.classList.remove("pinned");
        tooltip.style.display = "none";
    }

    function onClose(handler) {
        closeHandler = handler;
    }

    // -------------------------------------------------------------------------
    // Copying
    // -------------------------------------------------------------------------

    let statusTimer = null;

    function flashStatus(message) {
        foot.textContent = message;
        foot.classList.add("flash");

        clearTimeout(statusTimer);
        statusTimer = setTimeout(showHints, 1200);
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

    /*
     * Shows `identity` (what the element is) in the header, `path` (its
     * place in the page) under it while pinned, and `nodes` in the body,
     * next to the pointer. A pinned tooltip is being redrawn, e.g. after a
     * setting changed in the popup or the arrow keys moved to another
     * element, so it stays put rather than jumping to where the pointer
     * left the page.
     */
    function show(nodes, allText, mouseX, mouseY, path, identity) {
        copyAllText = allText;

        const head = element("div", "head");
        const body = element("div", "body");

        head.append(identity, actions);
        body.append(...nodes);

        // A redraw mid-flash keeps the message.
        if (!foot.classList.contains("flash")) {
            showHints();
        }

        tooltip.replaceChildren(head, path, body, foot);
        tooltip.style.display = "flex";

        if (pinned) {
            keepInView();
        } else {
            position(mouseX, mouseY);
        }
    }

    // A plain message in place of the styles, e.g. a hint.
    function showMessage(text, mouseX, mouseY) {
        const message = element("div", "message");

        message.textContent = text;
        tooltip.replaceChildren(message);
        tooltip.style.display = "block";

        position(mouseX, mouseY);
    }

    Scope.tooltip = {
        isPinned: () => pinned,
        isVisible: () => tooltip.style.display !== "none",
        pin,
        hide,
        onClose,
        show,
        showMessage,
        position,
        fade,
        makeCopyable
    };
})(globalThis.Scope ??= {});
