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

    // Rows computed by Scope rather than read from CSS, so they're left out
    // of "copy all" and aren't copied as declarations.
    const derivedRows = new Set(["contrast"]);

    let enabled = true;
    let hoveredElement = null;
    let inspectedElement = null;
    let shiftPressed = false;
    let pinned = false;
    let swallowNextClick = false;
    let currentRows = [];
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
        const css = currentRows
            .filter(([property]) => !derivedRows.has(property))
            .map(([property, normalValue]) => declaration(property, normalValue))
            .join("\n");

        copyText(css, "Copied all styles");
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

    // -------------------------------------------------------------------------
    // Copying
    // -------------------------------------------------------------------------

    function toCssName(property) {
        return property.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
    }

    function declaration(property, value) {
        return `${toCssName(property)}: ${value};`;
    }

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
    // Focus border
    // -------------------------------------------------------------------------

    /*
     * Drawn as a separate overlay instead of styling the inspected element
     * itself, so it doesn't change the computed styles being reported.
     */
    /*
     * The box model is shaded with Firefox DevTools' highlighter colors, also
     * used by the tooltip's diagram.
     * Each region is drawn as an overlay's border, sized to match the
     * element's own widths: the margin overlay surrounds the border box, the
     * highlight's border covers the element's border, and an inner overlay's
     * border covers the padding, with the content as its background.
     */
    const marginOverlay = document.createElement("div");

    Object.assign(marginOverlay.style, {
        position: "fixed",
        zIndex: "2147483646",
        display: "none",

        boxSizing: "content-box",
        borderStyle: "solid",
        borderColor: "rgba(237, 255, 100, 0.6)",

        pointerEvents: "none"
    });

    const highlight = document.createElement("div");

    Object.assign(highlight.style, {
        position: "fixed",
        zIndex: "2147483646",
        display: "none",

        boxSizing: "border-box",
        borderStyle: "solid",
        borderColor: "rgba(68, 68, 68, 0.6)",

        pointerEvents: "none"
    });

    const paddingOverlay = document.createElement("div");

    Object.assign(paddingOverlay.style, {
        position: "absolute",
        inset: "0",

        boxSizing: "border-box",
        borderStyle: "solid",
        borderColor: "rgba(106, 90, 205, 0.6)",
        background: "rgba(137, 206, 235, 0.6)",
        backgroundClip: "padding-box"
    });

    highlight.append(paddingOverlay);

    // Dashed guides along the border box's edges, spanning the viewport,
    // like DevTools' highlighter: top, right, bottom, left.
    const guides = [0, 1, 2, 3].map(i => {
        const guide = document.createElement("div");
        const horizontal = i % 2 === 0;

        Object.assign(guide.style, {
            position: "fixed",
            zIndex: "2147483646",
            display: "none",

            left: horizontal ? "0" : "",
            top: horizontal ? "" : "0",
            width: horizontal ? "100%" : "0",
            height: horizontal ? "0" : "100%",
            [horizontal ? "borderTop" : "borderLeft"]: "1px dashed #0099cc",

            pointerEvents: "none"
        });

        return guide;
    });

    document.documentElement.append(marginOverlay, highlight, ...guides);

    function setOverlaysDisplay(display) {
        for (const overlay of [marginOverlay, highlight, ...guides]) {
            overlay.style.display = display;
        }
    }

    // Border widths can't be negative, so negative margins aren't shaded.
    function sideWidths(computed, side) {
        return boxSides
            .map(s => Math.max(0, parseFloat(computed.getPropertyValue(side(s))) || 0) + "px")
            .join(" ");
    }

    function positionHighlight() {
        if (!inspectedElement) {
            return;
        }

        const rect = inspectedElement.getBoundingClientRect();
        const computed = window.getComputedStyle(inspectedElement);

        const [margin, border, padding] = boxLayers.map(
            ({ side }) => sideWidths(computed, side)
        );

        const [marginTop, , , marginLeft] = margin.split(" ").map(parseFloat);

        Object.assign(highlight.style, {
            left: rect.left + "px",
            top: rect.top + "px",
            width: rect.width + "px",
            height: rect.height + "px",
            borderWidth: border
        });

        paddingOverlay.style.borderWidth = padding;

        const [guideTop, guideRight, guideBottom, guideLeft] = guides;

        guideTop.style.top = rect.top + "px";
        guideBottom.style.top = rect.bottom - 1 + "px";
        guideLeft.style.left = rect.left + "px";
        guideRight.style.left = rect.right - 1 + "px";

        Object.assign(marginOverlay.style, {
            left: rect.left - marginLeft + "px",
            top: rect.top - marginTop + "px",
            width: rect.width + "px",
            height: rect.height + "px",
            borderWidth: margin
        });
    }

    function hideInspector() {
        pinned = false;

        Object.assign(tooltip.style, {
            pointerEvents: "none",
            userSelect: "",
            borderColor: "#555"
        });

        pinBar.style.display = "none";
        pinTip.style.display = "";

        inspectedElement = null;
        tooltip.style.display = "none";
        setOverlaysDisplay("none");
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
    // Contrast (WCAG 2)
    // -------------------------------------------------------------------------

    function parseColor(value) {
        const match = value.match(
            /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i
        );

        if (!match) {
            return null;
        }

        let alpha = match[4] === undefined ? 1 : Number(match[4]);

        if (match[5]) {
            alpha /= 100;
        }

        return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
    }

    // Source-over compositing of `top` onto an opaque `bottom`.
    function blend(top, bottom) {
        const a = top[3];

        return [0, 1, 2]
            .map(i => top[i] * a + bottom[i] * (1 - a))
            .concat(1);
    }

    function luminance([r, g, b]) {
        const [lr, lg, lb] = [r, g, b].map(channel => {
            const c = channel / 255;

            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });

        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    }

    function parentOf(el) {
        // Step out of shadow roots to the host element.
        return el.parentElement || el.getRootNode().host || null;
    }

    /*
     * The background the text actually sits on: walk up until an opaque
     * background color, blending translucent ones on the way, and fall back
     * to white like the browser canvas. A background image or gradient on
     * the way makes the result a guess, so return a reason instead.
     */
    function effectiveBackground(el, computed) {
        const layers = [];

        for (let node = el; node; node = parentOf(node)) {
            const style = node === el ? computed : window.getComputedStyle(node);

            if (style.backgroundImage !== "none") {
                return { reason: "background image" };
            }

            const color = parseColor(style.backgroundColor);

            if (!color) {
                return { reason: "unsupported color" };
            }

            if (color[3] > 0) {
                layers.push(color);
            }

            if (color[3] >= 1) {
                break;
            }
        }

        let background = [255, 255, 255, 1];

        for (const layer of layers.reverse()) {
            background = blend(layer, background);
        }

        return { color: background };
    }

    // Large text per WCAG: 18pt (24px), or 14pt (18.66px) when bold.
    function isLargeText(computed) {
        const size = parseFloat(computed.fontSize);

        return size >= 24 || (size >= 18.66 && Number(computed.fontWeight) >= 700);
    }

    function contrastSummary(el, computed) {
        const background = effectiveBackground(el, computed);

        if (!background.color) {
            return `unknown (${background.reason})`;
        }

        const text = parseColor(computed.color);

        if (!text) {
            return "unknown (unsupported color)";
        }

        const [light, dark] = [
            luminance(blend(text, background.color)),
            luminance(background.color)
        ].sort((a, b) => b - a);

        const ratio = (light + 0.05) / (dark + 0.05);
        const large = isLargeText(computed);

        // Truncated, not rounded, so 4.499 never displays as passing 4.5.
        const shown = Math.floor(ratio * 100) / 100;
        const mark = min => (ratio >= min ? "✓" : "✗");

        return (
            `${shown}:1  AA ${mark(large ? 3 : 4.5)}  AAA ${mark(large ? 4.5 : 7)}` +
            (large ? "  large text" : "")
        );
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

        result.contrast = contrastSummary(el, computed);

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
    // DOM helpers
    // -------------------------------------------------------------------------

    function getHexColor(value) {
        const match = value.match(
            /#[0-9a-f]{6}(?:[0-9a-f]{2})?/i
        );

        return match ? match[0] : null;
    }

    function colorSwatch(value) {
        const color = getHexColor(value);

        if (!color) {
            return null;
        }

        const swatch = document.createElement("span");

        Object.assign(swatch.style, {
            display: "inline-block",
            width: "10px",
            height: "10px",
            marginLeft: "5px",
            border: "1px solid #888",
            borderRadius: "2px",
            background: color,
            verticalAlign: "-1px"
        });

        return swatch;
    }

    // Built as nodes rather than markup, so page-derived values are always
    // inserted as plain text.
    function renderValue(value) {
        const node = document.createElement("span");
        const swatch = colorSwatch(value);

        node.append(value);

        if (swatch) {
            node.append(swatch);
        }

        makeCopyable(node, value);

        return node;
    }

    // Colors pass and fail marks, e.g. in "4.52:1  AA ✓  AAA ✗".
    function renderMarks(value) {
        const node = document.createElement("span");

        for (const part of value.split(/([✓✗])/)) {
            if (part === "✓" || part === "✗") {
                const mark = document.createElement("span");

                mark.textContent = part;
                mark.style.color = part === "✓" ? "#93c47d" : "#e06666";
                node.append(mark);
            } else {
                node.append(part);
            }
        }

        makeCopyable(node, value);

        return node;
    }

    // -------------------------------------------------------------------------
    // Box model diagram
    // -------------------------------------------------------------------------

    const boxLayers = [
        // Solid fills rather than translucent tints, which would compound
        // as the layers nest. The border is a solid line, like DevTools, so
        // it reads as the element's edge rather than another spacing area.
        { name: "margin", tint: "#edff64", fill: "#33361a", line: "1px dashed", side: s => `margin-${s}` },
        { name: "border", tint: "#aaaaaa", fill: "#2a2a2a", line: "2px solid", side: s => `border-${s}-width` },
        { name: "padding", tint: "#a99eff", fill: "#26213f", line: "1px dashed", side: s => `padding-${s}` }
    ];

    const boxSides = ["top", "right", "bottom", "left"];

    function round(n) {
        return Math.round(n * 100) / 100;
    }

    // Zero sides are shown as a dash, like DevTools, so the non-zero ones
    // stand out.
    function boxValue(px) {
        const node = document.createElement("span");
        const value = round(px);

        node.textContent = value === 0 ? "–" : String(value);

        if (value !== 0) {
            makeCopyable(node, value + "px");
        } else {
            node.style.color = "#777";
        }

        return node;
    }

    function boxLayer({ name: label, tint, fill, line }, sides, inner) {
        const layer = document.createElement("div");

        Object.assign(layer.style, {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",

            margin: "0",
            padding: "0 6px",
            minWidth: "0",

            border: `${line} ${tint}`,
            borderRadius: "3px",
            background: fill,

            lineHeight: "1.5",
            whiteSpace: "nowrap"
        });

        const name = document.createElement("span");

        name.textContent = label;

        Object.assign(name.style, {
            justifySelf: "start",
            color: tint,
            fontSize: "10px"
        });

        // Label on the left, value centered: equal 1fr columns either side
        // keep the value centered without the two overlapping.
        const top = document.createElement("div");

        Object.assign(top.style, {
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: "6px",
            alignSelf: "stretch"
        });

        top.append(name, boxValue(sides[0]), document.createElement("span"));

        const middle = document.createElement("div");

        Object.assign(middle.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px"
        });

        middle.append(boxValue(sides[3]), inner, boxValue(sides[1]));
        layer.append(top, middle, boxValue(sides[2]));

        return layer;
    }

    /*
     * Margin, border and padding nested like DevTools' box model view. Uses
     * the live (hovered) values, matching the focus border on the page.
     * The content size comes from the rendered box rather than the computed
     * width/height, which can be `auto` or include padding (border-box).
     */
    function renderBoxModel(el) {
        const computed = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const layers = boxLayers.map(({ side }) =>
            boxSides.map(s => parseFloat(computed.getPropertyValue(side(s))) || 0)
        );

        const [, border, padding] = layers;

        const contentWidth = Math.max(
            0,
            rect.width - border[1] - border[3] - padding[1] - padding[3]
        );

        const contentHeight = Math.max(
            0,
            rect.height - border[0] - border[2] - padding[0] - padding[2]
        );

        const contentSize = `${round(contentWidth)} × ${round(contentHeight)}`;
        const content = document.createElement("div");

        content.textContent = contentSize;
        makeCopyable(content, contentSize);

        Object.assign(content.style, {
            margin: "4px 0",
            padding: "2px 8px",

            border: "1px solid #89ceeb",
            borderRadius: "3px",
            background: "#1c2f3a",

            whiteSpace: "nowrap"
        });

        let box = content;

        for (let i = boxLayers.length - 1; i >= 0; i--) {
            box = boxLayer(boxLayers[i], layers[i], box);
        }

        const diagram = document.createElement("div");

        Object.assign(diagram.style, {
            display: "flex",
            justifyContent: "center",

            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px solid #333",

            fontSize: "11px"
        });

        diagram.append(box);

        return diagram;
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

            if (property === "backgroundColor") {
                rows.push(["contrast", normal.contrast, hover.contrast]);
            }
        });

        const propertyWidth = Math.max(
            ...rows.map(row => row[0].length)
        );

        const lines = rows.map(
            ([property, normalValue, hoverValue]) => {
                const line = document.createElement("div");
                const name = document.createElement("span");

                name.textContent = property;

                const render = derivedRows.has(property)
                    ? renderMarks
                    : renderValue;

                makeCopyable(
                    name,
                    derivedRows.has(property)
                        ? `${property}: ${normalValue}`
                        : declaration(property, normalValue)
                );

                line.append(
                    name,
                    " ".repeat(propertyWidth - property.length + 2),
                    render(normalValue)
                );

                if (normalValue !== hoverValue) {
                    const arrow = document.createElement("span");

                    arrow.style.color = "#888";
                    arrow.textContent = "→";

                    line.append(
                        "  ",
                        arrow,
                        "  ",
                        render(hoverValue)
                    );
                }

                return line;
            }
        );

        currentRows = rows;

        tooltip.replaceChildren(pinBar, pinTip, ...lines, renderBoxModel(el));

        tooltip.style.display = "block";

        positionTooltip();

        inspectedElement = el;
        setOverlaysDisplay("block");

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
                !pinned &&
                hoveredElement &&
                hoveredElement !== inspectedElement
            ) {
                inspectElement(hoveredElement);
            }
        });
    }

    document.addEventListener(
        "mousemove",
        event => {
            mouseX = event.clientX;
            mouseY = event.clientY;

            if (
                event.target instanceof Element &&
                !tooltip.contains(event.target) &&
                event.target !== highlight
            ) {
                hoveredElement = event.target;
            }

            if (shiftPressed && !pinned) {
                if (hoveredElement !== inspectedElement) {
                    scheduleReinspect();
                } else if (tooltip.style.display !== "none") {
                    positionTooltip();
                }
            }
        },
        true
    );

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

        tooltip.textContent =
            "Scope is paused while typing. Click outside the field to inspect.";
        tooltip.style.display = "block";
        positionTooltip();
    }

    document.addEventListener(
        "keydown",
        event => {
            if (!enabled) {
                return;
            }

            if (pinned) {
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
            if (event.key !== "Shift") {
                return;
            }

            cancelEditableHint();
            shiftPressed = false;

            if (!pinned) {
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
                !pinned &&
                shiftPressed &&
                inspectedElement &&
                event.button === 0
            ) {
                event.preventDefault();
                event.stopPropagation();

                swallowNextClick = true;
                pin();
                return;
            }

            if (!pinned || tooltip.contains(event.target)) {
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
    document.addEventListener("scroll", positionHighlight, true);
    window.addEventListener("resize", positionHighlight);

    // Prevent the tooltip from getting stuck if the window loses focus
    // while Shift is held. A pinned tooltip is meant to stay, so keep it.
    window.addEventListener("blur", () => {
        cancelEditableHint();
        shiftPressed = false;

        if (!pinned) {
            hideInspector();
        }
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
