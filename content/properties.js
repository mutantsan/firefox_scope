/*
 * The tooltip rows a user can hide from the toolbar popup, grouped as the
 * popup lists them. Loaded by both the content script and the popup.
 *
 * Keys are the tooltip's own row names: borderColor stands for the four
 * border-*-color rows, and contrast, renderedFont and the Accessibility
 * rows are worked out by Scope rather than read from CSS. boxModel is the
 * box model diagram below the rows.
 *
 * The settings store the hidden keys, so rows added later are shown by
 * default, except those in hiddenByDefault, which are shown only once
 * they're stored as shown.
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
            keys: [
                "margin",
                "padding",
                "width",
                "height",
                "boxSizing",
                "border",
                "borderRadius",
                "boxModel"
            ]
        },
        {
            title: "Layout",
            keys: [
                "display",
                "flexDirection",
                "justifyContent",
                "alignItems",
                "gridTemplateColumns",
                "gridTemplateRows",
                "gap",
                "position",
                "zIndex",
                "overflow",
                "transform",
                "opacity"
            ]
        },
        {
            title: "Accessibility",
            keys: ["accessibleName", "role", "focusable"]
        }
    ];

    // Not about CSS, so left for those who switch them on.
    const hiddenByDefault = new Set(["accessibleName", "role", "focusable"]);

    // The hidden keys, from the stored hiddenProperties and shownProperties.
    function hiddenKeys(hiddenProperties = [], shownProperties = []) {
        const hidden = new Set(hiddenProperties);

        for (const key of hiddenByDefault) {
            if (!shownProperties.includes(key)) {
                hidden.add(key);
            }
        }

        return hidden;
    }

    const derivedLabels = {
        contrast: "WCAG contrast",
        renderedFont: "rendered font",
        boxModel: "box model",
        accessibleName: "name",
        focusable: "keyboard-focusable"
    };

    // The CSS name for properties, as the tooltip shows them.
    function propertyLabel(key) {
        return derivedLabels[key] ??
            key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
    }

    Scope.properties = { propertyGroups, hiddenByDefault, hiddenKeys, propertyLabel };
})(globalThis.Scope ??= {});
