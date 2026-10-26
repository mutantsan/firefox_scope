(function () {
    "use strict";

    const properties = [
        "color",
        "backgroundColor",
        "borderTopColor",
        "borderRightColor",
        "borderBottomColor",
        "borderLeftColor",
        "outlineColor",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "margin",
        "padding",
        "width",
        "height",
        "display",
        "position",
        "border",
        "borderRadius",
        "opacity"
    ];

    const borderColorProperties = [
        "borderTopColor",
        "borderRightColor",
        "borderBottomColor",
        "borderLeftColor"
    ];

    let enabled = true;
    let hoveredElement = null;
    let inspectedElement = null;
    let shiftPressed = false;
    let mouseX = 0;
    let mouseY = 0;

    // -------------------------------------------------------------------------
    // Tooltip
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Focus border
    // -------------------------------------------------------------------------

    /*
     * Drawn as a separate overlay instead of styling the inspected element
     * itself, so it doesn't change the computed styles being reported.
     */
    const highlight = document.createElement("div");

    Object.assign(highlight.style, {
        position: "fixed",
        zIndex: "2147483646",
        display: "none",

        boxSizing: "border-box",
        outline: "2px solid #3b9eff",
        background: "rgba(59, 158, 255, 0.12)",

        pointerEvents: "none"
    });

    document.documentElement.appendChild(highlight);

    function positionHighlight() {
        if (!inspectedElement) {
            return;
        }

        const rect = inspectedElement.getBoundingClientRect();

        Object.assign(highlight.style, {
            left: rect.left + "px",
            top: rect.top + "px",
            width: rect.width + "px",
            height: rect.height + "px"
        });
    }

    function hideInspector() {
        inspectedElement = null;
        tooltip.style.display = "none";
        highlight.style.display = "none";
    }

    // -------------------------------------------------------------------------
    // Color conversion
    // -------------------------------------------------------------------------

    function toHexColor(value) {
        const match = value.match(
            /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i
        );

        if (!match) {
            return value;
        }

        const r = Number(match[1]);
        const g = Number(match[2]);
        const b = Number(match[3]);
        const alpha = match[4];

        const hex = [r, g, b]
            .map(n =>
                Math.round(n)
                    .toString(16)
                    .padStart(2, "0")
            )
            .join("");

        if (alpha === undefined) {
            return "#" + hex;
        }

        const a = alpha.endsWith("%")
            ? Number(alpha.slice(0, -1)) / 100
            : Number(alpha);

        if (a >= 1) {
            return "#" + hex;
        }

        const alphaHex = Math.round(
            Math.max(0, Math.min(1, a)) * 255
        )
            .toString(16)
            .padStart(2, "0");

        return "#" + hex + alphaHex;
    }

    function formatValue(property, value) {
        // Direct color properties.
        if (property.toLowerCase().includes("color")) {
            return toHexColor(value);
        }

        // Composite border value:
        //
        // 1px solid rgb(222, 226, 230)
        //
        // becomes:
        //
        // 1px solid #dee2e6
        if (property === "border") {
            return value.replace(
                /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*[,/]\s*[\d.]+%?)?\s*\)/gi,
                match => toHexColor(match)
            );
        }

        return value;
    }

    // -------------------------------------------------------------------------
    // Style collection
    // -------------------------------------------------------------------------

    function getStyles(el) {
        const computed = window.getComputedStyle(el);
        const result = {};

        properties.forEach(property => {
            result[property] = formatValue(
                property,
                computed[property]
            );
        });

        return result;
    }

    /*
     * Get approximately the non-hovered state by cloning the element.
     *
     * A freshly inserted clone isn't in the pointer's hover chain, so
     * :hover does not apply to it. It is placed right after the original
     * with no layout overrides, so position, display and size come out as
     * the page styles them. It's removed before the next paint, so the
     * page never visibly shifts.
     */
    function getNormalStyles(el) {
        const clone = el.cloneNode(true);

        Object.assign(clone.style, {
            visibility: "hidden",
            pointerEvents: "none"
        });

        el.after(clone);

        const styles = getStyles(clone);

        clone.remove();

        return styles;
    }

    // -------------------------------------------------------------------------
    // Border collapsing
    // -------------------------------------------------------------------------

    function collapseBorderColors(styles) {
        const colors = borderColorProperties.map(
            property => styles[property]
        );

        return colors.every(
            color => color === colors[0]
        );
    }

    // -------------------------------------------------------------------------
    // HTML helpers
    // -------------------------------------------------------------------------

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }

    function getHexColor(value) {
        const match = value.match(
            /#[0-9a-f]{6}(?:[0-9a-f]{2})?/i
        );

        return match ? match[0] : null;
    }

    function colorSwatch(value) {
        const color = getHexColor(value);

        if (!color) {
            return "";
        }

        // Kept on one line: the tooltip uses white-space: pre, so any
        // newlines or indentation here would be rendered.
        const style = [
            "display: inline-block",
            "width: 10px",
            "height: 10px",
            "margin-left: 5px",
            "border: 1px solid #888",
            "border-radius: 2px",
            `background: ${color}`,
            "vertical-align: -1px"
        ].join("; ");

        return `<span style="${style}"></span>`;
    }

    function renderValue(value) {
        return (
            escapeHtml(value) +
            colorSwatch(value)
        );
    }

    // -------------------------------------------------------------------------
    // Inspection
    // -------------------------------------------------------------------------

    function inspectElement(el) {
        const normal = getNormalStyles(el);
        const hover = getStyles(el);

        const normalBordersCollapsed =
            collapseBorderColors(normal);

        const hoverBordersCollapsed =
            collapseBorderColors(hover);

        const collapseBorders =
            normalBordersCollapsed &&
            hoverBordersCollapsed;

        const rows = [];

        properties.forEach(property => {
            if (
                collapseBorders &&
                borderColorProperties.includes(property)
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

        const propertyWidth = Math.max(
            ...rows.map(row => row[0].length)
        );

        const lines = rows.map(
            ([property, normalValue, hoverValue]) => {
                const name = escapeHtml(
                    property.padEnd(propertyWidth)
                );

                const normalRendered =
                    renderValue(normalValue);

                if (normalValue !== hoverValue) {
                    const hoverRendered =
                        renderValue(hoverValue);

                    return (
                        `<div>${name}  ` +
                        `${normalRendered}  ` +
                        `<span style="color:#888">→</span>  ` +
                        `${hoverRendered}</div>`
                    );
                }

                return (
                    `<div>${name}  ` +
                    `${normalRendered}</div>`
                );
            }
        );

        tooltip.innerHTML = lines.join("");

        tooltip.style.display = "block";

        positionTooltip();

        inspectedElement = el;
        highlight.style.display = "block";

        positionHighlight();
    }

    // -------------------------------------------------------------------------
    // Tooltip positioning
    // -------------------------------------------------------------------------

    function positionTooltip() {
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
    // Mouse tracking
    // -------------------------------------------------------------------------

    document.addEventListener(
        "mousemove",
        event => {
            mouseX = event.clientX;
            mouseY = event.clientY;

            if (
                event.target instanceof Element &&
                event.target !== tooltip &&
                event.target !== highlight
            ) {
                hoveredElement = event.target;
            }

            if (
                shiftPressed &&
                tooltip.style.display !== "none"
            ) {
                positionTooltip();
            }
        },
        true
    );

    // -------------------------------------------------------------------------
    // Shift
    // -------------------------------------------------------------------------

    document.addEventListener(
        "keydown",
        event => {
            if (
                !enabled ||
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
            if (event.key !== "Shift") {
                return;
            }

            shiftPressed = false;
            hideInspector();
        },
        true
    );

    // Keep the focus border on the element while the page scrolls or
    // resizes. Capture phase catches scrolling inside nested containers.
    document.addEventListener("scroll", positionHighlight, true);
    window.addEventListener("resize", positionHighlight);

    // Prevent the tooltip from getting stuck if the window loses focus
    // while Shift is held.
    window.addEventListener("blur", () => {
        shiftPressed = false;
        hideInspector();
    });

    // -------------------------------------------------------------------------
    // Per-site disable
    // -------------------------------------------------------------------------

    // The toolbar popup stores hostnames in `disabledSites`. Listening for
    // changes lets the checkbox take effect without reloading the page.
    function applyDisabledSites(disabledSites = []) {
        enabled = !disabledSites.includes(location.hostname);

        if (!enabled) {
            hideInspector();
        }
    }

    browser.storage.local
        .get("disabledSites")
        .then(({ disabledSites }) => applyDisabledSites(disabledSites));

    browser.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.disabledSites) {
            applyDisabledSites(changes.disabledSites.newValue);
        }
    });

})();
