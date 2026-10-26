/*
 * The tooltip rows a user can hide from the toolbar popup, grouped as the
 * popup lists them. Loaded by both the content script and the popup.
 *
 * Keys are the tooltip's own row names: borderColor stands for the four
 * border-*-color rows, and contrast and renderedFont are worked out by
 * Scope rather than read from CSS. The setting stores the hidden keys, so
 * rows added later are shown by default.
 */
(function (Scope) {
    "use strict";

    const propertyGroups = [
        {
            title: "Colors",
            keys: ["color", "backgroundColor", "borderColor", "outlineColor", "contrast"]
        },
        {
            title: "Typography",
            keys: ["fontFamily", "fontSize", "fontWeight", "lineHeight", "renderedFont"]
        },
        {
            title: "Box",
            keys: ["margin", "padding", "width", "height", "border", "borderRadius"]
        },
        {
            title: "Layout",
            keys: ["display", "gap", "position", "opacity"]
        }
    ];

    const derivedLabels = {
        contrast: "WCAG contrast",
        renderedFont: "rendered font"
    };

    // The CSS name for properties, as the tooltip shows them.
    function propertyLabel(key) {
        return derivedLabels[key] ??
            key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
    }

    Scope.properties = { propertyGroups, propertyLabel };
})(globalThis.Scope ??= {});
