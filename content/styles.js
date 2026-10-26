// Reading an element's computed styles, in normal and hovered state.
(function (Scope) {
    "use strict";

    const { formatValue, contrastSummary, ancestorsOf, elementsBehind } = Scope.colors;
    const { renderedFont } = Scope.fonts;

    const properties = [
        "color",
        "backgroundColor",
        "borderTopColor",
        "borderRightColor",
        "borderBottomColor",
        "borderLeftColor",
        "outlineColor",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "margin",
        "padding",
        "width",
        "height",
        "boxSizing",
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
        "border",
        "borderRadius",
        "opacity"
    ];

    const borderColorProperties = [
        "borderTopColor",
        "borderRightColor",
        "borderBottomColor",
        "borderLeftColor"
    ];

    // Rows hidden when they hold the default in both states, unless the
    // "Show default values" setting is on. The box model diagram still
    // shows every side of margin, border and padding.
    function isZero(value) {
        const numbers = value.match(/-?\d*\.?\d+/g);

        return !!numbers && numbers.every(n => parseFloat(n) === 0);
    }

    const defaultChecks = {
        margin: isZero,
        padding: isZero,
        borderRadius: isZero,
        // The border shorthand ends with a color, so only its width counts.
        border: value => /^0px\b/.test(value),
        position: value => value === "static",
        opacity: value => parseFloat(value) === 1,
        gap: value => value === "normal",
        boxSizing: value => value === "content-box",
        flexDirection: value => value === "row",
        justifyContent: value => value === "normal",
        alignItems: value => value === "normal",
        gridTemplateColumns: value => value === "none",
        gridTemplateRows: value => value === "none",
        zIndex: value => value === "auto",
        // The shorthand computes to one value per axis when they differ.
        overflow: value => value.split(" ").every(part => part === "visible"),
        transform: value => value === "none"
    };

    function isDefault(property, value) {
        return !!defaultChecks[property]?.(value);
    }

    function isFlexContainer(display) {
        return /\bflex\b/.test(display);
    }

    function isGridContainer(display) {
        return /\bgrid\b/.test(display);
    }

    function isGapContainer(display) {
        return isFlexContainer(display) || isGridContainer(display);
    }

    // Rows for properties that only affect some elements, which elsewhere
    // are noise. Each check gets a result of getStyles().
    const relevanceChecks = {
        gap: state => isGapContainer(state.display),
        flexDirection: state => isFlexContainer(state.display),
        justifyContent: state => isGapContainer(state.display),
        alignItems: state => isGapContainer(state.display),
        gridTemplateColumns: state => isGridContainer(state.display),
        gridTemplateRows: state => isGridContainer(state.display),
        // z-index applies to positioned elements and flex and grid items.
        zIndex: state => state.position !== "static" || state.isLayoutItem
    };

    // A row is shown when its property is relevant in either state.
    function isRelevant(property, normal, hover) {
        const check = relevanceChecks[property];

        return !check || check(normal) || check(hover);
    }

    function toCssName(property) {
        return property.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
    }

    function declaration(property, value) {
        return `${toCssName(property)}: ${value};`;
    }

    // -------------------------------------------------------------------------
    // Box model
    // -------------------------------------------------------------------------

    // Shared by the page overlays and the tooltip's diagram.
    const boxLayers = [
        // Solid fills rather than translucent tints, which would compound
        // as the layers nest. The border is a solid line, like DevTools, so
        // it reads as the element's edge rather than another spacing area.
        { name: "margin", tint: "#edff64", fill: "#33361a", line: "1px dashed", side: s => `margin-${s}` },
        { name: "border", tint: "#aaaaaa", fill: "#2a2a2a", line: "2px solid", side: s => `border-${s}-width` },
        { name: "padding", tint: "#a99eff", fill: "#26213f", line: "1px dashed", side: s => `padding-${s}` }
    ];

    const boxSides = ["top", "right", "bottom", "left"];

    // -------------------------------------------------------------------------
    // Style collection
    // -------------------------------------------------------------------------

    // `behind` is found from the original when `el` is a clone, see
    // contrastSummary().
    function getStyles(el, behind = elementsBehind(el)) {
        const computed = window.getComputedStyle(el);
        const result = {};

        properties.forEach(property => {
            result[property] = formatValue(
                property,
                computed[property]
            );
        });

        result.contrast = contrastSummary(el, computed, behind);
        result.renderedFont = renderedFont(el, computed);

        // outline-color computes to a color (currentcolor by default) even
        // when no outline is drawn, so its row is only shown when one is.
        result.hasOutline =
            computed.outlineStyle !== "none" &&
            parseFloat(computed.outlineWidth) > 0;

        const parent = Scope.tree.renderedParent(el);

        result.isLayoutItem =
            !!parent && isGapContainer(window.getComputedStyle(parent).display);

        return result;
    }

    // -------------------------------------------------------------------------
    // Normal (non-hovered) state
    // -------------------------------------------------------------------------

    // The :hover rules of each stylesheet with their resolved selectors,
    // cached until the sheet's rule count changes, e.g. when CSS-in-JS
    // inserts a rule.
    const hoverRuleCache = new WeakMap();

    // A nested rule's selector is relative to its parent style rule, so it
    // is resolved into one that Element.matches() understands.
    function resolveSelector(rule) {
        let parent = rule.parentRule;

        while (parent && !(parent instanceof CSSStyleRule)) {
            parent = parent.parentRule;
        }

        if (!parent) {
            return rule.selectorText;
        }

        const scope = `:is(${resolveSelector(parent)})`;
        const own = rule.selectorText;

        return own.includes("&")
            ? own.replaceAll("&", scope)
            : `${scope} :is(${own})`;
    }

    function collectHoverRules(rules, found) {
        for (const rule of rules) {
            if (rule instanceof CSSImportRule) {
                if (rule.styleSheet) {
                    collectHoverRules(rule.styleSheet.cssRules, found);
                }

                continue;
            }

            // Resolved first, since a nested rule can depend on its parent's
            // :hover, e.g. `.card:hover { .title { … } }`.
            if (rule instanceof CSSStyleRule) {
                const selector = resolveSelector(rule);

                if (selector.includes(":hover")) {
                    found.push({ rule, selector });
                }
            }

            // Grouping rules (@media, @supports, @layer…) and nesting.
            if (rule.cssRules) {
                collectHoverRules(rule.cssRules, found);
            }
        }

        return found;
    }

    // Null when the sheet can't be read, e.g. a cross-origin one.
    function hoverRules(sheet) {
        let rules;

        try {
            rules = sheet.cssRules;
        } catch {
            return null;
        }

        const cached = hoverRuleCache.get(sheet);

        if (cached && cached.count === rules.length) {
            return cached.found;
        }

        let found;

        try {
            found = collectHoverRules(rules, []);
        } catch {
            // An unreadable @import.
            return null;
        }

        hoverRuleCache.set(sheet, { count: rules.length, found });

        return found;
    }

    // -------------------------------------------------------------------------
    // Readable copies of cross-origin sheets
    // -------------------------------------------------------------------------

    // Relative url()s in a sheet's text resolved against the sheet's URL,
    // for a copy placed in the page. Fragment-only ones like `url(#clip)`
    // point into the document and are kept.
    function absoluteUrls(text, base) {
        return text.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (match, quote, url) => {
            if (!url || url.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(url)) {
                return match;
            }

            try {
                return `url(${quote}${new URL(url, base).href}${quote})`;
            } catch {
                return match;
            }
        });
    }

    /*
     * Each cross-origin sheet's text by URL, fetched as the page would with
     * CORS, so only text the page could read itself is used: the copy is
     * briefly in the page, where its scripts could see it. Holds "loading"
     * while fetching, null when the text can't be had or used, otherwise
     * the text and a parsed copy for finding its :hover rules off the page.
     * A sheet with @import is skipped, since a copy loads imports later.
     */
    const sheetCopies = new Map();
    let sheetLoadedListener = () => {};

    function onSheetLoaded(listener) {
        sheetLoadedListener = listener;
    }

    // Firefox gives content scripts the page's fetch as content.fetch, while
    // Chrome's own fetch already runs as the page. Checked by type, since an
    // element with id="content" can also show up as `content`.
    function pageFetch(url, options) {
        const page =
            typeof content !== "undefined" && typeof content.fetch === "function"
                ? content
                : globalThis;

        return page.fetch(url, options);
    }

    async function loadSheetCopy(href) {
        sheetCopies.set(href, "loading");

        let copy = null;

        try {
            const response = await pageFetch(href, {
                mode: "cors",
                credentials: "omit",
                cache: "force-cache"
            });

            const text = response.ok ? await response.text() : "";

            if (text && !/@import/i.test(text)) {
                const parsed = new CSSStyleSheet({ baseURL: href });

                parsed.replaceSync(text);
                copy = { text: absoluteUrls(text, href), parsed };
            }
        } catch {
            // No CORS, blocked by the page's CSP, or not CSS.
        }

        sheetCopies.set(href, copy);

        if (copy) {
            sheetLoadedListener();
        }
    }

    // The copy of an unreadable sheet, or null while there is none. A
    // sheet seen for the first time starts loading.
    function sheetCopy(sheet) {
        const { href, ownerNode } = sheet;

        if (!href || !ownerNode || !/^https?:/.test(href)) {
            return null;
        }

        if (!sheetCopies.has(href)) {
            loadSheetCopy(href);
        }

        const copy = sheetCopies.get(href);

        return copy === "loading" ? null : copy;
    }

    /*
     * Puts a readable copy of the sheet in its place and disables the
     * original, so the cascade order is unchanged. Returns the copy's
     * sheet and an undo, or null when the page's CSP blocks the copy.
     */
    function swapInCopy(sheet, copy) {
        const style = document.createElement("style");

        style.textContent = copy.text;
        style.media = sheet.media.mediaText;
        sheet.ownerNode.after(style);

        const undo = () => {
            style.remove();
            sheet.disabled = false;
        };

        if (!style.sheet || style.sheet.cssRules.length !== copy.parsed.cssRules.length) {
            undo();
            return null;
        }

        sheet.disabled = true;

        return { sheet: style.sheet, undo };
    }

    function matchesSafely(el, selector) {
        try {
            return el.matches(selector);
        } catch {
            return null;
        }
    }

    // Whether the selector matches `el` differently with :hover forced on
    // and forced off. A selector matches() can't take, like one with a
    // pseudo-element, counts as depending on it, and so does one on a
    // shadow root's host, e.g. `:host(:hover)`, since the host is outside
    // the tree the rule is matched in.
    function dependsOnHover(el, selector) {
        if (selector.includes(":host")) {
            return true;
        }

        const hovered = matchesSafely(el, selector.replace(/:hover\b/g, ":is(*)"));
        const normal = matchesSafely(el, selector.replace(/:hover\b/g, ":not(*)"));

        return hovered === null || normal === null || hovered !== normal;
    }

    // Adds the rules in `found` whose :hover could change how one of
    // `nodes` is styled. A nested rule's :hover can sit in a parent rule's
    // selector, so the rules added are the ones in the chain that hold it.
    function addHoverRules(found, nodes, rules) {
        for (const { rule, selector } of found) {
            if (!nodes.some(node => dependsOnHover(node, selector))) {
                continue;
            }

            for (let r = rule; r; r = r.parentRule) {
                if (r instanceof CSSStyleRule && r.selectorText.includes(":hover")) {
                    rules.add(r);
                }
            }
        }
    }

    /*
     * The :hover rules that could style the page around `el` differently
     * when nothing is hovered. Only `el` and its ancestors are hovered,
     * and the ones they style are themselves and the elements painted
     * behind `el`, which count for contrast. Each element is matched only
     * against the sheets of its own tree.
     *
     * A sheet that can't be read, like a cross-origin one, is checked
     * through its copy, see sheetCopy(), and goes in `copied` when its
     * rules need switching off. `unreadable` is set when a sheet that
     * can't be read has no copy, so its rules can't be switched off.
     */
    function findHoverRules(el, behind) {
        const byRoot = new Map();

        for (const node of [...ancestorsOf(el), ...behind]) {
            const root = node.getRootNode();

            byRoot.set(root, [...(byRoot.get(root) || []), node]);
        }

        const rules = new Set();
        const copied = [];
        let unreadable = false;

        for (const [root, nodes] of byRoot) {
            const sheets = [
                ...(root.styleSheets || []),
                ...(root.adoptedStyleSheets || [])
            ];

            for (const sheet of sheets) {
                if (sheet.disabled) {
                    continue;
                }

                const found = hoverRules(sheet);

                if (found) {
                    addHoverRules(found, nodes, rules);
                    continue;
                }

                const copy = sheetCopy(sheet);

                if (!copy) {
                    unreadable = true;
                } else if (hoverRules(copy.parsed).some(({ selector }) =>
                    nodes.some(node => dependsOnHover(node, selector))
                )) {
                    copied.push({ sheet, copy, nodes });
                }
            }
        }

        return { rules, copied, roots: [...byRoot.keys()], unreadable };
    }

    function animationsIn(roots) {
        return new Set(roots.flatMap(root => root.getAnimations()));
    }

    /*
     * Changing the page's styles makes it react as to any other style
     * change: properties with a `transition` start animating toward the
     * new value, so getComputedStyle() would still return the old one,
     * and CSS animations that are added back start over. New transitions
     * are cancelled, which jumps them to their end value, and restarted
     * animations get back the time they had.
     */
    function settleAnimations(roots, before, times) {
        for (const animation of animationsIn(roots)) {
            if (before.has(animation)) {
                continue;
            }

            if ("transitionProperty" in animation) {
                animation.cancel();
            } else if ("animationName" in animation) {
                const time = times.find(t =>
                    t.target === animation.effect?.target &&
                    t.pseudoElement === animation.effect?.pseudoElement &&
                    t.name === animation.animationName
                );

                if (time) {
                    animation.currentTime = time.currentTime;
                }
            }
        }
    }

    /*
     * Runs `measure` with each rule's :hover replaced by :not(*), which
     * nothing matches, so the page is styled as if nothing were hovered.
     * Each copied sheet is first swapped for its copy, whose rules can be
     * rewritten. `measure` is told when the page blocked a copy, leaving
     * :hover rules that couldn't be switched off. Everything is restored
     * before the next paint, so the page never visibly changes. Any
     * transition already running on a hover change jumps to its end.
     */
    function withoutHover(rules, copied, roots, measure) {
        const before = animationsIn(roots);

        const times = [...before]
            .filter(animation => "animationName" in animation)
            .map(animation => ({
                target: animation.effect?.target,
                pseudoElement: animation.effect?.pseudoElement,
                name: animation.animationName,
                currentTime: animation.currentTime
            }));

        const undos = [];
        let original = [];
        let blocked = false;

        try {
            const all = new Set(rules);

            for (const { sheet, copy, nodes } of copied) {
                const swapped = swapInCopy(sheet, copy);

                if (swapped) {
                    undos.push(swapped.undo);
                    addHoverRules(collectHoverRules(swapped.sheet.cssRules, []), nodes, all);
                } else {
                    blocked = true;
                }
            }

            original = [...all].map(rule => [rule, rule.selectorText]);

            for (const [rule, text] of original) {
                rule.selectorText = text.replace(/:hover\b/g, ":not(*)");
            }

            settleAnimations(roots, before, times);

            return measure(blocked);
        } finally {
            for (const [rule, text] of original) {
                rule.selectorText = text;
            }

            for (const undo of undos) {
                undo();
            }

            settleAnimations(roots, before, times);
        }
    }

    /*
     * A deep clone with the parts that would act on the page disabled.
     * While connected, an iframe would load its page, autoplaying media
     * would start fetching, and a checked radio would uncheck the original
     * in its group. Custom elements in the clone still run their
     * constructors and lifecycle callbacks.
     */
    function inertClone(el) {
        const clone = el.cloneNode(true);

        for (const node of [clone, ...clone.querySelectorAll("*")]) {
            if (node instanceof HTMLIFrameElement) {
                node.removeAttribute("src");
                node.removeAttribute("srcdoc");
            } else if (node instanceof HTMLObjectElement) {
                node.removeAttribute("data");
            } else if (node instanceof HTMLEmbedElement) {
                node.removeAttribute("src");
            } else if (node instanceof HTMLMediaElement) {
                node.removeAttribute("autoplay");
                node.preload = "none";
            } else if (node instanceof HTMLInputElement && node.type === "radio") {
                node.removeAttribute("name");
            }
        }

        Object.assign(clone.style, {
            visibility: "hidden",
            pointerEvents: "none"
        });

        return clone;
    }

    // `place` is "before" or "after" the original. The clone has no layout
    // overrides, so position, display and size come out as the page styles
    // them. It's removed before the next paint, so the page never visibly
    // shifts.
    function getCloneStyles(el, place, behind) {
        const clone = inertClone(el);

        el[place](clone);

        const styles = getStyles(clone, behind);

        clone.remove();

        return styles;
    }

    /*
     * The fallback for :hover rules in sheets that can't be read: a freshly
     * inserted clone isn't in the pointer's hover chain, so its own :hover
     * doesn't apply. An ancestor's still does.
     *
     * The clone is a sibling, so structural selectors can match it
     * differently. Placed before the original, it keeps the original's
     * :nth-child, :first-child, + and ~ matches, but not :last-child,
     * :nth-last-child or :only-child. So when values differ, they're
     * measured again with the clone after the original. A difference that
     * depends on where the clone sits comes from structure rather than
     * hover, so it's dropped.
     */
    function getCloneNormalStyles(el, hover) {
        const behind = elementsBehind(el);
        const normal = getCloneStyles(el, "before", behind);

        const changed = Object.keys(normal).filter(
            property => normal[property] !== hover[property]
        );

        if (!changed.length) {
            return normal;
        }

        const after = getCloneStyles(el, "after", behind);

        for (const property of changed) {
            if (after[property] !== normal[property]) {
                normal[property] = hover[property];
            }
        }

        return normal;
    }

    /*
     * Get the non-hovered state by switching off the :hover rules that
     * apply around the element, including ones on its ancestors, like
     * `.card:hover .title`. When no :hover rule could apply, the normal
     * state is the hovered one and nothing is changed.
     *
     * Rules in a sheet that can't be read and has no usable copy can't
     * be switched off, so then the element is also cloned, see
     * getCloneNormalStyles(). `hover` must be measured before, since
     * the clone also changes the original's structural matches.
     */
    function getNormalStyles(el, hover) {
        const { rules, copied, roots, unreadable } = findHoverRules(el, elementsBehind(el));

        if (!rules.size && !copied.length && !unreadable) {
            return hover;
        }

        return withoutHover(rules, copied, roots, blocked =>
            unreadable || blocked ? getCloneNormalStyles(el, hover) : getStyles(el)
        );
    }

    function collapseBorderColors(styles) {
        const colors = borderColorProperties.map(
            property => styles[property]
        );

        return colors.every(
            color => color === colors[0]
        );
    }

    Scope.styles = {
        properties,
        borderColorProperties,
        isDefault,
        isGapContainer,
        isRelevant,
        toCssName,
        declaration,
        boxLayers,
        boxSides,
        getStyles,
        getNormalStyles,
        onSheetLoaded,
        absoluteUrls,
        collapseBorderColors
    };
})(globalThis.Scope ??= {});
