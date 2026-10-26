/*
 * The content scripts run in order in one sandbox, listed in
 * manifest.json. Each adds its part to the shared `Scope` namespace, which
 * the page can't see.
 */
(function (Scope) {
    "use strict";

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

    function getHexColor(value) {
        const match = value.match(
            /#[0-9a-f]{6}(?:[0-9a-f]{2})?/i
        );

        return match ? match[0] : null;
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

    Scope.colors = {
        toHexColor,
        formatValue,
        getHexColor,
        parseColor,
        blend,
        luminance,
        contrastSummary
    };
})(globalThis.Scope ??= {});
