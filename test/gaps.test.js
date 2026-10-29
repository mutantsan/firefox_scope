// gaps.js adds its styles when it loads; its elements are only made when
// drawn, so it loads without a DOM.
globalThis.Scope = { ui: { addStyles() {} } };
require("../content/gaps.js");

const test = require("node:test");
const assert = require("node:assert/strict");

const { gapRects } = Scope.gaps;

function box(left, top, width, height) {
    return { left, top, right: left + width, bottom: top + height };
}

test("gapRects finds the space between items in a row", () => {
    const rects = gapRects([box(0, 0, 50, 20), box(60, 0, 50, 20), box(130, 0, 50, 20)]);

    assert.deepEqual(rects, [
        { left: 50, right: 60, top: 0, bottom: 20, horizontal: true },
        { left: 110, right: 130, top: 0, bottom: 20, horizontal: true }
    ]);
});

test("gapRects finds the space between stacked items, across what they share", () => {
    const rects = gapRects([box(0, 0, 100, 20), box(10, 30, 50, 20)]);

    assert.deepEqual(rects, [
        { left: 10, right: 60, top: 20, bottom: 30, horizontal: false }
    ]);
});

test("gapRects finds row and column gaps in a grid, once each", () => {
    const rects = gapRects([
        box(0, 0, 40, 40), box(50, 0, 40, 40),
        box(0, 50, 40, 40), box(50, 50, 40, 40)
    ]);

    assert.equal(rects.length, 4);
    assert.equal(rects.filter(rect => rect.horizontal).length, 2);
});

test("gapRects skips touching, overlapping and diagonal items", () => {
    assert.deepEqual(gapRects([box(0, 0, 50, 20), box(50, 0, 50, 20)]), []);
    assert.deepEqual(gapRects([box(0, 0, 50, 20), box(40, 0, 50, 20)]), []);
    assert.deepEqual(gapRects([box(0, 0, 50, 20), box(60, 30, 50, 20)]), []);
});

test("gapRects skips space another item sits in", () => {
    // An inline tag whose box reaches into the heading below it, then a
    // paragraph: no gap from the tag past the heading to the paragraph.
    const rects = gapRects([box(0, 0, 30, 24), box(0, 20, 200, 30), box(0, 66, 200, 40)]);

    assert.deepEqual(rects, [
        { left: 0, right: 200, top: 50, bottom: 66, horizontal: false }
    ]);
});

// Just enough of an element for laidOutChildren: its children and the
// computed style it reads.
function el(style = {}, children = []) {
    return { style: { display: "block", position: "static", ...style }, children };
}

test("laidOutChildren skips hidden and out-of-flow children", () => {
    globalThis.window = { getComputedStyle: node => node.style };

    const shown = el();
    const parent = el({}, [shown, el({ display: "none" }), el({ position: "absolute" }), el({ position: "fixed" })]);

    assert.deepEqual(Scope.gaps.laidOutChildren(parent), [shown]);
});

test("laidOutChildren lays out a display: contents child's children in its place", () => {
    globalThis.window = { getComputedStyle: node => node.style };

    const [a, b, c] = [el(), el(), el()];
    const parent = el({ display: "grid" }, [
        el({ display: "contents" }, [a]),
        el({ display: "contents" }, [el({ display: "contents" }, [b])]),
        c
    ]);

    assert.deepEqual(Scope.gaps.laidOutChildren(parent), [a, b, c]);
});
