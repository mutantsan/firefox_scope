// styles.js reads Scope.colors and Scope.fonts when it loads. Fonts need a
// canvas, and none of it is used by the functions tested here.
globalThis.Scope = { fonts: {} };
require("../content/colors.js");
require("../content/styles.js");

const test = require("node:test");
const assert = require("node:assert/strict");

const { isDefault, isGapContainer, toCssName, declaration, collapseBorderColors } = Scope.styles;

test("isDefault recognizes default values", () => {
    assert.equal(isDefault("margin", "0px"), true);
    assert.equal(isDefault("margin", "0px 0px 0px 0px"), true);
    assert.equal(isDefault("margin", "0px 4px"), false);
    assert.equal(isDefault("padding", "-0px"), true);
    assert.equal(isDefault("borderRadius", "0px"), true);
    assert.equal(isDefault("border", "0px none #000000"), true);
    assert.equal(isDefault("border", "1px solid #000000"), false);
    assert.equal(isDefault("position", "static"), true);
    assert.equal(isDefault("position", "relative"), false);
    assert.equal(isDefault("opacity", "1"), true);
    assert.equal(isDefault("opacity", "0.5"), false);
    assert.equal(isDefault("gap", "normal"), true);
});

test("isDefault never hides properties without a default", () => {
    assert.equal(isDefault("color", "#000000"), false);
    assert.equal(isDefault("width", "0px"), false);
    assert.equal(isDefault("margin", "auto"), false);
});

test("isGapContainer matches flex and grid displays", () => {
    assert.equal(isGapContainer("flex"), true);
    assert.equal(isGapContainer("inline-flex"), true);
    assert.equal(isGapContainer("inline-grid"), true);
    assert.equal(isGapContainer("block flex"), true);
    assert.equal(isGapContainer("block"), false);
    assert.equal(isGapContainer("flow-root"), false);
});

test("toCssName and declaration write CSS", () => {
    assert.equal(toCssName("borderTopLeftRadius"), "border-top-left-radius");
    assert.equal(toCssName("color"), "color");
    assert.equal(declaration("backgroundColor", "#ffffff"), "background-color: #ffffff;");
});

test("collapseBorderColors is true when all four sides match", () => {
    const sides = color => ({
        borderTopColor: color,
        borderRightColor: color,
        borderBottomColor: color,
        borderLeftColor: color
    });

    assert.equal(collapseBorderColors(sides("#000000")), true);
    assert.equal(collapseBorderColors({ ...sides("#000000"), borderLeftColor: "#ffffff" }), false);
});
