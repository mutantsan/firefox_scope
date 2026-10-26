/*
 * The Accessibility rows: the element's role, accessible name and whether
 * it can be reached with Tab. Extensions can't read the browser's own
 * accessibility tree, so these follow the common rules of HTML-AAM and
 * accname from the DOM, close to what DevTools shows but not every edge
 * case of it.
 */
(function (Scope) {
    "use strict";

    // -------------------------------------------------------------------------
    // Role
    // -------------------------------------------------------------------------

    const inputRoles = {
        button: "button",
        image: "button",
        reset: "button",
        submit: "button",
        checkbox: "checkbox",
        radio: "radio",
        range: "slider",
        number: "spinbutton",
        search: "searchbox",
        email: "textbox",
        tel: "textbox",
        text: "textbox",
        url: "textbox",
        password: "textbox"
    };

    const tagRoles = {
        article: "article",
        aside: "complementary",
        blockquote: "blockquote",
        button: "button",
        dialog: "dialog",
        fieldset: "group",
        figure: "figure",
        form: "form",
        hr: "separator",
        li: "listitem",
        main: "main",
        menu: "list",
        meter: "meter",
        nav: "navigation",
        ol: "list",
        optgroup: "group",
        option: "option",
        output: "status",
        p: "paragraph",
        progress: "progressbar",
        table: "table",
        td: "cell",
        textarea: "textbox",
        th: "columnheader",
        tr: "row",
        ul: "list"
    };

    // header and footer are landmarks only outside sectioning content.
    const sectioning = "article, aside, main, nav, section";

    function implicitRole(el) {
        const tag = el.localName;

        switch (tag) {
            case "a":
            case "area":
                return el.hasAttribute("href") ? "link" : "generic";
            case "input": {
                const type = el.type;

                if (type === "hidden") {
                    return "none";
                }

                if (el.hasAttribute("list") && /^(email|search|tel|text|url)$/.test(type)) {
                    return "combobox";
                }

                return inputRoles[type] ?? "textbox";
            }
            case "select":
                return el.multiple || el.size > 1 ? "listbox" : "combobox";
            case "img":
                return el.getAttribute("alt") === "" ? "none" : "img";
            // Browsers leave out an unnamed one as decoration.
            case "svg":
                return el.hasAttribute("aria-label") ||
                    el.hasAttribute("aria-labelledby") ||
                    el.querySelector(":scope > title")
                    ? "img"
                    : "none";
            case "header":
                return el.parentElement?.closest(sectioning) ? "generic" : "banner";
            case "footer":
                return el.parentElement?.closest(sectioning) ? "generic" : "contentinfo";
            case "section":
                return el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")
                    ? "region"
                    : "generic";
        }

        if (/^h[1-6]$/.test(tag)) {
            return "heading";
        }

        return tagRoles[tag] ?? "generic";
    }

    // The role attribute can list fallbacks; the first one is used here.
    // aria-hidden leaves the element out of the tree, with no role at all.
    function role(el) {
        if (el.closest('[aria-hidden="true"]')) {
            return "none";
        }

        const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0]?.toLowerCase();

        if (explicit === "presentation") {
            return "none";
        }

        return explicit || implicitRole(el);
    }

    // Headings show their level, like "heading, level 2".
    function roleText(el, name) {
        if (name !== "heading") {
            return name;
        }

        const level = el.getAttribute("aria-level") ?? el.localName.match(/^h([1-6])$/)?.[1];

        return level ? `heading, level ${level}` : name;
    }

    // -------------------------------------------------------------------------
    // Name
    // -------------------------------------------------------------------------

    // Roles whose name comes from their text when nothing else names them.
    // Rows are left out, as browsers do.
    const nameFromContent = new Set([
        "button", "cell", "checkbox", "columnheader", "gridcell", "heading",
        "link", "menuitem", "menuitemcheckbox", "menuitemradio", "option",
        "radio", "rowheader", "switch", "tab", "tooltip", "treeitem"
    ]);

    // Roles that can't be named, so a title is only a tooltip on them.
    const nameProhibited = new Set([
        "caption", "code", "deletion", "emphasis", "generic", "insertion",
        "none", "paragraph", "strong", "subscript", "superscript"
    ]);

    // Roles that should always have a name.
    const nameRequired = new Set([
        "button", "checkbox", "combobox", "dialog", "img", "link", "listbox",
        "menuitem", "menuitemcheckbox", "menuitemradio", "meter", "progressbar",
        "radio", "searchbox", "slider", "spinbutton", "switch", "tab",
        "textbox", "treeitem"
    ]);

    function squash(text) {
        return text.replace(/\s+/g, " ").trim();
    }

    function isHidden(el) {
        return (
            el.getAttribute("aria-hidden") === "true" ||
            el.hidden ||
            (el.checkVisibility ? !el.checkVisibility({ visibilityProperty: true }) : false)
        );
    }

    // Elements named by aria-labelledby, in the same document or shadow
    // root as `el`.
    function labelledBy(el) {
        const ids = el.getAttribute("aria-labelledby")?.trim().split(/\s+/) ?? [];
        const root = el.getRootNode();

        return ids
            .map(id => root.getElementById?.(id) ?? document.getElementById(id))
            .filter(Boolean);
    }

    // Text of an element used as a label: what it would be named by
    // itself, or its content. Hidden labels still count when referenced.
    function labelText(el, visited) {
        return squash(
            el.getAttribute("aria-label") || textAlternative(el, visited, true) || contentText(el, visited)
        );
    }

    function contentText(el, visited) {
        let text = "";

        for (const node of Scope.tree.flatChildNodes(el)) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.data;
            } else if (node instanceof Element && !visited.has(node) && !isHidden(node)) {
                visited.add(node);

                const inner = node.getAttribute("aria-label") ||
                    textAlternative(node, visited, true) ||
                    contentText(node, visited);

                // Blocks are separate words even without spaces between them.
                const inline = getComputedStyle(node).display.startsWith("inline");

                text += inline ? inner : ` ${inner} `;
            }
        }

        return text;
    }

    // The name from the element's own markup: labels, alt, legend and the
    // like. `nested` leaves out title and placeholder, which only name the
    // element itself, not one it's part of.
    function textAlternative(el, visited, nested = false) {
        const tag = el.localName;

        if (tag === "input" && /^(button|submit|reset)$/.test(el.type)) {
            return el.value || (el.type === "submit" ? "Submit" : el.type === "reset" ? "Reset" : "");
        }

        if (tag === "input" && el.type === "image") {
            return el.alt || (nested ? "" : el.title) || "Submit";
        }

        if (/^(input|select|textarea|meter|progress|output)$/.test(tag)) {
            const labels = [...(el.labels ?? [])]
                .map(label => squash(contentText(label, new Set([...visited, el]))))
                .filter(Boolean);

            if (labels.length) {
                return labels.join(" ");
            }

            if (nested) {
                return tag === "select"
                    ? el.selectedOptions?.[0]?.textContent ?? ""
                    : el.value ?? "";
            }

            return el.title || el.placeholder || "";
        }

        if (tag === "img" || tag === "area") {
            return el.getAttribute("alt") ?? "";
        }

        if (tag === "svg") {
            return el.querySelector(":scope > title")?.textContent ?? "";
        }

        const caption = {
            fieldset: ":scope > legend",
            figure: ":scope > figcaption",
            table: ":scope > caption"
        }[tag];

        return caption ? el.querySelector(caption)?.textContent ?? "" : "";
    }

    function accessibleName(el, roleName) {
        const visited = new Set([el]);
        const referenced = labelledBy(el);

        if (referenced.length) {
            const text = squash(referenced.map(ref => labelText(ref, visited)).join(" "));

            if (text) {
                return text;
            }
        }

        const label = squash(el.getAttribute("aria-label") ?? "");

        if (label) {
            return label;
        }

        const alternative = squash(textAlternative(el, visited));

        if (alternative) {
            return alternative;
        }

        if (nameFromContent.has(roleName)) {
            const text = squash(contentText(el, visited));

            if (text) {
                return text;
            }
        }

        return nameProhibited.has(roleName) ? "" : squash(el.title ?? "");
    }

    // -------------------------------------------------------------------------
    // Keyboard focus
    // -------------------------------------------------------------------------

    // In the Tab order: a control or link, or anything with tabindex 0 or
    // more, as long as it isn't disabled, inert or hidden.
    function isKeyboardFocusable(el) {
        if (el.matches(":disabled") || el.closest("[inert]") || isHidden(el)) {
            return false;
        }

        if (el.hasAttribute("tabindex")) {
            return el.tabIndex >= 0;
        }

        if (/^(a|area)$/.test(el.localName) && !el.hasAttribute("href")) {
            return false;
        }

        if (el.localName === "input" && el.type === "hidden") {
            return false;
        }

        return el.isContentEditable || el.tabIndex >= 0;
    }

    // -------------------------------------------------------------------------
    // Rows
    // -------------------------------------------------------------------------

    /*
     * The values of the three rows. The name is quoted, as in Firefox's
     * accessibility inspector, so "none" and "missing" can't be mistaken
     * for one: "missing" when the role needs a name and has none.
     */
    function summary(el) {
        const roleName = role(el);
        const name = accessibleName(el, roleName);

        let nameText = `"${name}"`;

        if (!name) {
            nameText = nameRequired.has(roleName) ? "missing" : "none";
        }

        return {
            accessibleName: nameText,
            role: roleText(el, roleName),
            focusable: isKeyboardFocusable(el) ? "yes" : "no"
        };
    }

    Scope.accessibility = { role, accessibleName, isKeyboardFocusable, summary };
})(globalThis.Scope ??= {});
