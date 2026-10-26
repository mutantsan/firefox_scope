// The content scripts add to a global `Scope`, as they do in the browser.
globalThis.Scope = {};
require("../content/colors.js");

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    toHexColor,
    formatValue,
    findColor,
    parseColor,
    luminance,
    contrastRatio,
    rateContrast,
    isLargeText
} = Scope.colors;

test("toHexColor converts sRGB colors", () => {
    assert.equal(toHexColor("rgb(255, 0, 0)"), "#ff0000");
    assert.equal(toHexColor("rgb(222, 226, 230)"), "#dee2e6");
    assert.equal(toHexColor("rgb(10 20 30)"), "#0a141e");
    assert.equal(toHexColor("color(srgb 0.5 0.5 0.5)"), "#808080");
});

test("toHexColor keeps alpha below 1 as a fourth byte", () => {
    assert.equal(toHexColor("rgba(0, 0, 0, 0.5)"), "#00000080");
    assert.equal(toHexColor("rgb(10 20 30 / 50%)"), "#0a141e80");
    assert.equal(toHexColor("rgba(0, 0, 0, 0)"), "#00000000");
});

test("toHexColor converts modern color spaces inside sRGB", () => {
    assert.equal(toHexColor("oklab(1 0 0)"), "#ffffff");
    assert.equal(toHexColor("oklch(0 0 0)"), "#000000");
    assert.equal(toHexColor("lch(100 0 0)"), "#ffffff");
    assert.equal(toHexColor("lab(50 0 0)"), "#777777");
    assert.equal(toHexColor("oklch(0.628 0.2577 29.23)"), "#ff0000");
    assert.equal(toHexColor("color(display-p3 1 1 1)"), "#ffffff");
});

test("toHexColor keeps colors outside sRGB as written", () => {
    assert.equal(toHexColor("color(display-p3 1 0 0)"), "color(display-p3 1 0 0)");
    assert.equal(toHexColor("oklch(0.7 0.4 150)"), "oklch(0.7 0.4 150)");
});

test("toHexColor leaves anything else alone", () => {
    assert.equal(toHexColor("transparent"), "transparent");
    assert.equal(toHexColor("rgb(nope)"), "rgb(nope)");
    assert.equal(toHexColor("color(unknown 1 0 0)"), "color(unknown 1 0 0)");
});

test("parseColor returns clipped [r, g, b, alpha]", () => {
    assert.deepEqual(parseColor("rgb(255, 0, 0)"), [255, 0, 0, 1]);
    assert.deepEqual(parseColor("rgba(0, 0, 0, 0.5)"), [0, 0, 0, 0.5]);
    assert.deepEqual(parseColor("rgb(0 0 0 / none)"), [0, 0, 0, 0]);
    assert.deepEqual(parseColor("color(display-p3 1 0 0)"), [255, 0, 0, 1]);
    assert.equal(parseColor("red"), null);
});

test("formatValue converts color properties and colors inside border", () => {
    assert.equal(formatValue("color", "rgb(0, 0, 0)"), "#000000");
    assert.equal(formatValue("borderTopColor", "rgb(255, 255, 255)"), "#ffffff");
    assert.equal(
        formatValue("border", "1px solid rgb(222, 226, 230)"),
        "1px solid #dee2e6"
    );
    assert.equal(formatValue("width", "rgb(0, 0, 0)"), "rgb(0, 0, 0)");
});

test("findColor finds the first color in a formatted value", () => {
    assert.equal(findColor("1px solid #dee2e6"), "#dee2e6");
    assert.equal(findColor("#00000080"), "#00000080");
    assert.equal(findColor("2px dashed color(display-p3 1 0 0)"), "color(display-p3 1 0 0)");
    assert.equal(findColor("12px"), null);
});

test("luminance follows WCAG 2", () => {
    assert.equal(luminance([0, 0, 0]), 0);
    assert.equal(luminance([255, 255, 255]), 1);
    assert.ok(Math.abs(luminance([255, 0, 0]) - 0.2126) < 1e-9);
});

test("contrastRatio is symmetric and spans 1 to 21", () => {
    assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
    assert.equal(contrastRatio([255, 255, 255], [0, 0, 0]), 21);
    assert.equal(contrastRatio([90, 90, 90], [90, 90, 90]), 1);
});

test("rateContrast uses the normal text thresholds", () => {
    assert.equal(rateContrast(21, false), "21:1  AA ✓  AAA ✓");
    assert.equal(rateContrast(7, false), "7:1  AA ✓  AAA ✓");
    assert.equal(rateContrast(4.5, false), "4.5:1  AA ✓  AAA ✗");
    assert.equal(rateContrast(4.49, false), "4.49:1  AA ✗  AAA ✗");
});

test("rateContrast uses the large text thresholds", () => {
    assert.equal(rateContrast(4.5, true), "4.5:1  AA ✓  AAA ✓  large text");
    assert.equal(rateContrast(3, true), "3:1  AA ✓  AAA ✗  large text");
    assert.equal(rateContrast(2.99, true), "2.99:1  AA ✗  AAA ✗  large text");
});

test("rateContrast truncates, so a failing ratio never shows as passing", () => {
    assert.equal(rateContrast(4.4999, false), "4.49:1  AA ✗  AAA ✗");
    // #767676 on white is the darkest grey that passes AA.
    assert.equal(
        rateContrast(contrastRatio([118, 118, 118], [255, 255, 255]), false),
        "4.54:1  AA ✓  AAA ✗"
    );
});

test("isLargeText is 24px, or 18.66px when bold", () => {
    assert.equal(isLargeText({ fontSize: "24px", fontWeight: "400" }), true);
    assert.equal(isLargeText({ fontSize: "23.9px", fontWeight: "400" }), false);
    assert.equal(isLargeText({ fontSize: "18.66px", fontWeight: "700" }), true);
    assert.equal(isLargeText({ fontSize: "18.66px", fontWeight: "600" }), false);
    assert.equal(isLargeText({ fontSize: "18px", fontWeight: "700" }), false);
});
