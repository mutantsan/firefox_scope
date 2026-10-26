/*
 * Distances between the inspected element and a second one, shown while Alt
 * is held, like Figma's and Chrome's inspect.
 *
 * Elements apart from each other get one line per axis they are apart on,
 * across the gap. Elements that overlap, e.g. a child inside its parent, get
 * a line between each pair of matching edges. Lines end on the inspected
 * element's edge, where its guides run.
 */
(function (Scope) {
    "use strict";

    const color = "#f24822";

    // The most lines one measurement needs: matching edges on both axes.
    const maxLines = 4;

    let from = null;
    let to = null;

    const target = document.createElement("div");

    Object.assign(target.style, {
        position: "fixed",
        zIndex: "2147483646",
        display: "none",

        boxSizing: "border-box",
        border: `1px solid ${color}`,

        pointerEvents: "none"
    });

    const lines = [];
    const labels = [];

    for (let i = 0; i < maxLines; i++) {
        const line = document.createElement("div");

        Object.assign(line.style, {
            position: "fixed",
            zIndex: "2147483646",
            display: "none",

            background: color,

            pointerEvents: "none"
        });

        const label = document.createElement("div");

        Object.assign(label.style, {
            position: "fixed",
            zIndex: "2147483646",
            display: "none",

            padding: "0 4px",

            background: color,
            color: "#fff",
            borderRadius: "3px",

            fontFamily: "monospace",
            fontSize: "11px",
            lineHeight: "16px",

            whiteSpace: "nowrap",
            pointerEvents: "none"
        });

        lines.push(line);
        labels.push(label);
    }

    Scope.ui.root.append(target, ...lines, ...labels);

    function round(n) {
        return Math.round(n * 100) / 100;
    }

    function apart(aStart, aEnd, bStart, bEnd) {
        return bStart >= aEnd || aStart >= bEnd;
    }

    // [start, end] of the space between two ranges that don't overlap.
    function gap(aStart, aEnd, bStart, bEnd) {
        return bStart >= aEnd ? [aEnd, bStart] : [bEnd, aStart];
    }

    // Where a line crosses the other axis: the middle of the part both
    // elements share, or the middle of the second element if they share
    // none.
    function middle(aStart, aEnd, bStart, bEnd) {
        const start = Math.max(aStart, bStart);
        const end = Math.min(aEnd, bEnd);

        return end > start ? (start + end) / 2 : (bStart + bEnd) / 2;
    }

    // Lines as [horizontal, start, end, cross].
    function measureLines(a, b) {
        const x = [a.left, a.right, b.left, b.right];
        const y = [a.top, a.bottom, b.top, b.bottom];

        const apartX = apart(...x);
        const apartY = apart(...y);

        const result = [];

        if (apartX || apartY) {
            if (apartX) {
                result.push([true, ...gap(...x), middle(...y)]);
            }

            if (apartY) {
                result.push([false, ...gap(...y), middle(...x)]);
            }
        } else {
            const crossY = middle(...y);
            const crossX = middle(...x);

            result.push(
                [true, a.left, b.left, crossY],
                [true, a.right, b.right, crossY],
                [false, a.top, b.top, crossX],
                [false, a.bottom, b.bottom, crossX]
            );
        }

        return result
            .map(([horizontal, p, q, cross]) =>
                [horizontal, Math.min(p, q), Math.max(p, q), cross]
            )
            .filter(([, start, end]) => round(end - start) > 0);
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(n, max));
    }

    function drawLine(line, label, [horizontal, start, end, cross]) {
        const length = end - start;

        Object.assign(line.style, {
            display: "block",
            left: (horizontal ? start : cross) + "px",
            top: (horizontal ? cross : start) + "px",
            width: (horizontal ? length : 1) + "px",
            height: (horizontal ? 1 : length) + "px"
        });

        label.textContent = String(round(length));
        label.style.display = "block";

        // Below a horizontal line or right of a vertical one, centered on
        // it and kept in the viewport.
        const width = label.offsetWidth;
        const height = label.offsetHeight;
        const center = start + length / 2;

        const left = horizontal ? center - width / 2 : cross + 4;
        const top = horizontal ? cross + 4 : center - height / 2;

        label.style.left = clamp(left, 0, window.innerWidth - width) + "px";
        label.style.top = clamp(top, 0, window.innerHeight - height) + "px";
    }

    function hideLines() {
        for (const el of [...lines, ...labels]) {
            el.style.display = "none";
        }
    }

    function position() {
        if (!from || !to) {
            return;
        }

        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();

        Object.assign(target.style, {
            display: "block",
            left: b.left + "px",
            top: b.top + "px",
            width: b.width + "px",
            height: b.height + "px"
        });

        hideLines();

        measureLines(a, b).forEach((measured, i) => {
            drawLine(lines[i], labels[i], measured);
        });
    }

    function show(fromElement, toElement) {
        if (!fromElement || !toElement || fromElement === toElement) {
            hide();
            return;
        }

        from = fromElement;
        to = toElement;
        position();
    }

    function hide() {
        from = null;
        to = null;

        target.style.display = "none";
        hideLines();
    }

    Scope.measure = { show, hide, position };
})(globalThis.Scope ??= {});
