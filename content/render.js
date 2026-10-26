/*
 * Builders for the tooltip's content: the element's identity, style rows
 * and their groups, the path and the box model diagram. Built as nodes
 * rather than markup, so page-derived values are always inserted as plain
 * text.
 */
(function (Scope) {
    "use strict";

    const { renderedParent } = Scope.tree;
    const { findColor } = Scope.colors;
    const { boxLayers, boxSides } = Scope.styles;
    const { makeCopyable } = Scope.tooltip;

    /*
     * Each box model layer sets --tint, --fill and --line from boxLayers,
     * which its own name and border use. Nested layers set their own, so a
     * name never picks up an outer layer's tint.
     */
    Scope.ui.addStyles(`
        /* Identity: the selector in DevTools-like syntax colors. */
        .selector {
            font: 600 13px/1.4 var(--mono);
            overflow-wrap: anywhere;
        }

        .tag {
            color: #ff7ab2;
        }

        .id {
            color: #ffb86c;
        }

        .classes {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 6px;
            contain: inline-size;
        }

        .chip {
            padding: 0 5px;
            max-width: 100%;
            box-sizing: border-box;

            background: rgba(122, 196, 255, 0.1);
            color: #8cc8ff;
            border-radius: 4px;

            font: 11px/18px var(--mono);
            overflow-wrap: anywhere;
        }

        /* Path, while pinned */
        .path {
            flex: none;
            padding: 0 12px 8px;
            color: var(--dim);
            font: 11px/1.5 var(--mono);
            overflow-wrap: anywhere;
            contain: inline-size;
        }

        .crumb {
            color: var(--muted);
            cursor: pointer;
        }

        .crumb:hover {
            color: var(--accent);
        }

        .crumb.current {
            color: var(--fg);
            cursor: default;
        }

        .boundary {
            color: #c4a0ff;
            cursor: help;
        }

        /* One grid for every group, so all values line up. */
        .props {
            display: grid;
            grid-template-columns: max-content auto;
            column-gap: 16px;
            font: 12px/1.6 var(--mono);
        }

        .group {
            grid-column: 1 / -1;
            margin: 8px 0 2px;
            padding-top: 8px;
            border-top: 1px solid var(--line);

            color: var(--dim);
            font: 600 10px/1.4 system-ui, sans-serif;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }

        .group:first-child {
            margin-top: 0;
            padding-top: 2px;
            border-top: none;
        }

        .row {
            display: contents;
        }

        .row-name {
            color: var(--muted);
        }

        .row-values {
            min-width: 0;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
        }

        .swatch {
            display: inline-block;
            width: 10px;
            height: 10px;
            margin-right: 6px;
            border-radius: 3px;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
            vertical-align: -1px;

            /* Under the color, so transparent ones show as such. */
            background-image:
                linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%),
                linear-gradient(45deg, #555 25%, #888 25%, #888 75%, #555 75%);
            background-size: 6px 6px;
            background-position: 0 0, 3px 3px;
        }

        .swatch > span {
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3);
            display: block;
            width: 100%;
            height: 100%;
            border-radius: inherit;
        }

        /* The hovered value differs from the normal one. */
        .arrow {
            margin: 0 6px;
            color: var(--accent);
        }

        .marks {
            white-space: nowrap;
        }

        .badge {
            display: inline-block;
            margin-left: 6px;
            padding: 0 5px;
            border-radius: 4px;
            font: 600 10px/16px system-ui, sans-serif;
            vertical-align: 1px;
        }

        .badge:first-child {
            margin-left: 0;
        }

        .badge.pass {
            background: rgba(74, 222, 128, 0.14);
            color: var(--pass);
        }

        .badge.fail {
            background: rgba(248, 113, 113, 0.14);
            color: var(--fail);
        }

        .zero {
            color: var(--dim);
        }

        /* Box model diagram */
        .diagram {
            display: flex;
            justify-content: center;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--line);
            font: 11px var(--mono);
        }

        .props:empty + .diagram {
            margin-top: 0;
            padding-top: 2px;
            border-top: none;
        }

        .layer {
            display: flex;
            flex-direction: column;
            align-items: center;

            margin: 0;
            padding: 0 6px;
            min-width: 0;

            border: var(--line) var(--tint);
            border-radius: 4px;
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
            font: 10px system-ui, sans-serif;
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
    `);

    function element(tag, className) {
        const el = document.createElement(tag);

        el.className = className;

        return el;
    }

    function round(n) {
        return Math.round(n * 100) / 100;
    }

    // -------------------------------------------------------------------------
    // Values
    // -------------------------------------------------------------------------

    function colorSwatch(value) {
        const color = findColor(value);

        if (!color) {
            return null;
        }

        // The color on top of a checkerboard.
        const swatch = element("span", "swatch");
        const fill = document.createElement("span");

        fill.style.background = color;
        swatch.append(fill);

        return swatch;
    }

    function value(text) {
        const node = document.createElement("span");
        const swatch = colorSwatch(text);

        if (swatch) {
            node.append(swatch);
        }

        node.append(text);
        makeCopyable(node, text);

        return node;
    }

    // Shows the pass and fail marks as badges, e.g. "4.52:1  AA ✓  AAA ✗".
    function marks(text) {
        const node = element("span", "marks");

        for (const part of text.split(/\s*(AAA? [✓✗])\s*/)) {
            const level = part.match(/^(AAA?) ([✓✗])$/);

            if (level) {
                const pass = level[2] === "✓";
                const badge = element("span", pass ? "badge pass" : "badge fail");

                badge.textContent = `${level[1]} ${pass ? "✓" : "✗"}`;
                node.append(badge);
            } else if (part) {
                node.append(part);
            }
        }

        makeCopyable(node, text);

        return node;
    }

    // A quoted accessible name, or "none" dimmed, or "missing" as a failure
    // when the element's role needs a name.
    function accessibleName(text) {
        if (text === "missing") {
            const node = element("span", "marks");
            const badge = element("span", "badge fail");

            badge.textContent = "missing ✗";
            node.append(badge);
            makeCopyable(node, text);

            return node;
        }

        const node = value(text);

        if (text === "none") {
            node.classList.add("zero");
        }

        return node;
    }

    // "yes" as a pass badge, "no" dimmed.
    function yesNo(text) {
        if (text === "yes") {
            const node = element("span", "marks");
            const badge = element("span", "badge pass");

            badge.textContent = "yes ✓";
            node.append(badge);
            makeCopyable(node, text);

            return node;
        }

        const node = value(text);

        node.classList.add("zero");

        return node;
    }

    // A name and its value, followed by the hovered value when it differs.
    // Rows sit in the .props grid from props().
    function row(label, copyValue, normalValue, hoverValue, render) {
        const line = element("div", "row");
        const name = element("span", "row-name");

        name.textContent = label;
        makeCopyable(name, copyValue);

        const values = element("span", "row-values");

        values.append(render(normalValue));

        if (normalValue !== hoverValue) {
            const arrow = element("span", "arrow");

            arrow.textContent = "→";
            arrow.title = "On hover";

            values.append(arrow, render(hoverValue));
        }

        line.append(name, values);

        return line;
    }

    // A group's name, e.g. "Colors", above its rows.
    function group(title) {
        const node = element("div", "group");

        node.textContent = title;

        return node;
    }

    // The grid that holds the groups and rows.
    function props(nodes) {
        const node = element("div", "props");

        node.append(...nodes);

        return node;
    }

    // -------------------------------------------------------------------------
    // Identity
    // -------------------------------------------------------------------------

    function classList(el) {
        return el.getAttribute("class")?.trim().split(/\s+/).filter(Boolean) ?? [];
    }

    /*
     * What the element is: `h2#title`, and its classes as chips that wrap
     * rather than widen the tooltip. Clicking the selector copies it with
     * every class, a chip just that class.
     */
    function identity(el) {
        const node = document.createElement("div");
        const id = el.getAttribute("id")?.trim();
        const classes = classList(el);

        const selector = element("div", "selector");
        const name = document.createElement("span");
        const tag = element("span", "tag");

        tag.textContent = el.localName;
        name.append(tag);

        if (id) {
            const idNode = element("span", "id");

            idNode.textContent = "#" + id;
            name.append(idNode);
        }

        makeCopyable(
            name,
            el.localName +
                (id ? "#" + CSS.escape(id) : "") +
                classes.map(c => "." + CSS.escape(c)).join("")
        );

        selector.append(name);
        node.append(selector);

        if (classes.length) {
            const chips = element("div", "classes");

            for (const className of classes) {
                const chip = element("span", "chip");

                chip.textContent = "." + className;
                makeCopyable(chip, className);
                chips.append(chip);
            }

            node.append(chips);
        }

        return node;
    }

    // -------------------------------------------------------------------------
    // Path
    // -------------------------------------------------------------------------

    // Ancestors shown above the element; further ones are cut to "…".
    const pathDepth = 4;

    // The tag with the id, or else the first class, e.g. `section.hero`.
    // One class is enough to tell elements apart and keeps long utility
    // class lists short.
    function crumbLabel(el) {
        const id = el.getAttribute("id")?.trim();
        const className = classList(el)[0];

        if (id) {
            return `${el.localName}#${id}`;
        }

        return className ? `${el.localName}.${className}` : el.localName;
    }

    // "»" between two elements in different trees, e.g. a host and the
    // top of its shadow root, or a slot and an element it shows.
    function separator(from, to) {
        if (from.getRootNode() === to.getRootNode()) {
            return " › ";
        }

        const boundary = element("span", "boundary");

        boundary.textContent = " » ";
        boundary.title = "Shadow DOM boundary";

        return boundary;
    }

    /*
     * Where `el` sits in the page, e.g. `main › section.hero › h1`. It
     * follows the rendered tree, like the ↑ key, so it passes from a
     * shadow root to its host. Clicking an ancestor calls `select` with it.
     */
    function path(el, select) {
        const node = element("div", "path");
        const ancestors = [];

        for (
            let parent = renderedParent(el);
            parent && ancestors.length <= pathDepth;
            parent = renderedParent(parent)
        ) {
            ancestors.unshift(parent);
        }

        if (ancestors.length > pathDepth) {
            ancestors.shift();
            node.append("… › ");
        }

        ancestors.forEach((ancestor, i) => {
            const crumb = element("span", "crumb");

            crumb.textContent = crumbLabel(ancestor);
            crumb.addEventListener("click", () => select(ancestor));

            node.append(crumb, separator(ancestor, ancestors[i + 1] ?? el));
        });

        const current = element("span", "crumb current");

        current.textContent = crumbLabel(el);
        node.append(current);

        return node;
    }

    // -------------------------------------------------------------------------
    // Box model diagram
    // -------------------------------------------------------------------------

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

    Scope.render = { value, marks, accessibleName, yesNo, row, group, props, identity, path, boxModel };
})(globalThis.Scope ??= {});
