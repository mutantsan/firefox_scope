// Reading an element's computed styles, in normal and hovered state.
(function (Scope) {
    "use strict";

    const { formatValue, contrastSummary } = Scope.colors;

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

    function getStyles(el) {
        const computed = window.getComputedStyle(el);
        const result = {};

        properties.forEach(property => {
            result[property] = formatValue(
                property,
                computed[property]
            );
        });

        result.contrast = contrastSummary(el, computed);

        // outline-color computes to a color (currentcolor by default) even
        // when no outline is drawn, so its row is only shown when one is.
        result.hasOutline =
            computed.outlineStyle !== "none" &&
            parseFloat(computed.outlineWidth) > 0;

        return result;
    }

    /*
     * Get approximately the non-hovered state by cloning the element.
     *
     * A freshly inserted clone isn't in the pointer's hover chain, so
     * :hover does not apply to it. It is placed right after the original
     * with no layout overrides, so position, display and size come out as
     * the page styles them. It's removed before the next paint, so the
     * page never visibly shifts.
     */
    function getNormalStyles(el) {
        const clone = el.cloneNode(true);

        Object.assign(clone.style, {
            visibility: "hidden",
            pointerEvents: "none"
        });

        el.after(clone);

        const styles = getStyles(clone);

        clone.remove();

        return styles;
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
