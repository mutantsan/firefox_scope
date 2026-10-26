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
        overlays.hide();
        measure.hide();
    }

    // -------------------------------------------------------------------------
    // Inspection
    // -------------------------------------------------------------------------

    function inspectElement(el) {
        // Hovered first: measuring the normal state inserts clones.
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

        const showGap =
            styles.isGapContainer(normal.display) ||
            styles.isGapContainer(hover.display);

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

            if (property === "gap" && !showGap) {
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
            mouseY
        );

        inspectedElement = el;
        overlays.show(el);
    }

    // -------------------------------------------------------------------------
    // Mouse tracking
    // -------------------------------------------------------------------------

    /*
     * While Shift is held the tooltip follows the element under the cursor.
     * Inspecting clones the element, which is costly for large ones, so it
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
    const followInspected = () => {
        overlays.position(inspectedElement);
        measure.position();
    };

    document.addEventListener("scroll", followInspected, true);
    window.addEventListener("resize", followInspected);

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
})(globalThis.Scope ??= {});
