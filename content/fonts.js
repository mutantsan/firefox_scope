// Which family in an element's font-family list its text renders in.
(function (Scope) {
    "use strict";

    const genericFamilies = new Set([
        "serif",
        "sans-serif",
        "monospace",
        "cursive",
        "fantasy",
        "system-ui",
        "ui-serif",
        "ui-sans-serif",
        "ui-monospace",
        "ui-rounded",
        "math",
        "emoji",
        "fangsong"
    ]);

    // Generic names only count unquoted: "serif" in quotes is a family
    // called serif.
    function parseFamilies(value) {
        return [...value.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,"']+)/g)]
            .map(([, double, single, bare]) => {
                const quoted = bare === undefined;
                const name = (quoted ? double ?? single : bare)
                    .trim()
                    .replace(/\\(.)/g, "$1");

                return {
                    name,
                    generic: !quoted && genericFamilies.has(name.toLowerCase())
                };
            })
            .filter(family => family.name);
    }

    function quote(name) {
        return `"${name.replace(/["\\]/g, "\\$&")}"`;
    }

    function unquote(name) {
        return name.replace(/^(["'])(.*)\1$/, "$2");
    }

    function fontFaces(name) {
        const faces = [];
        const key = name.toLowerCase();

        document.fonts.forEach(face => {
            if (unquote(face.family).toLowerCase() === key) {
                faces.push(face);
            }
        });

        return faces;
    }

    // check() is true for a family with nothing left to load, which includes
    // one that doesn't exist at all, so it only settles web fonts.
    function webFontRenders(name, faces, computed, sample) {
        if (!faces.some(face => face.status === "loaded")) {
            return false;
        }

        try {
            return document.fonts.check(
                `${computed.fontStyle} ${computed.fontWeight} 16px ${quote(name)}`,
                sample
            );
        } catch {
            return false;
        }
    }

    const context = document.createElement("canvas").getContext("2d");
    const installedCache = new Map();
    const measureText = "mmmmmmmmmmlli1WQ@#";

    // A family that's installed changes the width of text measured with it
    // before a fallback. Measured against two fallbacks, in case it is
    // the fallback.
    function isInstalled(name) {
        const key = name.toLowerCase();

        if (!installedCache.has(key)) {
            installedCache.set(
                key,
                ["monospace", "serif"].some(fallback => {
                    context.font = `72px ${fallback}`;

                    const width = context.measureText(measureText).width;

                    context.font = `72px ${quote(name)}, ${fallback}`;

                    return context.measureText(measureText).width !== width;
                })
            );
        }

        return installedCache.get(key);
    }

    /*
     * The first family that is a loaded web font, an installed font or a
     * generic name, which the browser resolves itself. Characters the font
     * lacks can still fall back to later families.
     */
    function renderedFont(el, computed) {
        const sample = el.textContent.trim().slice(0, 100) || " ";

        for (const family of parseFamilies(computed.fontFamily)) {
            if (family.generic) {
                return family.name;
            }

            const faces = fontFaces(family.name);

            const renders = faces.length
                ? webFontRenders(family.name, faces, computed, sample)
                : isInstalled(family.name);

            if (renders) {
                return family.name;
            }
        }

        return "browser default";
    }

    Scope.fonts = { renderedFont };
})(globalThis.Scope ??= {});
