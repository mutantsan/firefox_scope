/*
 * The space between the inspected element's children, hatched and labeled
 * with its size, like Figma's dev mode.
 *
 * The space is measured between the children's border boxes rather than
 * read from their margins, so it's shown as it renders whatever makes it:
 * margins (collapsed or not), flex or grid gap, justify-content or the
 * whitespace between inline blocks.
 */
(function (Scope) {
    "use strict";

    // Enough for menus and grids; past this the hatching is mostly noise
    // and measuring every pair each frame gets slow.
    const maxChildren = 100;

    let container = null;
    let children = [];

    Scope.ui.addStyles(`
        .gap,
        .gap-label {
            position: fixed;
            z-index: 2147483646;
            display: none;
            pointer-events: none;
        }

        .gap {
            box-sizing: border-box;
            border: 1px dashed rgba(219, 39, 119, 0.8);
            background:
                repeating-linear-gradient(
                    -45deg,
                    rgba(219, 39, 119, 0.6) 0 1px,
                    transparent 1px 5px
                ),
                rgba(219, 39, 119, 0.12);
        }

        .gap-label {
            padding: 0 3px;

            background: #db2777;
            color: #fff;
            border-radius: 3px;

            font-family: monospace;
            font-size: 10px;
            line-height: 14px;

            white-space: nowrap;
        }
    `);

    // Created as needed and kept for reuse.
    const strips = [];
    const labels = [];

    function part(className) {
        const el = document.createElement("div");

        el.className = className;
        Scope.ui.root.append(el);

        return el;
    }

    function round(n) {
        return Math.round(n * 100) / 100;
    }

    /*
     * Each box's gap to its nearest neighbor to the right and below: boxes
     * side by side on one axis, sharing part of the other. Taking the
     * nearest box in each direction, not the next one in source order,
     * also finds the gaps between rows of a grid or of wrapped flex items.
     *
     * Returns rectangles as { left, top, right, bottom, horizontal }, where
     * horizontal means the gap runs across the x axis, between columns.
     */
    function gapRects(boxes) {
        const result = [];
        const seen = new Set();

        function add(rect) {
            const key = [rect.left, rect.top, rect.right, rect.bottom].join();

            if (!seen.has(key)) {
                seen.add(key);
                result.push(rect);
            }
        }

        for (const a of boxes) {
            let right = null;
            let below = null;

            for (const b of boxes) {
                if (b === a) {
                    continue;
                }

                const sharedTop = Math.max(a.top, b.top);
                const sharedBottom = Math.min(a.bottom, b.bottom);
                const sharedLeft = Math.max(a.left, b.left);
                const sharedRight = Math.min(a.right, b.right);

                if (
                    sharedBottom > sharedTop &&
                    round(b.left - a.right) > 0 &&
                    (!right || b.left - a.right < right.right - right.left)
                ) {
                    right = {
                        left: a.right,
                        right: b.left,
                        top: sharedTop,
                        bottom: sharedBottom,
                        horizontal: true
                    };
                }

                if (
                    sharedRight > sharedLeft &&
                    round(b.top - a.bottom) > 0 &&
                    (!below || b.top - a.bottom < below.bottom - below.top)
                ) {
                    below = {
                        left: sharedLeft,
                        right: sharedRight,
                        top: a.bottom,
                        bottom: b.top,
                        horizontal: false
                    };
                }
            }

            for (const rect of [right, below]) {
                if (rect) {
                    add(rect);
                }
            }
        }

        return result;
    }

    // Children laid out in the parent's flow: hidden and out-of-flow ones
    // don't make gaps. A display: contents one has no box, so its own
    // children are laid out in its place, like a grid of cards each in an
    // `<li style="display: contents">`.
    function laidOutChildren(el) {
        const result = [];

        function collect(parent) {
            for (const child of parent?.children ?? []) {
                if (result.length >= maxChildren) {
                    return;
                }

                const { display, position } = window.getComputedStyle(child);

                if (display === "contents") {
                    collect(child);
                } else if (display !== "none" && position !== "absolute" && position !== "fixed") {
                    result.push(child);
                }
            }
        }

        collect(el);

        return result;
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(n, max));
    }

    function draw(i, rect) {
        const strip = strips[i] ??= part("gap");
        const label = labels[i] ??= part("gap-label");

        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;

        Object.assign(strip.style, {
            display: "block",
            left: rect.left + "px",
            top: rect.top + "px",
            width: width + "px",
            height: height + "px"
        });

        label.textContent = String(round(rect.horizontal ? width : height));
        label.style.display = "block";

        // Centered on the strip and kept in the viewport.
        const labelWidth = label.offsetWidth;
        const labelHeight = label.offsetHeight;

        const left = rect.left + width / 2 - labelWidth / 2;
        const top = rect.top + height / 2 - labelHeight / 2;

        label.style.left = clamp(left, 0, window.innerWidth - labelWidth) + "px";
        label.style.top = clamp(top, 0, window.innerHeight - labelHeight) + "px";
    }

    function hideFrom(start) {
        for (let i = start; i < strips.length; i++) {
            strips[i].style.display = "none";
            labels[i].style.display = "none";
        }
    }

    function position() {
        if (!container) {
            return;
        }

        const rects = gapRects(
            children
                .map(child => child.getBoundingClientRect())
                .filter(rect => rect.width > 0 || rect.height > 0)
        );

        rects.forEach((rect, i) => draw(i, rect));
        hideFrom(rects.length);
    }

    function show(el) {
        container = el;
        children = laidOutChildren(el);
        position();
    }

    function hide() {
        container = null;
        children = [];
        hideFrom(0);
    }

    Scope.gaps = { show, hide, position, gapRects, laidOutChildren };
})(globalThis.Scope ??= {});
