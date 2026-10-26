// The focus border, box model shading and edge guides drawn on the page.
(function (Scope) {
    "use strict";

    const { boxLayers, boxSides } = Scope.styles;

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
     *
     * Dashed guides run along the border box's edges, spanning the
     * viewport, like DevTools' highlighter.
     */
    Scope.ui.addStyles(`
        .margin-overlay,
        .highlight,
        .guide {
            position: fixed;
            z-index: 2147483646;
            display: none;
            pointer-events: none;
        }

        .margin-overlay {
            box-sizing: content-box;
            border-style: solid;
            border-color: rgba(237, 255, 100, 0.6);
        }

        .highlight {
            box-sizing: border-box;
            border-style: solid;
            border-color: rgba(68, 68, 68, 0.6);
        }

        .padding-overlay {
            position: absolute;
            inset: 0;

            box-sizing: border-box;
            border-style: solid;
            border-color: rgba(106, 90, 205, 0.6);
            background: rgba(137, 206, 235, 0.6);
            background-clip: padding-box;
        }

        .guide.horizontal {
            left: 0;
            width: 100%;
            height: 0;
            border-top: 1px dashed #0099cc;
        }

        .guide.vertical {
            top: 0;
            width: 0;
            height: 100%;
            border-left: 1px dashed #0099cc;
        }
    `);

    function overlay(className) {
        const el = document.createElement("div");

        el.className = className;

        return el;
    }

    const marginOverlay = overlay("margin-overlay");
    const highlight = overlay("highlight");
    const paddingOverlay = overlay("padding-overlay");

    highlight.append(paddingOverlay);

    // Top, right, bottom, left.
    const guides = ["horizontal", "vertical", "horizontal", "vertical"].map(
        direction => overlay("guide " + direction)
    );

    Scope.ui.root.append(marginOverlay, highlight, ...guides);

    function setDisplay(display) {
        for (const el of [marginOverlay, highlight, ...guides]) {
            el.style.display = display;
        }
    }

    // Border widths can't be negative, so negative margins aren't shaded.
    function sideWidths(computed, side) {
        return boxSides
            .map(s => Math.max(0, parseFloat(computed.getPropertyValue(side(s))) || 0) + "px")
            .join(" ");
    }

    function position(el) {
        if (!el) {
            return;
        }

        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);

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

    function show(el) {
        setDisplay("block");
        position(el);
    }

    function hide() {
        setDisplay("none");
    }

    Scope.overlays = { show, hide, position };
})(globalThis.Scope ??= {});
