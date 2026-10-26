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

    function setDisplay(display) {
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
