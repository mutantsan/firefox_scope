// styles.js reads Scope.colors and Scope.fonts when it loads. Fonts need a
// canvas, and none of it is used by the functions tested here.
globalThis.Scope = { fonts: {} };
require("../content/tree.js");
require("../content/colors.js");
require("../content/styles.js");

const test = require("node:test");
const assert = require("node:assert/strict");

const { isDefault, isGapContainer, isRelevant, toCssName, declaration, collapseBorderColors } = Scope.styles;

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
    assert.equal(isDefault("boxSizing", "content-box"), true);
    assert.equal(isDefault("boxSizing", "border-box"), false);
    assert.equal(isDefault("flexDirection", "row"), true);
    assert.equal(isDefault("flexDirection", "column"), false);
    assert.equal(isDefault("justifyContent", "normal"), true);
    assert.equal(isDefault("alignItems", "center"), false);
    assert.equal(isDefault("gridTemplateColumns", "none"), true);
    assert.equal(isDefault("gridTemplateRows", "100px 1fr"), false);
    assert.equal(isDefault("zIndex", "auto"), true);
    assert.equal(isDefault("zIndex", "0"), false);
    assert.equal(isDefault("overflow", "visible"), true);
    assert.equal(isDefault("overflow", "visible hidden"), false);
    assert.equal(isDefault("transform", "none"), true);
    assert.equal(isDefault("transform", "matrix(1, 0, 0, 1, 10, 0)"), false);
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

test("isRelevant limits container and z-index rows to where they apply", () => {
    const state = (display, position = "static", isLayoutItem = false) =>
        ({ display, position, isLayoutItem });

    const block = state("block");
    const flex = state("inline-flex");
    const grid = state("grid");

    assert.equal(isRelevant("color", block, block), true);
    assert.equal(isRelevant("gap", block, block), false);
    assert.equal(isRelevant("gap", block, grid), true);
    assert.equal(isRelevant("flexDirection", flex, flex), true);
    assert.equal(isRelevant("flexDirection", grid, grid), false);
    assert.equal(isRelevant("justifyContent", grid, grid), true);
    assert.equal(isRelevant("alignItems", block, block), false);
    assert.equal(isRelevant("gridTemplateColumns", grid, grid), true);
    assert.equal(isRelevant("gridTemplateRows", flex, flex), false);
    assert.equal(isRelevant("zIndex", block, block), false);
    assert.equal(isRelevant("zIndex", state("block", "relative"), block), true);
    assert.equal(isRelevant("zIndex", state("block", "static", true), block), true);
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
