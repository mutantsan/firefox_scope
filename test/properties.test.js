globalThis.Scope = { fonts: {} };
require("../content/tree.js");
require("../content/colors.js");
require("../content/styles.js");
require("../content/properties.js");

const test = require("node:test");
const assert = require("node:assert/strict");

const { propertyGroups, propertyLabel } = Scope.properties;
const { properties, borderColorProperties } = Scope.styles;

const keys = propertyGroups.flatMap(group => group.keys);

test("the popup lists every tooltip row once", () => {
    const rows = [
        ...properties.filter(property => !borderColorProperties.includes(property)),
        "borderColor",
        "contrast",
        "renderedFont",
        "boxModel"
    ];

    assert.deepEqual([...keys].sort(), rows.sort());
});

test("propertyLabel shows CSS names and derived row names", () => {
    assert.equal(propertyLabel("backgroundColor"), "background-color");
    assert.equal(propertyLabel("contrast"), "WCAG contrast");
    assert.equal(propertyLabel("renderedFont"), "rendered font");
    assert.equal(propertyLabel("boxModel"), "box model");
});
