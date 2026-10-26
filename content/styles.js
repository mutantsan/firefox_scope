// Reading an element's computed styles, in normal and hovered state.
(function (Scope) {
    "use strict";

    const { formatValue, contrastSummary, elementsBehind } = Scope.colors;
    const { renderedFont } = Scope.fonts;

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
        "gap",
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

    // Rows hidden when they hold the default in both states, unless the
    // "Show default values" setting is on. The box model diagram still
    // shows every side of margin, border and padding.
    function isZero(value) {
        const numbers = value.match(/-?\d*\.?\d+/g);

        return !!numbers && numbers.every(n => parseFloat(n) === 0);
    }

    const defaultChecks = {
        margin: isZero,
        padding: isZero,
        borderRadius: isZero,
        // The border shorthand ends with a color, so only its width counts.
        border: value => /^0px\b/.test(value),
        position: value => value === "static",
        opacity: value => parseFloat(value) === 1,
        gap: value => value === "normal"
    };

    function isDefault(property, value) {
        return !!defaultChecks[property]?.(value);
    }

    // Gap only affects flex and grid containers, so elsewhere its row is
    // noise.
    function isGapContainer(display) {
        return /\b(flex|grid)\b/.test(display);
    }

    function toCssName(property) {
        return property.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
    }

    function declaration(property, value) {
        return `${toCssName(property)}: ${value};`;
    }

    // -------------------------------------------------------------------------
    // Box model
    // -------------------------------------------------------------------------

    // Shared by the page overlays and the tooltip's diagram.
    const boxLayers = [
        // Solid fills rather than translucent tints, which would compound
        // as the layers nest. The border is a solid line, like DevTools, so
        // it reads as the element's edge rather than another spacing area.
        { name: "margin", tint: "#edff64", fill: "#33361a", line: "1px dashed", side: s => `margin-${s}` },
        { name: "border", tint: "#aaaaaa", fill: "#2a2a2a", line: "2px solid", side: s => `border-${s}-width` },
        { name: "padding", tint: "#a99eff", fill: "#26213f", line: "1px dashed", side: s => `padding-${s}` }
    ];

    const boxSides = ["top", "right", "bottom", "left"];

    // -------------------------------------------------------------------------
    // Style collection
    // -------------------------------------------------------------------------

    // `behind` is found from the original when `el` is a clone, see
    // contrastSummary().
    function getStyles(el, behind = elementsBehind(el)) {
        const computed = window.getComputedStyle(el);
        const result = {};

        properties.forEach(property => {
            result[property] = formatValue(
                property,
                computed[property]
            );
        });

        result.contrast = contrastSummary(el, computed, behind);
        result.renderedFont = renderedFont(el, computed);

        // outline-color computes to a color (currentcolor by default) even
        // when no outline is drawn, so its row is only shown when one is.
        result.hasOutline =
            computed.outlineStyle !== "none" &&
            parseFloat(computed.outlineWidth) > 0;

        return result;
    }

    // -------------------------------------------------------------------------
    // Normal (non-hovered) state
    // -------------------------------------------------------------------------

    // Selectors of the :hover rules in each stylesheet, cached until the
    // sheet's rule count changes, e.g. when CSS-in-JS inserts a rule.
    const hoverSelectorCache = new WeakMap();

    // A nested rule's selector is relative to its parent style rule, so it
    // is resolved into one that Element.matches() understands.
    function resolveSelector(rule) {
        let parent = rule.parentRule;

        while (parent && !(parent instanceof CSSStyleRule)) {
            parent = parent.parentRule;
        }

        if (!parent) {
            return rule.selectorText;
        }

        const scope = `:is(${resolveSelector(parent)})`;
        const own = rule.selectorText;

        return own.includes("&")
            ? own.replaceAll("&", scope)
            : `${scope} :is(${own})`;
    }

    function collectHoverSelectors(rules, selectors) {
        for (const rule of rules) {
            if (rule instanceof CSSImportRule) {
                if (rule.styleSheet) {
                    collectHoverSelectors(rule.styleSheet.cssRules, selectors);
                }

                continue;
            }

            // Resolved first, since a nested rule can depend on its parent's
            // :hover, e.g. `.card:hover { .title { … } }`.
            if (rule instanceof CSSStyleRule) {
                const selector = resolveSelector(rule);

                if (selector.includes(":hover")) {
                    selectors.push(selector);
                }
            }

            // Grouping rules (@media, @supports, @layer…) and nesting.
            if (rule.cssRules) {
                collectHoverSelectors(rule.cssRules, selectors);
            }
        }

        return selectors;
    }

    // Null when the sheet can't be read, e.g. a cross-origin one.
    function hoverSelectors(sheet) {
        let rules;

        try {
            rules = sheet.cssRules;
        } catch {
            return null;
        }

        const cached = hoverSelectorCache.get(sheet);

        if (cached && cached.count === rules.length) {
            return cached.selectors;
        }

        let selectors;

        try {
            selectors = collectHoverSelectors(rules, []);
        } catch {
            // An unreadable @import.
            return null;
        }

        hoverSelectorCache.set(sheet, { count: rules.length, selectors });

        return selectors;
    }

    function matchesSafely(el, selector) {
        try {
            return el.matches(selector);
        } catch {
            return null;
        }
    }

    /*
     * Whether any :hover rule could style the element differently when it
     * isn't hovered. Each selector is matched with :hover forced on and
     * forced off: if that changes the result, the rule depends on hover.
     *
     * The inspected element is the deepest one under the pointer, so only
     * it and its ancestors are hovered, and a clone can only drop its own
     * hover. Rules that depend on an ancestor's hover make this return true
     * without the clone showing a difference, which is wasted work but
     * never a wrong result. When a sheet can't be read, assume a rule might.
     */
    function hoverMayApply(el) {
        const root = el.getRootNode();

        const sheets = [
            ...(root.styleSheets || []),
            ...(root.adoptedStyleSheets || [])
        ];

        for (const sheet of sheets) {
            const selectors = hoverSelectors(sheet);

            if (!selectors) {
                return true;
            }

            for (const selector of selectors) {
                const hovered = matchesSafely(el, selector.replace(/:hover\b/g, ":is(*)"));
                const normal = matchesSafely(el, selector.replace(/:hover\b/g, ":not(*)"));

                if (hovered === null || normal === null || hovered !== normal) {
                    return true;
                }
            }
        }

        return false;
    }

    /*
     * A deep clone with the parts that would act on the page disabled.
     * While connected, an iframe would load its page, autoplaying media
     * would start fetching, and a checked radio would uncheck the original
     * in its group. Custom elements in the clone still run their
     * constructors and lifecycle callbacks.
     */
    function inertClone(el) {
        const clone = el.cloneNode(true);

        for (const node of [clone, ...clone.querySelectorAll("*")]) {
            if (node instanceof HTMLIFrameElement) {
                node.removeAttribute("src");
                node.removeAttribute("srcdoc");
            } else if (node instanceof HTMLObjectElement) {
                node.removeAttribute("data");
            } else if (node instanceof HTMLEmbedElement) {
                node.removeAttribute("src");
            } else if (node instanceof HTMLMediaElement) {
                node.removeAttribute("autoplay");
                node.preload = "none";
            } else if (node instanceof HTMLInputElement && node.type === "radio") {
                node.removeAttribute("name");
            }
        }

        Object.assign(clone.style, {
            visibility: "hidden",
            pointerEvents: "none"
        });

        return clone;
    }

    // `place` is "before" or "after" the original. The clone has no layout
    // overrides, so position, display and size come out as the page styles
    // them. It's removed before the next paint, so the page never visibly
    // shifts.
    function getCloneStyles(el, place, behind) {
        const clone = inertClone(el);

        el[place](clone);

        const styles = getStyles(clone, behind);

        clone.remove();

        return styles;
    }

    /*
     * Get approximately the non-hovered state by cloning the element.
     *
     * A freshly inserted clone isn't in the pointer's hover chain, so
     * :hover does not apply to it. When no :hover rule could apply, the
     * normal state is the hovered one and no clone is made.
     *
     * The clone is a sibling, so structural selectors can match it
     * differently. Placed before the original, it keeps the original's
     * :nth-child, :first-child, + and ~ matches, but not :last-child or
     * :nth-last-child. So when values differ, they're measured again with
     * the clone after the original. A difference that depends on where the
     * clone sits comes from structure rather than hover, so it's dropped.
     *
     * `hover` must be measured before any clone is inserted, since the
     * clone also changes the original's structural matches.
     */
    function getNormalStyles(el, hover) {
        if (!hoverMayApply(el)) {
            return hover;
        }

        const behind = elementsBehind(el);
        const normal = getCloneStyles(el, "before", behind);

        const changed = Object.keys(normal).filter(
            property => normal[property] !== hover[property]
        );

        if (!changed.length) {
            return normal;
        }

        const after = getCloneStyles(el, "after", behind);

        for (const property of changed) {
            if (after[property] !== normal[property]) {
                normal[property] = hover[property];
            }
        }

        return normal;
    }

    function collapseBorderColors(styles) {
        const colors = borderColorProperties.map(
            property => styles[property]
        );

        return colors.every(
            color => color === colors[0]
        );
    }

    Scope.styles = {
        properties,
        borderColorProperties,
        isDefault,
        isGapContainer,
        toCssName,
        declaration,
        boxLayers,
        boxSides,
        getStyles,
        getNormalStyles,
        collapseBorderColors
    };
})(globalThis.Scope ??= {});
