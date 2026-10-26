/*
 * Builders for the tooltip's content: style rows, sections, the id and
 * class chips and the box model diagram. Built as nodes rather than markup,
 * so page-derived values are always inserted as plain text.
 */
(function (Scope) {
    "use strict";

    const { findColor } = Scope.colors;
    const { boxLayers, boxSides } = Scope.styles;
    const { makeCopyable } = Scope.tooltip;

    // -------------------------------------------------------------------------
    // Values
    // -------------------------------------------------------------------------

    function colorSwatch(value) {
        const color = findColor(value);

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

    function value(text) {
        const node = document.createElement("span");
        const swatch = colorSwatch(text);

        node.append(text);

        if (swatch) {
            node.append(swatch);
        }

        makeCopyable(node, text);

        return node;
    }

    // Colors pass and fail marks, e.g. in "4.52:1  AA ✓  AAA ✗".
    function marks(text) {
        const node = document.createElement("span");

        for (const part of text.split(/([✓✗])/)) {
            if (part === "✓" || part === "✗") {
                const mark = document.createElement("span");

                mark.textContent = part;
                mark.style.color = part === "✓" ? "#93c47d" : "#e06666";
                node.append(mark);
            } else {
                node.append(part);
            }
        }

        makeCopyable(node, text);

        return node;
    }

    // A label and its value, followed by the hovered value when it differs.
    function row(label, copyValue, normalValue, hoverValue, render) {
        const line = document.createElement("div");
        const name = document.createElement("span");

        name.textContent = label;
        makeCopyable(name, copyValue);

        line.append(name, "  ", render(normalValue));

        if (normalValue !== hoverValue) {
            const arrow = document.createElement("span");

            arrow.style.color = "#888";
            arrow.textContent = "→";

            line.append("  ", arrow, "  ", render(hoverValue));
        }

        return line;
    }

    // A tooltip section below the CSS rows, set off by a divider line.
    function section() {
        const node = document.createElement("div");

        Object.assign(node.style, {
            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px solid #333"
        });

        return node;
    }

    // -------------------------------------------------------------------------
    // Attributes
    // -------------------------------------------------------------------------

    // Shown like Markdown inline code, so each name stands out from its
    // neighbours. Clicking one copies just that name.
    function codeChip(text) {
        const chip = document.createElement("span");

        chip.textContent = text;
        makeCopyable(chip, text);

        Object.assign(chip.style, {
            padding: "0 4px",
            background: "#2a2a2a",
            border: "1px solid #3a3a3a",
            borderRadius: "3px",
            color: "#f0f0f0"
        });

        return chip;
    }

    // The element's id and class, when set, in their own section above the
    // box model diagram. Each class gets its own chip, and long class lists
    // wrap instead of widening the tooltip.
    function attributes(el) {
        const found = ["id", "class"]
            .map(name => [name, el.getAttribute(name)?.trim()])
            .filter(([, text]) => text);

        if (!found.length) {
            return null;
        }

        const node = section();

        const nameWidth = Math.max(...found.map(([name]) => name.length));

        for (const [name, text] of found) {
            const line = document.createElement("div");

            Object.assign(line.style, {
                display: "flex",
                gap: "2ch"
            });

            const label = document.createElement("span");

            label.textContent = name.padEnd(nameWidth);

            const chips = document.createElement("span");

            Object.assign(chips.style, {
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                minWidth: "0",
                overflowWrap: "anywhere"
            });

            chips.append(...text.split(/\s+/).map(codeChip));

            line.append(label, chips);
            node.append(line);
        }

        return node;
    }

    // -------------------------------------------------------------------------
    // Box model diagram
    // -------------------------------------------------------------------------

    function round(n) {
        return Math.round(n * 100) / 100;
    }

    // Zero sides are shown as a dash, like DevTools, so the non-zero ones
    // stand out.
    function boxValue(px) {
        const node = document.createElement("span");
        const rounded = round(px);

        node.textContent = rounded === 0 ? "–" : String(rounded);

        if (rounded !== 0) {
            makeCopyable(node, rounded + "px");
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
    function boxModel(el) {
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

    Scope.render = { value, marks, row, section, attributes, boxModel };
})(globalThis.Scope ??= {});
