// Ties the modules together: what to inspect, input handling and settings.
(function (Scope) {
    "use strict";

    const {
        ui, tree, properties, styles, accessibility, render, tooltip, overlays,
        gaps, measure
    } = Scope;

    let enabled = true;
    let showDefaultValues = true;
    let showGaps = true;
    let hiddenProperties = properties.hiddenKeys();
    let storedHidden = [];
    let storedShown = [];
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
        gaps.hide();
        measure.hide();
    }

    tooltip.onClose(hideInspector);

    // -------------------------------------------------------------------------
    // Inspection
    // -------------------------------------------------------------------------

    // Rows worked out by Scope rather than read from CSS, and how each
    // value is drawn.
    const derivedRenderers = {
        contrast: render.marks,
        renderedFont: render.value,
        accessibleName: render.accessibleName,
        role: render.value,
        focusable: render.yesNo
    };

    // The popup's row key: the four border colors share one.
    function rowKey(property) {
        return styles.borderColorProperties.includes(property)
            ? "borderColor"
            : property;
    }

    const rowGroups = new Map(
        properties.propertyGroups.flatMap((group, groupIndex) =>
            group.keys.map((key, keyIndex) => [
                key,
                { title: group.title, order: groupIndex * 100 + keyIndex }
            ])
        )
    );

    function propertyGroup(property) {
        return rowGroups.get(rowKey(property));
    }

    function rowOrder(property) {
        return propertyGroup(property).order;
    }

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
            const key = rowKey(property);

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

        // Worked out by Scope rather than read from CSS, so they are left
        // out of "copy all".
        for (const key of ["contrast", "renderedFont"]) {
            if (!hiddenProperties.has(key)) {
                rows.push([key, normal[key], hover[key]]);
            }
        }

        // The same with or without hover, so only measured once.
        const a11yKeys = ["accessibleName", "role", "focusable"]
            .filter(key => !hiddenProperties.has(key));

        if (a11yKeys.length) {
            const a11y = accessibility.summary(el);

            for (const key of a11yKeys) {
                rows.push([key, a11y[key], a11y[key]]);
            }
        }

        const copyAllText = rows
            .filter(([property]) => !derivedRenderers[property])
            .map(([property, normalValue]) => styles.declaration(property, normalValue))
            .join("\n");

        // Grouped and ordered as the popup lists them. The sort is stable,
        // so the four border colors keep their order.
        rows.sort((a, b) => rowOrder(a[0]) - rowOrder(b[0]));

        const nodes = [];
        let currentGroup = null;

        for (const [property, normalValue, hoverValue] of rows) {
            const { title } = propertyGroup(property);

            if (title !== currentGroup) {
                currentGroup = title;
                nodes.push(render.group(title));
            }

            const derived = derivedRenderers[property];

            // Shown as CSS names, matching what a click copies.
            const label = derived
                ? properties.propertyLabel(property)
                : styles.toCssName(property);

            nodes.push(
                render.row(
                    label,
                    derived
                        ? `${label}: ${normalValue}`
                        : styles.declaration(property, normalValue),
                    normalValue,
                    hoverValue,
                    derived ?? render.value
                )
            );
        }

        tooltip.show(
            [
                render.props(nodes),
                ...(hiddenProperties.has("boxModel") ? [] : [render.boxModel(el)])
            ],
            copyAllText,
            mouseX,
            mouseY,
            render.path(el, walkTo),
            render.identity(el)
        );

        if (el !== inspectedElement) {
            observeInspected(el);
        }

        inspectedElement = el;
        overlays.show(el);

        if (showGaps) {
            gaps.show(el);
        } else {
            gaps.hide();
        }
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

    // A cross-origin sheet's copy arrives after the first inspection that
    // needed it, which fell back to a clone, so the values are measured
    // again with it.
    styles.onSheetLoaded(() => {
        if (tooltip.isVisible() && !altPressed && inspectedElement?.isConnected) {
            inspectElement(inspectedElement);
        }
    });

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

            const el = hoveredElement();

            if (
                shiftPressed &&
                !altPressed &&
                !tooltip.isPinned() &&
                el &&
                el !== inspectedElement
            ) {
                inspectElement(el);
            }
        });
    }

    /*
     * Moves over the tooltip arrive retargeted to the UI host, which isn't
     * part of the page. composedPath() reaches into open shadow roots, and
     * deepestAt() into closed ones. That costs a hit test per shadow root,
     * so a move only notes its target and point, and the element under
     * them is found when something needs it.
     */
    let hoverTarget = null;
    let hoverX = 0;
    let hoverY = 0;
    let hovered;

    function setHoverTarget(target, x, y) {
        hoverTarget = target;
        hoverX = x;
        hoverY = y;
        hovered = undefined;
    }

    function hoveredElement() {
        if (hovered === undefined) {
            hovered = hoverTarget && tree.deepestAt(hoverTarget, hoverX, hoverY);
        }

        return hovered;
    }

    document.addEventListener(
        "mousemove",
        event => {
            mouseX = event.clientX;
            mouseY = event.clientY;

            const target = event.composedPath()[0];

            if (
                target instanceof Element &&
                target !== ui.host
            ) {
                setHoverTarget(target, mouseX, mouseY);
            }

            if (altPressed) {
                measure.show(inspectedElement, hoveredElement());
            } else if (shiftPressed && !tooltip.isPinned()) {
                if (hoveredElement() !== inspectedElement) {
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

    // The sibling `offset` places away among the parent's rendered children.
    function sibling(el, offset) {
        const parent = tree.renderedParent(el);

        if (!parent) {
            return null;
        }

        const siblings = tree.renderedChildren(parent);
        const index = siblings.indexOf(el);

        return index < 0 ? null : siblings[index + offset] ?? null;
    }

    // ↑ parent, ↓ first child, ← and → siblings, as rendered: into shadow
    // roots and through slots, skipping elements without a box. Each
    // returns null at the end of the line.
    const walks = {
        ArrowUp: el => tree.renderedParent(el),
        ArrowDown: el => tree.renderedChildren(el)[0] ?? null,
        ArrowLeft: el => sibling(el, -1),
        ArrowRight: el => sibling(el, 1)
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
            isEditable(tree.focusedElement()) ||
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
            measure.show(inspectedElement, hoveredElement());
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

    // -------------------------------------------------------------------------
    // Frames: keys reach only the focused one
    // -------------------------------------------------------------------------

    /*
     * The pointer can be over one frame while another has focus, so Shift
     * and Alt are passed on to Scope in the tab's other frames, through the
     * background script so the page can't fake them. Only the frame under
     * the pointer has a hovered element, so only it inspects.
     */
    const frameKey = crypto.randomUUID();
    const sharedKeys = new Set(["Shift", "Alt"]);

    function hasOtherFrames() {
        return window !== window.top || window.frames.length > 0;
    }

    function shareKey(event) {
        if (
            event.relayed ||
            event.repeat ||
            !sharedKeys.has(event.key) ||
            !hasOtherFrames()
        ) {
            return;
        }

        browser.runtime.sendMessage({
            scopeKey: { type: event.type, key: event.key, from: frameKey }
        }).catch(() => {});
    }

    browser.runtime.onMessage.addListener(({ scopeKey }) => {
        if (!scopeKey || scopeKey.from === frameKey) {
            return;
        }

        // Stands in for the KeyboardEvent the handlers expect.
        const event = {
            type: scopeKey.type,
            key: scopeKey.key,
            repeat: false,
            relayed: true,
            preventDefault() {},
            stopPropagation() {}
        };

        if (event.type === "keydown") {
            onKeyDown(event);
        } else {
            onKeyUp(event);
        }
    });

    // Leaving the document, into a child frame or out of this one, means
    // nothing here is under the pointer any more. The frame it moves to
    // takes over, so an unpinned tooltip here is closed.
    document.addEventListener(
        "mouseout",
        event => {
            const to = event.relatedTarget;

            if (
                to &&
                !(to instanceof HTMLIFrameElement) &&
                !(to instanceof HTMLFrameElement)
            ) {
                return;
            }

            setHoverTarget(null, 0, 0);

            if (!tooltip.isPinned() && !altPressed) {
                hideInspector();
            }
        },
        true
    );

    // Pinning swallows the mousedown, which would have focused this frame,
    // so focus is moved here by hand for Esc, Shift and the arrows to reach
    // the pinned tooltip.
    function focusFrame() {
        window.focus();

        const focused = tree.focusedElement();

        if (
            focused instanceof HTMLIFrameElement ||
            focused instanceof HTMLFrameElement
        ) {
            focused.blur();
        }
    }

    // -------------------------------------------------------------------------
    // Keyboard handlers
    // -------------------------------------------------------------------------

    // Relayed presses come from another frame, which has already checked
    // its own text field.
    function onKeyDown(event) {
        const typing = !event.relayed && isEditable(tree.focusedElement());

        if (event.key !== "Shift" || !typing) {
            shareKey(event);
        }

        // Another frame may be measuring, and releasing Alt would open
        // Firefox's menu bar.
        if (event.key === "Alt" && shiftPressed) {
            event.preventDefault();
        }

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
        // field has focus.
        if (typing) {
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

        const el = hoveredElement();

        if (el) {
            inspectElement(el);
        }
    }

    function onKeyUp(event) {
        if (event.key === "Shift") {
            loaderShift = false;
        }

        shareKey(event);

        if (event.key === "Alt" && shiftPressed) {
            event.preventDefault();
        }

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
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);

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
                focusFrame();
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
        gaps.position();
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
        loaderShift = false;

        if (!tooltip.isPinned()) {
            hideInspector();
        }
    });

    /*
     * With "always ready", a loader ran here first and asked for Scope on
     * a Shift press. Its pointer position is taken over now. Shift is
     * picked up once the background script calls resume(), after Scope has
     * started in every frame, so pressing it reaches the others too.
     */
    let loaderShift = false;
    const handoff = Scope.loader?.stop();

    if (handoff) {
        mouseX = handoff.x;
        mouseY = handoff.y;
        loaderShift = handoff.shift;

        if (handoff.target?.isConnected) {
            setHoverTarget(handoff.target, handoff.x, handoff.y);
        }
    }

    async function resume() {
        await settingsLoaded;

        // Released while Scope was loading.
        if (!loaderShift) {
            return;
        }

        loaderShift = false;

        // Stands in for the press the loader saw.
        onKeyDown({
            type: "keydown",
            key: "Shift",
            repeat: false,
            preventDefault() {},
            stopPropagation() {}
        });
    }

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

    // The popup's name for the page in the tab: its hostname, or "file://"
    // for local files, which have none. A frame goes by the page around it
    // where Firefox tells it, so disabling a site covers its frames too.
    function siteName() {
        const ancestors = location.ancestorOrigins;
        const top = ancestors?.[ancestors.length - 1];
        const url = top && top !== "null" ? new URL(top) : location;

        return url.protocol === "file:" ? "file://" : url.hostname;
    }

    const site = siteName();

    // The toolbar popup stores site names in `disabledSites`. Listening for
    // changes lets the checkbox take effect without reloading the page.
    function applyDisabledSites(disabledSites = []) {
        enabled = !disabledSites.includes(site);

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

    function applyShowGaps(value = true) {
        showGaps = value;

        if (inspectedElement) {
            inspectElement(inspectedElement);
        }
    }

    // Row keys from Scope.properties that are unchecked in the popup,
    // stored as hidden or, for rows hidden by default, not stored as shown.
    function applyHiddenProperties(hidden = storedHidden, shown = storedShown) {
        storedHidden = hidden;
        storedShown = shown;
        hiddenProperties = properties.hiddenKeys(hidden, shown);

        if (inspectedElement) {
            inspectElement(inspectedElement);
        }
    }

    // resume() waits for these, so the first tooltip already has them.
    const settingsLoaded = browser.storage.local
        .get([
            "disabledSites", "showDefaultValues", "showGaps",
            "hiddenProperties", "shownProperties"
        ])
        .then(({
            disabledSites, showDefaultValues, showGaps, hiddenProperties, shownProperties
        }) => {
            applyDisabledSites(disabledSites);
            applyShowDefaultValues(showDefaultValues);
            applyShowGaps(showGaps);
            applyHiddenProperties(hiddenProperties, shownProperties);
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

        if (changes.showGaps) {
            applyShowGaps(changes.showGaps.newValue);
        }

        if (changes.hiddenProperties || changes.shownProperties) {
            applyHiddenProperties(
                changes.hiddenProperties ? changes.hiddenProperties.newValue ?? [] : storedHidden,
                changes.shownProperties ? changes.shownProperties.newValue ?? [] : storedShown
            );
        }
    });

    // Its presence also tells Scope.injection that the page runs Scope.
    Scope.inspector = { announceReady, resume };
})(globalThis.Scope ??= {});
