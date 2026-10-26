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

    /*
     * Each box model layer sets --tint, --fill and --line from boxLayers,
     * which its own name and border use. Nested layers set their own, so a
     * name never picks up an outer layer's tint.
     */
    Scope.ui.addStyles(`
        .swatch {
            display: inline-block;
            width: 10px;
            height: 10px;
            margin-left: 5px;
            border: 1px solid #888;
            border-radius: 2px;
            vertical-align: -1px;
        }

        .pass {
            color: #93c47d;
        }

        .fail {
            color: #e06666;
        }

        .arrow {
            color: #888;
        }

        /* A long value, e.g. a font stack, wraps within its own column
           instead of running past the tooltip's edge. */
        .row {
            display: flex;
            gap: 2ch;
        }

        .row > :first-child {
            flex: none;
        }

        .row-values {
            min-width: 0;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
        }

        .section,
        .diagram {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #333;
        }

        /* When every row above is hidden, the pin bar already draws the
           dividing line. */
        .pin-tip + .section,
        .pin-tip + .diagram {
            margin-top: 0;
            padding-top: 0;
            border-top: none;
        }

        .chip {
            padding: 0 4px;
            background: #2a2a2a;
            border: 1px solid #3a3a3a;
            border-radius: 3px;
            color: #f0f0f0;
        }

        .attribute {
            display: flex;
            gap: 2ch;
        }

        .chips {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            min-width: 0;
            overflow-wrap: anywhere;
        }

        .zero {
            color: #777;
        }

        .layer {
            display: flex;
            flex-direction: column;
            align-items: center;

            margin: 0;
            padding: 0 6px;
            min-width: 0;

            border: var(--line) var(--tint);
            border-radius: 3px;
            background: var(--fill);

            line-height: 1.5;
            white-space: nowrap;
        }

        /* Label on the left, value centered: equal 1fr columns either side
           keep the value centered without the two overlapping. */
        .layer-top {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            gap: 6px;
            align-self: stretch;
        }

        .layer-name {
            justify-self: start;
            color: var(--tint);
            font-size: 10px;
        }

        .layer-middle {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .content-box {
            margin: 4px 0;
            padding: 2px 8px;

            border: 1px solid #89ceeb;
            border-radius: 3px;
            background: #1c2f3a;

            white-space: nowrap;
        }

        .diagram {
            display: flex;
            justify-content: center;
            font-size: 11px;
        }
    `);

    function element(tag, className) {
        const el = document.createElement(tag);

        el.className = className;

        return el;
    }

    // -------------------------------------------------------------------------
    // Values
    // -------------------------------------------------------------------------

    function colorSwatch(value) {
        const color = findColor(value);

        if (!color) {
            return null;
        }

        const swatch = element("span", "swatch");

        swatch.style.background = color;

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
                const mark = element("span", part === "✓" ? "pass" : "fail");

                mark.textContent = part;
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
        const line = element("div", "row");
        const name = document.createElement("span");

        name.textContent = label;
        makeCopyable(name, copyValue);

        const values = element("span", "row-values");

        values.append(render(normalValue));

        if (normalValue !== hoverValue) {
            const arrow = element("span", "arrow");

            arrow.textContent = "→";

            values.append("  ", arrow, "  ", render(hoverValue));
        }

        line.append(name, values);

        return line;
    }

    // A tooltip section below the CSS rows, set off by a divider line.
    function section() {
        return element("div", "section");
    }

    // -------------------------------------------------------------------------
    // Attributes
    // -------------------------------------------------------------------------

    // Shown like Markdown inline code, so each name stands out from its
    // neighbours. Clicking one copies just that name.
    function codeChip(text) {
        const chip = element("span", "chip");

        chip.textContent = text;
        makeCopyable(chip, text);

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
            const line = element("div", "attribute");

            const label = document.createElement("span");

            label.textContent = name.padEnd(nameWidth);

            const chips = element("span", "chips");

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
            node.className = "zero";
        }

        return node;
    }

    function boxLayer({ name: label, tint, fill, line }, sides, inner) {
        const layer = element("div", "layer");

        layer.style.setProperty("--tint", tint);
        layer.style.setProperty("--fill", fill);
        layer.style.setProperty("--line", line);

        const name = element("span", "layer-name");

        name.textContent = label;

        const top = element("div", "layer-top");

        top.append(name, boxValue(sides[0]), document.createElement("span"));

        const middle = element("div", "layer-middle");

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
        const content = element("div", "content-box");

        content.textContent = contentSize;
        makeCopyable(content, contentSize);

        let box = content;

        for (let i = boxLayers.length - 1; i >= 0; i--) {
            box = boxLayer(boxLayers[i], layers[i], box);
        }

        const diagram = element("div", "diagram");

        diagram.append(box);

        return diagram;
    }

    Scope.render = { value, marks, row, section, attributes, boxModel };
})(globalThis.Scope ??= {});
