/*
 * Runs on every page in place of Scope while "always ready" is on, and
 * asks the background script to start Scope on the first Shift press.
 * Until then it only notes where the pointer is and whether Shift is
 * held, which Scope picks up when it starts.
 */
(function (Scope) {
    "use strict";

    if (Scope.inspector || Scope.loader) {
        return;
    }

    const state = { target: null, x: 0, y: 0, shift: false };
    let requested = false;

    function load() {
        if (requested) {
            return;
        }

        requested = true;

        browser.runtime.sendMessage({ scopeLoad: true })
            .catch(() => {
                requested = false;
            });
    }

    // Scope's own check also looks into closed shadow roots, which needs
    // its tree module, so a field in one may load Scope here needlessly.
    const nonTextInputs = new Set([
        "button", "checkbox", "color", "file", "image",
        "radio", "range", "reset", "submit"
    ]);

    function typing() {
        let el = document.activeElement;

        while (el?.shadowRoot?.activeElement) {
            el = el.shadowRoot.activeElement;
        }

        if (el instanceof HTMLInputElement) {
            return !nonTextInputs.has(el.type);
        }

        return el instanceof HTMLTextAreaElement || Boolean(el?.isContentEditable);
    }

    function onMouseMove(event) {
        const target = event.composedPath()[0];

        if (target instanceof Element) {
            state.target = target;
            state.x = event.clientX;
            state.y = event.clientY;
        }
    }

    // As in Scope: leaving into a child frame or out of this one means
    // nothing here is under the pointer.
    function onMouseOut(event) {
        const to = event.relatedTarget;

        if (
            !to ||
            to instanceof HTMLIFrameElement ||
            to instanceof HTMLFrameElement
        ) {
            state.target = null;
        }
    }

    function onKeyDown(event) {
        if (event.key === "Shift" && !event.repeat && !typing()) {
            state.shift = true;
            load();
        }
    }

    function onKeyUp(event) {
        if (event.key === "Shift") {
            state.shift = false;
        }
    }

    function onBlur() {
        state.shift = false;
    }

    // Shift pressed while another frame has focus, passed on by Scope
    // there, e.g. in a frame added after Scope started.
    function onMessage({ scopeKey }) {
        if (scopeKey?.key === "Shift") {
            state.shift = scopeKey.type === "keydown";

            if (state.shift) {
                load();
            }
        }
    }

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseout", onMouseOut, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    browser.runtime.onMessage.addListener(onMessage);

    // Called by Scope when it starts, which takes over from here.
    function stop() {
        document.removeEventListener("mousemove", onMouseMove, true);
        document.removeEventListener("mouseout", onMouseOut, true);
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("keyup", onKeyUp, true);
        window.removeEventListener("blur", onBlur);
        browser.runtime.onMessage.removeListener(onMessage);

        return state;
    }

    Scope.loader = { stop };
})(globalThis.Scope ??= {});
