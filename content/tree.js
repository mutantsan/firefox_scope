/*
 * Walking the page as it's rendered, the flat tree: into shadow roots,
 * including closed ones, and from a slotted element to the <slot> that
 * shows it.
 */
(function (Scope) {
    "use strict";

    // The elements a page can attach a shadow root to, besides custom
    // elements. Others, like <video> or <details>, only have Firefox's own
    // for their controls, which is left alone.
    const shadowHostNames = new Set([
        "article", "aside", "blockquote", "body", "div", "footer",
        "h1", "h2", "h3", "h4", "h5", "h6", "header", "main", "nav",
        "p", "section", "span"
    ]);

    // openOrClosedShadowRoot is Firefox's way for extensions to see closed
    // roots, dom.openOrClosedShadowRoot() Chrome's. Scope's own UI is one
    // of them and isn't part of the page.
    function shadowRootOf(el) {
        if (
            el === Scope.ui.host ||
            !(el.localName.includes("-") || shadowHostNames.has(el.localName))
        ) {
            return null;
        }

        return el.openOrClosedShadowRoot ??
            browser.dom?.openOrClosedShadowRoot(el) ??
            el.shadowRoot ??
            null;
    }

    /*
     * The innermost element at a point, starting from `el`, the one found
     * outside. Hit testing in a document stops at a closed shadow root's
     * host, so each host found is searched again from its own root.
     */
    function deepestAt(el, x, y) {
        for (let root = shadowRootOf(el); root; root = shadowRootOf(el)) {
            const inner = root.elementFromPoint(x, y);

            if (!inner || inner === el) {
                break;
            }

            el = inner;
        }

        return el;
    }

    // assignedSlot is null when the slot is in a closed root, so then the
    // host's slots are searched.
    function assignedSlotOf(el) {
        if (el.assignedSlot) {
            return el.assignedSlot;
        }

        const root = el.parentElement && shadowRootOf(el.parentElement);

        if (!root) {
            return null;
        }

        return [...root.querySelectorAll("slot")].find(
            slot => slot.assignedElements().includes(el)
        ) ?? null;
    }

    // A slotted element's parent is its slot, and a shadow root's top
    // elements' is the host.
    function flatParent(el) {
        return (
            assignedSlotOf(el) ||
            el.parentElement ||
            el.getRootNode().host ||
            null
        );
    }

    // A host shows its shadow root rather than its own children, and a
    // slot its assigned elements, or its fallback content without any.
    function flatChildren(el) {
        if (el instanceof HTMLSlotElement) {
            const assigned = el.assignedElements();

            return assigned.length ? assigned : [...el.children];
        }

        return [...(shadowRootOf(el) ?? el).children];
    }

    // The focused element, in whichever shadow root it is. A key event's
    // target stops at a closed root's host.
    function focusedElement() {
        let el = document.activeElement;
        let root;

        while (el && (root = shadowRootOf(el)) && root.activeElement) {
            el = root.activeElement;
        }

        return el;
    }

    // Elements without a box, e.g. <script> or display: none, have nothing
    // to show, and the UI host isn't part of the page.
    function hasBox(el) {
        return el !== Scope.ui.host && el.getClientRects().length > 0;
    }

    // Skips ancestors without a box, like a <slot>, which is display:
    // contents by default.
    function renderedParent(el) {
        let parent = flatParent(el);

        while (parent && !hasBox(parent)) {
            parent = flatParent(parent);
        }

        return parent;
    }

    // The children with a box. Those of a display: contents child, like a
    // <slot>, are laid out as if they were the element's own.
    function renderedChildren(el) {
        return flatChildren(el).flatMap(child => {
            if (hasBox(child)) {
                return [child];
            }

            return window.getComputedStyle(child).display === "contents"
                ? renderedChildren(child)
                : [];
        });
    }

    Scope.tree = {
        deepestAt,
        focusedElement,
        flatParent,
        renderedParent,
        renderedChildren
    };
})(globalThis.Scope ??= {});
