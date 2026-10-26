/*
 * The content scripts run in order in one sandbox, listed in
 * manifest.json. Each adds its part to the shared `Scope` namespace, which
 * the page can't see.
 */
(function (Scope) {
    "use strict";

    // -------------------------------------------------------------------------
    // Color spaces
    // -------------------------------------------------------------------------

    function multiply(matrix, vector) {
        return matrix.map(row =>
            row.reduce((sum, m, i) => sum + m * vector[i], 0)
        );
    }

    // Transfer functions are applied to the magnitude, so channels outside
    // the gamut keep their sign.
    function signed(transfer) {
        return c => Math.sign(c) * transfer(Math.abs(c));
    }

    const srgbToLinear = signed(c =>
        c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    );

    const linearToSrgb = signed(c =>
        c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
    );

    // Matrices from the CSS Color 4 sample code.
    const xyzToLinearSrgb = [
        [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
        [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
        [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]
    ];

    const d50ToD65 = [
        [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
        [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
        [0.012314014864481998, -0.020507649298898964, 1.330365926242124]
    ];

    const p3ToXyz = [
        [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
        [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
        [0, 0.04511338185890264, 1.043944368900976]
    ];

    const a98ToXyz = [
        [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
        [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
        [0.02703136138641234, 0.07068885253582723, 0.9913375368376388]
    ];

    const prophotoToXyzD50 = [
        [0.7977666449006423, 0.13518129740053308, 0.0313477341283922],
        [0.2880748288194013, 0.711835234241873, 0.00008993693872564],
        [0, 0, 0.8251046025104602]
    ];

    const rec2020ToXyz = [
        [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
        [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
        [0, 0.028072693049087428, 1.060985057710791]
    ];

    const oklabToLms = [
        [1, 0.3963377773761749, 0.2158037573099136],
        [1, -0.1055613458156586, -0.0638541728258133],
        [1, -0.0894841775298119, -1.2914855480194092]
    ];

    const lmsToXyz = [
        [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
        [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
        [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816]
    ];

    const d50White = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

    const fromXyz = xyz => multiply(xyzToLinearSrgb, xyz);
    const fromXyzD50 = xyz => fromXyz(multiply(d50ToD65, xyz));

    function labToXyzD50([l, a, b]) {
        const kappa = 24389 / 27;
        const epsilon = 216 / 24389;
        const f1 = (l + 16) / 116;
        const f0 = a / 500 + f1;
        const f2 = f1 - b / 200;

        const xyz = [
            f0 ** 3 > epsilon ? f0 ** 3 : (116 * f0 - 16) / kappa,
            l > kappa * epsilon ? f1 ** 3 : l / kappa,
            f2 ** 3 > epsilon ? f2 ** 3 : (116 * f2 - 16) / kappa
        ];

        return xyz.map((n, i) => n * d50White[i]);
    }

    function oklabToXyz(lab) {
        return multiply(lmsToXyz, multiply(oklabToLms, lab).map(n => n ** 3));
    }

    function polarToLab([l, c, h]) {
        const radians = (h * Math.PI) / 180;

        return [l, c * Math.cos(radians), c * Math.sin(radians)];
    }

    const a98Transfer = signed(c => c ** (563 / 256));

    const prophotoTransfer = signed(c => (c <= 16 / 512 ? c / 16 : c ** 1.8));

    const rec2020Transfer = signed(c =>
        c < 0.018053968510807 * 4.5
            ? c / 4.5
            : ((c + 0.09929682680944) / 1.09929682680944) ** (1 / 0.45)
    );

    /*
     * Each space converts its channels to linear sRGB. `scale` is what 100%
     * stands for in each channel, 1 when left out. Hue has no percentages.
     */
    const spaces = {
        rgb: {
            scale: [255, 255, 255],
            toLinear: c => c.map(n => srgbToLinear(n / 255))
        },
        lab: {
            scale: [100, 125, 125],
            toLinear: c => fromXyzD50(labToXyzD50(c))
        },
        lch: {
            scale: [100, 150, 1],
            toLinear: c => fromXyzD50(labToXyzD50(polarToLab(c)))
        },
        oklab: {
            scale: [1, 0.4, 0.4],
            toLinear: c => fromXyz(oklabToXyz(c))
        },
        oklch: {
            scale: [1, 0.4, 1],
            toLinear: c => fromXyz(oklabToXyz(polarToLab(c)))
        },
        srgb: { toLinear: c => c.map(srgbToLinear) },
        "srgb-linear": { toLinear: c => c },
        "display-p3": { toLinear: c => fromXyz(multiply(p3ToXyz, c.map(srgbToLinear))) },
        "a98-rgb": { toLinear: c => fromXyz(multiply(a98ToXyz, c.map(a98Transfer))) },
        "prophoto-rgb": {
            toLinear: c => fromXyzD50(multiply(prophotoToXyzD50, c.map(prophotoTransfer)))
        },
        rec2020: { toLinear: c => fromXyz(multiply(rec2020ToXyz, c.map(rec2020Transfer))) },
        xyz: { toLinear: fromXyz },
        "xyz-d65": { toLinear: fromXyz },
        "xyz-d50": { toLinear: fromXyzD50 }
    };

    // -------------------------------------------------------------------------
    // Color conversion
    // -------------------------------------------------------------------------

    const colorFunction = /\b(?:rgba?|lab|lch|oklab|oklch|color)\([^()]*\)/gi;

    function channel(text, scale = 1) {
        if (text === "none") {
            return 0;
        }

        return text.endsWith("%")
            ? (parseFloat(text) / 100) * scale
            : parseFloat(text);
    }

    /*
     * Computed colors keep the syntax they were written in, except named,
     * hex, hsl() and hwb() colors, which become rgb(). So oklch(), lab(),
     * color(display-p3 …) and the color() that color-mix() produces are
     * converted here, to [r, g, b, alpha] with channels 0–255. They aren't
     * clipped, so a color outside sRGB has channels outside that range.
     *
     * Converted with math rather than by painting on a canvas, whose
     * readback Firefox's fingerprinting protection can add noise to. Null
     * for anything that isn't a color function.
     */
    function toSrgb(value) {
        const match = value.trim().match(/^([a-z0-9-]+)\(([^()]*)\)$/i);

        if (!match) {
            return null;
        }

        let name = match[1].toLowerCase().replace(/^rgba$/, "rgb");
        const [channelText, alphaText] = match[2].split("/");
        const parts = channelText.trim().split(/\s*,\s*|\s+/);

        // rgba(r, g, b, a) has no slash.
        const alpha = alphaText?.trim() ?? (name === "rgb" ? parts[3] : undefined);

        if (name === "color") {
            name = parts.shift()?.toLowerCase();
        }

        const space = spaces[name];

        if (!space || parts.length < 3) {
            return null;
        }

        const channels = parts
            .slice(0, 3)
            .map((text, i) => channel(text, space.scale?.[i]));

        const a = alpha === undefined ? 1 : channel(alpha);

        if ([...channels, a].some(Number.isNaN)) {
            return null;
        }

        // Rounded to drop float noise, so white stays exactly 255.
        const rgb = space
            .toLinear(channels)
            .map(n => Math.round(linearToSrgb(n) * 255 * 1000) / 1000);

        return [...rgb, Math.max(0, Math.min(1, a))];
    }

    // Allows for rounding, so a color that started out in sRGB still counts.
    function inSrgbGamut(color) {
        return color.slice(0, 3).every(n => n > -0.5 && n < 255.5);
    }

    const clip = n => Math.max(0, Math.min(255, n));

    // Clipped into sRGB, for contrast.
    function parseColor(value) {
        const color = toSrgb(value);

        return color && [...color.slice(0, 3).map(clip), color[3]];
    }

    // A color outside sRGB has no exact hex, so it's kept as written.
    function toHexColor(value) {
        const color = toSrgb(value);

        if (!color || !inSrgbGamut(color)) {
            return value;
        }

        const toHex = n => Math.round(clip(n)).toString(16).padStart(2, "0");
        const hex = "#" + color.slice(0, 3).map(toHex).join("");

        return color[3] >= 1 ? hex : hex + toHex(color[3] * 255);
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
            return value.replace(colorFunction, match => toHexColor(match));
        }

        return value;
    }

    // The first color in a formatted value, hex or a color kept as written,
    // for its swatch.
    function findColor(value) {
        const match = value.match(
            /#[0-9a-f]{6}(?:[0-9a-f]{2})?\b|\b(?:rgba?|lab|lch|oklab|oklch|color)\([^()]*\)/i
        );

        return match ? match[0] : null;
    }

    // -------------------------------------------------------------------------
    // Contrast (WCAG 2)
    // -------------------------------------------------------------------------

    function luminance([r, g, b]) {
        const [lr, lg, lb] = [r, g, b].map(c => srgbToLinear(c / 255));

        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    }

    function parentOf(el) {
        // Step out of shadow roots to the host element.
        return el.parentElement || el.getRootNode().host || null;
    }

    /*
     * A pixel is a known color plus the share of it that comes from
     * something Scope can't read, like an image. Every step mixes linearly,
     * so the share says how much of an image still shows through at the
     * end.
     */
    const canvasPixel = { rgb: [255, 255, 255], unknown: 0 };
    const imagePixel = { rgb: [0, 0, 0], unknown: 1 };

    function mix(bottom, top, amount) {
        return {
            rgb: bottom.rgb.map((n, i) => n * (1 - amount) + top.rgb[i] * amount),
            unknown: bottom.unknown * (1 - amount) + top.unknown * amount
        };
    }

    function paintColor(pixel, color) {
        return mix(pixel, { rgb: color.slice(0, 3), unknown: 0 }, color[3]);
    }

    // Elements whose content is an image of some kind.
    const replacedElements = new Set([
        "IMG", "VIDEO", "CANVAS", "SVG", "IFRAME", "EMBED", "OBJECT"
    ]);

    // An element's background, faded by `opacity`. A background image is
    // taken to cover all of it, which errs towards "unknown".
    function paintBackground(pixel, style, opacity, replaced = false) {
        const color = parseColor(style.backgroundColor);

        if (!color || replaced || style.backgroundImage !== "none") {
            return mix(pixel, imagePixel, opacity);
        }

        return paintColor(pixel, [...color.slice(0, 3), color[3] * opacity]);
    }

    // A point on the first line of the element's own text, or its center.
    function textPoint(el) {
        for (const node of el.childNodes) {
            if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) {
                continue;
            }

            const range = document.createRange();

            range.selectNodeContents(node);

            const rect = [...range.getClientRects()].find(r => r.width && r.height);

            if (rect) {
                return [rect.left + rect.width / 2, rect.top + rect.height / 2];
            }
        }

        const rect = el.getBoundingClientRect();

        return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    }

    function ancestorsOf(el) {
        const ancestors = [];

        for (let node = el; node; node = parentOf(node)) {
            ancestors.push(node);
        }

        return ancestors;
    }

    /*
     * Elements painted behind `el` at its text that aren't its ancestors,
     * like an image under an absolutely positioned caption, nearest first.
     * Found by hit testing, which skips elements with `pointer-events:
     * none`, and finds nothing when `el` itself has it or its text is
     * scrolled out of view.
     */
    function elementsBehind(el) {
        const [x, y] = textPoint(el);

        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
            return [];
        }

        const root = el.getRootNode();
        const stack = (root.elementsFromPoint ? root : document).elementsFromPoint(x, y);
        const index = stack.indexOf(el);

        if (index < 0) {
            return [];
        }

        const ancestors = new Set(ancestorsOf(el));

        return stack
            .slice(index + 1)
            .filter(node => !ancestors.has(node) && node !== Scope.ui.host);
    }

    /*
     * The pixel under the text, with and without it, painted from the root
     * down. Each ancestor's opacity fades its whole subtree, text included,
     * into what's behind it. An element in `behind` is painted over the
     * background of the nearest ancestor it shares with `el`, faded by its
     * own opacity and that of its parents below that ancestor. The browser
     * canvas is taken to be white.
     */
    function paintText(el, computed, behind, text) {
        const ancestors = ancestorsOf(el);
        const depth = new Map(ancestors.map((node, i) => [node, i]));

        const chain = ancestors.map(node => ({
            style: node === el ? computed : window.getComputedStyle(node),
            layers: []
        }));

        for (const node of behind) {
            const style = window.getComputedStyle(node);
            let opacity = parseFloat(style.opacity);
            let parent = parentOf(node);

            while (parent && !depth.has(parent)) {
                opacity *= parseFloat(window.getComputedStyle(parent).opacity);
                parent = parentOf(parent);
            }

            if (parent) {
                // `behind` is nearest first, so each list ends up bottom
                // first.
                chain[depth.get(parent)].layers.unshift({
                    style,
                    opacity,
                    replaced: replacedElements.has(node.nodeName.toUpperCase())
                });
            }
        }

        function paint(i, backdrop, withText) {
            const { style, layers } = chain[i];

            let pixel = paintBackground(backdrop, style, 1);

            for (const layer of layers) {
                pixel = paintBackground(pixel, layer.style, layer.opacity, layer.replaced);
            }

            if (i > 0) {
                pixel = paint(i - 1, pixel, withText);
            } else if (withText) {
                pixel = paintColor(pixel, text);
            }

            return mix(backdrop, pixel, parseFloat(style.opacity));
        }

        const root = chain.length - 1;

        return {
            text: paint(root, canvasPixel, true),
            background: paint(root, canvasPixel, false)
        };
    }

    // Large text per WCAG: 18pt (24px), or 14pt (18.66px) when bold.
    function isLargeText(computed) {
        const size = parseFloat(computed.fontSize);

        return size >= 24 || (size >= 18.66 && Number(computed.fontWeight) >= 700);
    }

    function contrastRatio(a, b) {
        const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

        return (light + 0.05) / (dark + 0.05);
    }

    // E.g. "4.52:1  AA ✓  AAA ✗".
    function rateContrast(ratio, large) {
        // Truncated, not rounded, so 4.499 never displays as passing 4.5.
        const shown = Math.floor(ratio * 100) / 100;
        const mark = min => (ratio >= min ? "✓" : "✗");

        return (
            `${shown}:1  AA ${mark(large ? 3 : 4.5)}  AAA ${mark(large ? 4.5 : 7)}` +
            (large ? "  large text" : "")
        );
    }

    // `behind` comes from elementsBehind(). When `el` is a clone, it is found
    // from the original before the clone is inserted and moves it.
    function contrastSummary(el, computed, behind) {
        const color = parseColor(computed.color);

        if (!color) {
            return "unknown (unsupported color)";
        }

        const { text, background } = paintText(el, computed, behind, color);

        if (background.unknown > 0.001) {
            return "unknown (image behind text)";
        }

        return rateContrast(
            contrastRatio(text.rgb, background.rgb),
            isLargeText(computed)
        );
    }

    Scope.colors = {
        toHexColor,
        formatValue,
        findColor,
        parseColor,
        luminance,
        contrastRatio,
        rateContrast,
        isLargeText,
        ancestorsOf,
        elementsBehind,
        contrastSummary
    };
})(globalThis.Scope ??= {});
