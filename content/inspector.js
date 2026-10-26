// Ties the modules together: what to inspect, input handling and settings.
(function (Scope) {
    "use strict";

    const { ui, properties, styles, render, tooltip, overlays, measure } = Scope;

    let enabled = true;
    let showDefaultValues = true;
    let hiddenProperties = new Set();
    let hoveredElement = null;
    let inspectedElement = null;
    let shiftPressed = false;
    let altPressed = false;
    let swallowNextClick = false;
    let mouseX = 0;
    let mouseY = 0;

    function hideInspector() {
        tooltip.hide();

        inspectedElement = null;
        observeInspected(null);
        overlays.hide();
        measure.hide();
    }

    // -------------------------------------------------------------------------
    // Inspection
    // -------------------------------------------------------------------------

    function inspectElement(el) {
        // Hovered first: measuring the normal state changes the page.
        const hover = styles.getStyles(el);
        const normal = styles.getNormalStyles(el, hover);

        const normalBordersCollapsed =
            styles.collapseBorderColors(normal);

        const hoverBordersCollapsed =
            styles.collapseBorderColors(hover);

        const collapseBorders =
            normalBordersCollapsed &&
            hoverBordersCollapsed;

        const rows = [];

        styles.properties.forEach(property => {
            const key = styles.borderColorProperties.includes(property)
                ? "borderColor"
                : property;

            if (hiddenProperties.has(key)) {
                return;
            }

            // A shorthand computes to "" when it can't be written as one
            // value, e.g. border when the sides differ. The box model
            // diagram and the color rows still show each side.
            if (!normal[property] && !hover[property]) {
                return;
            }

            if (!styles.isRelevant(property, normal, hover)) {
                return;
            }

            if (
                property === "outlineColor" &&
                !normal.hasOutline &&
                !hover.hasOutline
            ) {
                return;
            }

            if (
                !showDefaultValues &&
                styles.isDefault(property, normal[property]) &&
                styles.isDefault(property, hover[property])
            ) {
                return;
            }

            if (
                collapseBorders &&
                styles.borderColorProperties.includes(property)
            ) {
                if (property !== "borderTopColor") {
                    return;
                }

                rows.push([
                    "borderColor",
                    normal.borderTopColor,
                    hover.borderTopColor
                ]);

                return;
            }

            rows.push([
                property,
                normal[property],
                hover[property]
            ]);
        });

        // Shown as CSS names, matching what a click copies.
        const propertyWidth = Math.max(
            ...rows.map(row => styles.toCssName(row[0]).length)
        );

        const lines = rows.map(([property, normalValue, hoverValue]) => {
            const cssName = styles.toCssName(property);

            return render.row(
                cssName.padEnd(propertyWidth),
                styles.declaration(property, normalValue),
                normalValue,
                hoverValue,
                render.value
            );
        });

        const copyAllText = rows
            .map(([property, normalValue]) => styles.declaration(property, normalValue))
            .join("\n");

        // Worked out by Scope rather than read from CSS, so they get their
        // own section and are left out of "copy all".
        const derived = render.section();

        const derivedRows = [
            ["contrast", render.marks],
            ["renderedFont", render.value]
        ]
            .filter(([key]) => !hiddenProperties.has(key))
            .map(([key, renderValue]) => [properties.propertyLabel(key), key, renderValue]);

        const labelWidth = Math.max(...derivedRows.map(([label]) => label.length));

        for (const [label, key, renderValue] of derivedRows) {
            derived.append(
                render.row(
                    label.padEnd(labelWidth),
                    `${label}: ${normal[key]}`,
                    normal[key],
                    hover[key],
                    renderValue
                )
            );
        }

        const attributes = render.attributes(el);

        tooltip.show(
            [
                ...lines,
                ...(derivedRows.length ? [derived] : []),
                ...(attributes ? [attributes] : []),
                render.boxModel(el)
            ],
            copyAllText,
            mouseX,
            mouseY,
            render.path(el, walkTo)
        );

        if (el !== inspectedElement) {
            observeInspected(el);
        }

        inspectedElement = el;
        overlays.show(el);
    }

    // Follows the inspected element when it changes size without a scroll
    // or resize, e.g. an accordion opening under a pinned tooltip. The
    // callback runs after layout and before paint, so it positions straight
    // away. followInspected is hoisted from the scroll section below.
    const resizeObserver = new ResizeObserver(() => followInspected());

    function observeInspected(el) {
        resizeObserver.disconnect();

        if (el) {
            resizeObserver.observe(el);
        }
    }

    // -------------------------------------------------------------------------
    // Mouse tracking
    // -------------------------------------------------------------------------

    /*
     * While Shift is held the tooltip follows the element under the cursor.
     * Inspecting restyles the page, which is costly on large ones, so it
     * runs at most once per frame and only when the element changes.
     */
    let reinspectFrame = null;

    function scheduleReinspect() {
        if (reinspectFrame) {
            return;
        }

        reinspectFrame = requestAnimationFrame(() => {
            reinspectFrame = null;

            if (
                shiftPressed &&
                !altPressed &&
                !tooltip.isPinned() &&
                hoveredElement &&
                hoveredElement !== inspectedElement
            ) {
                inspectElement(hoveredElement);
            }
        });
    }

    // Moves over the tooltip arrive retargeted to the UI host, which isn't
    // part of the page.
    document.addEventListener(
        "mousemove",
        event => {
            mouseX = event.clientX;
            mouseY = event.clientY;

            if (
                event.target instanceof Element &&
                event.target !== ui.host
            ) {
                hoveredElement = event.target;
            }

            if (altPressed) {
                measure.show(inspectedElement, hoveredElement);
            } else if (shiftPressed && !tooltip.isPinned()) {
                if (hoveredElement !== inspectedElement) {
                    scheduleReinspect();
                } else if (tooltip.isVisible()) {
                    tooltip.position(mouseX, mouseY);
                }
            }
        },
        true
    );

    // -------------------------------------------------------------------------
    // Keyboard: arrows walk the DOM while pinned
    // -------------------------------------------------------------------------

    // Elements without a box, e.g. <script> or display: none, have nothing
    // to show, and the UI host isn't part of the page.
    function hasBox(el) {
        return el !== ui.host && el.getClientRects().length > 0;
    }

    function nextWithBox(el, step) {
        while (el && !hasBox(el)) {
            el = step(el);
        }

        return el;
    }

    // ↑ parent, ↓ first child, ← and → siblings. Each returns null at the
    // end of the line.
    const walks = {
        ArrowUp: el => nextWithBox(el.parentElement, e => e.parentElement),
        ArrowDown: el => nextWithBox(el.firstElementChild, e => e.nextElementSibling),
        ArrowLeft: el => nextWithBox(el.previousElementSibling, e => e.previousElementSibling),
        ArrowRight: el => nextWithBox(el.nextElementSibling, e => e.nextElementSibling)
    };

    // Scrolls an element that is entirely out of view back into it, so the
    // focus border stays visible. One partly in view is left where it is.
    function walkTo(el) {
        const rect = el.getBoundingClientRect();

        if (
            rect.bottom < 0 ||
            rect.right < 0 ||
            rect.top > window.innerHeight ||
            rect.left > window.innerWidth
        ) {
            el.scrollIntoView({ block: "nearest", inline: "nearest" });
        }

        inspectElement(el);
    }

    // Arrows with a modifier, or in a text field, keep their usual meaning,
    // e.g. Alt+← goes back in history.
    function walk(event) {
        const step = walks[event.key];

        if (
            !step ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            isEditable(event.composedPath()[0]) ||
            !inspectedElement?.isConnected
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const next = step(inspectedElement);

        if (next) {
            walkTo(next);
        }
    }

    // -------------------------------------------------------------------------
    // Keyboard: Alt measures
    // -------------------------------------------------------------------------

    /*
     * Holding Alt keeps the inspected element, pinned or not, and measures
     * from it to the element under the cursor. Alt's default is cancelled so
     * releasing it doesn't open Firefox's menu bar.
     */
    function startMeasuring(event) {
        if (event.key !== "Alt" || !inspectedElement) {
            return false;
        }

        event.preventDefault();

        if (!altPressed) {
            altPressed = true;
            tooltip.fade(true);
            measure.show(inspectedElement, hoveredElement);
        }

        return true;
    }

    function stopMeasuring() {
        altPressed = false;
        tooltip.fade(false);
        measure.hide();
    }

    // -------------------------------------------------------------------------
    // Keyboard: Shift inspects
    // -------------------------------------------------------------------------

    // Input types that don't take typed text, so Shift there isn't typing.
    const nonTextInputs = new Set([
        "button", "checkbox", "color", "file", "image",
        "radio", "range", "reset", "submit"
    ]);

    function isEditable(target) {
        if (!(target instanceof Element)) {
            return false;
        }

        if (target instanceof HTMLInputElement) {
            return !nonTextInputs.has(target.type);
        }

        return (
            target instanceof HTMLTextAreaElement ||
            target.isContentEditable
        );
    }

    // Holding Shift alone in a text field for a moment looks like an attempt
    // to inspect rather than typing, so explain why nothing happens.
    const editableHintDelay = 600;
    let editableHintTimer = null;

    function cancelEditableHint() {
        clearTimeout(editableHintTimer);
        editableHintTimer = null;
    }

    function showEditableHint() {
        editableHintTimer = null;

        tooltip.showMessage(
            "Scope is paused while typing. Click outside the field to inspect.",
            mouseX,
            mouseY
        );
    }

    document.addEventListener(
        "keydown",
        event => {
            if (!enabled || startMeasuring(event)) {
                return;
            }

            if (tooltip.isPinned()) {
                // Esc or a fresh Shift press closes the pinned tooltip.
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    hideInspector();
                } else if (event.key === "Shift" && !shiftPressed) {
                    shiftPressed = true;
                    hideInspector();
                } else {
                    walk(event);
                }

                return;
            }

            // Shift is part of normal typing, so don't inspect while a text
            // field has focus. composedPath() reaches into shadow DOM.
            if (isEditable(event.composedPath()[0])) {
                if (event.key !== "Shift") {
                    cancelEditableHint();
                } else if (!editableHintTimer && !event.repeat) {
                    editableHintTimer = setTimeout(
                        showEditableHint,
                        editableHintDelay
                    );
                }

                return;
            }

            if (
                event.key !== "Shift" ||
                shiftPressed
            ) {
                return;
            }

            shiftPressed = true;

            if (hoveredElement) {
                inspectElement(hoveredElement);
            }
        },
        true
    );

    document.addEventListener(
        "keyup",
        event => {
            if (event.key === "Alt" && altPressed) {
                event.preventDefault();
                stopMeasuring();

                // Back to following the cursor if Shift is still held.
                if (shiftPressed) {
                    scheduleReinspect();
                }

                return;
            }

            if (event.key !== "Shift") {
                return;
            }

            cancelEditableHint();
            shiftPressed = false;

            if (!tooltip.isPinned()) {
                hideInspector();
            }
        },
        true
    );

    // -------------------------------------------------------------------------
    // Shift+click pins, click outside closes a pinned tooltip
    // -------------------------------------------------------------------------

    // Both clicks are swallowed so they don't also hit the page, e.g. a
    // Shift+click opening a link in a new window.
    window.addEventListener(
        "mousedown",
        event => {
            if (
                !tooltip.isPinned() &&
                shiftPressed &&
                inspectedElement &&
                event.button === 0
            ) {
                event.preventDefault();
                event.stopPropagation();

                swallowNextClick = true;
                tooltip.pin();
                return;
            }

            // A click inside the tooltip arrives retargeted to the UI host.
            if (!tooltip.isPinned() || event.target === ui.host) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            swallowNextClick = true;
            hideInspector();
        },
        true
    );

    window.addEventListener(
        "click",
        event => {
            if (!swallowNextClick) {
                return;
            }

            swallowNextClick = false;

            event.preventDefault();
            event.stopPropagation();
        },
        true
    );

    // Keep the focus border on the element while the page scrolls or
    // resizes. Capture phase catches scrolling inside nested containers.
    // Positioning reads computed styles and layout, so it runs at most once
    // per frame, however many scroll events arrive.
    function followInspected() {
        overlays.position(inspectedElement);
        measure.position();
    }

    let followFrame = null;

    function scheduleFollow() {
        if (followFrame) {
            return;
        }

        followFrame = requestAnimationFrame(() => {
            followFrame = null;
            followInspected();
        });
    }

    document.addEventListener("scroll", scheduleFollow, {
        capture: true,
        passive: true
    });
    window.addEventListener("resize", scheduleFollow);

    // Prevent the tooltip from getting stuck if the window loses focus
    // while Shift is held. A pinned tooltip is meant to stay, so keep it.
    window.addEventListener("blur", () => {
        cancelEditableHint();
        stopMeasuring();
        shiftPressed = false;

        if (!tooltip.isPinned()) {
            hideInspector();
        }
    });

    // Confirms that the keyboard shortcut started Scope, unless the tooltip
    // is already in use.
    let readyTimer = null;

    function announceReady() {
        if (tooltip.isVisible()) {
            return;
        }

        tooltip.showMessage(
            "Scope is ready. Hold Shift over an element to inspect it.",
            0,
            0
        );

        clearTimeout(readyTimer);

        readyTimer = setTimeout(() => {
            if (!inspectedElement) {
                tooltip.hide();
            }
        }, 2500);
    }

    // -------------------------------------------------------------------------
    // Settings
    // -------------------------------------------------------------------------

    // The toolbar popup stores hostnames in `disabledSites`. Listening for
    // changes lets the checkbox take effect without reloading the page.
    function applyDisabledSites(disabledSites = []) {
        enabled = !disabledSites.includes(location.hostname);

        if (!enabled) {
            hideInspector();
        }
    }

    // Re-renders an open tooltip, which is usually pinned while the popup
    // is used to change the setting.
    function applyShowDefaultValues(value = true) {
        showDefaultValues = value;

        if (inspectedElement) {
            inspectElement(inspectedElement);
        }
    }

    // Row keys from Scope.properties that are unchecked in the popup.
    function applyHiddenProperties(keys = []) {
        hiddenProperties = new Set(keys);

        if (inspectedElement) {
            inspectElement(inspectedElement);
        }
    }

    browser.storage.local
        .get(["disabledSites", "showDefaultValues", "hiddenProperties"])
        .then(({ disabledSites, showDefaultValues, hiddenProperties }) => {
            applyDisabledSites(disabledSites);
            applyShowDefaultValues(showDefaultValues);
            applyHiddenProperties(hiddenProperties);
        });

    browser.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") {
            return;
        }

        if (changes.disabledSites) {
            applyDisabledSites(changes.disabledSites.newValue);
        }

        if (changes.showDefaultValues) {
            applyShowDefaultValues(changes.showDefaultValues.newValue);
        }

        if (changes.hiddenProperties) {
            applyHiddenProperties(changes.hiddenProperties.newValue);
        }
    });

    // Its presence also tells Scope.injection that the page runs Scope.
    Scope.inspector = { announceReady };
})(globalThis.Scope ??= {});
