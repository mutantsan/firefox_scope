"""Scope on MDN's home page: inspect, pin and copy, spacing and measuring, settings.

    npm run build:chrome
    ckan-demo record demo/scenario.py

Recorded with ckan-demo (https://github.com/DataShades/ckan-demo) in Chromium,
the only browser Playwright can load extensions in; the page looks the same
in Firefox. ckan-demo records any site, and with no users or setup here it
never talks to CKAN. MDN is live, so if a scene fails, check its selectors
against the page first.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from ckan_demo import BrowserExtension, Director, Scenario

if TYPE_CHECKING:
    from playwright.sync_api import Locator

scenario = Scenario(
    "Scope",
    # Granting all sites up front (the popup asks for it) turns on Always
    # ready, so a Shift press starts Scope without a click on its button.
    extensions=[BrowserExtension("../dist/chrome", grant_optional_permissions=True)],
    independent_scenes=True,
    transition="crossfade:0.6",
)

HOME = "/en-US/"
NAV_TABS = "nav.menu .menu__tab-button"
ARTICLES = ".featured-articles__article"

# MDN's ad slots: a banner above the header, one under the hero and one
# above the footer. Removed as they're added, since a style tag doesn't stick.
HIDE_ADS = """
new MutationObserver(() => {
    for (const el of document.querySelectorAll(
        ".page-layout__banner, mdn-placement-top, mdn-placement-hp-main, mdn-placement-bottom"
    )) {
        el.remove();
    }
}).observe(document, { childList: true, subtree: true });
"""


def ready(d: Director) -> None:
    """Off camera: hide MDN's ads, keep the recording out of its telemetry,
    and wait until Always ready has registered its loader, which the
    extension does once it's installed."""
    d.page.add_init_script(HIDE_ADS)
    d.page.route("https://incoming.telemetry.mozilla.org/**", lambda route: route.abort())
    scope = d.extension()
    for _ in range(100):
        if scope.evaluate("async () => (await chrome.scripting.getRegisteredContentScripts()).length"):
            return
        d.page.wait_for_timeout(100)
    raise RuntimeError("Scope didn't register its loader; was it granted all sites?")


def in_scope(d: Director, function: str, arg: Any = None) -> Any:
    """Run ``function`` in Scope's world in the page, where its UI is: a
    closed shadow root that locators can't reach."""
    return d.extension().evaluate_in_page(d.page, function, arg)


def shown(d: Director) -> None:
    """Wait for the tooltip to be up."""
    for _ in range(50):
        if in_scope(
            d,
            """() => {
                const tooltip = globalThis.Scope?.ui?.root.querySelector(".tooltip");
                return Boolean(tooltip) && getComputedStyle(tooltip).display !== "none";
            }""",
        ):
            return
        d.page.wait_for_timeout(100)
    raise RuntimeError("Scope's tooltip didn't show")


def part(d: Director, selector: str, text: str | None = None, *, row: str | None = None) -> dict[str, float]:
    """Box of a part of the tooltip: the first ``selector`` match, with
    ``text`` if given, inside the row named ``row`` if given."""
    box = in_scope(
        d,
        """([selector, text, row]) => {
            let scope = globalThis.Scope.ui.root;
            if (row) {
                scope = [...scope.querySelectorAll(".row")]
                    .find(el => el.querySelector(".row-name")?.textContent === row);
            }
            const found = [...(scope?.querySelectorAll(selector) ?? [])]
                .find(el => !text || el.textContent.trim() === text);
            return found ? found.getBoundingClientRect().toJSON() : null;
        }""",
        [selector, text, row],
    )
    if box is None:
        raise RuntimeError(f"no {selector!r} {text or ''} in Scope's tooltip")
    return box


def under(first: Locator, second: Locator) -> dict[str, float]:
    """The right end of the gap between two elements one above the other,
    so the tooltip opens past their parent rather than over it."""
    a, b = first.bounding_box(), second.bounding_box()
    if a is None or b is None:
        raise RuntimeError("both elements must be on screen")
    bottom = a["y"] + a["height"]
    return {"x": a["x"] + a["width"] - 12, "y": bottom, "width": 4, "height": max(b["y"] - bottom, 1)}


def explain(d: Director, text: str, *, position: str = "bottom") -> None:
    """A caption to read before the tooltip comes up, since the tooltip
    covers much of the page."""
    d.caption(text, hold="read", position=position)  # type: ignore[arg-type]
    d.caption(None, hold=0.3)


@scenario.scene("01-inspect", title="Hold Shift to inspect")
def inspect(d: Director) -> None:
    """Hold Shift over elements to see their styles."""
    ready(d)
    d.goto(HOME)
    d.card("Firefox and Chrome extension", "Scope", "Check an element's CSS without opening DevTools.", hold=3.5)

    explain(d, "Hold Shift over any element to see its styles")
    d.point(d.page.locator(".homepage-hero h1"))
    with d.hold("Shift"):
        shown(d)
        d.pause(4)  # colours with contrast, typography, box, layout

        # Move to inspect another: a link on the dark hero, then small
        # text on the light part of the page below it.
        d.point(d.page.locator(".homepage-hero a").first)
        d.pause(3)
        d.point(d.page.locator(".featured-articles__tag").first)
        d.pause(3.5)

    d.caption("Let go of Shift and it's gone", hold="read")
    d.caption(None, hold=0.3)


@scenario.scene("02-pin", title="Pin, copy and walk the tree")
def pin(d: Director) -> None:
    """Pin the tooltip, copy a value, move around the element tree."""
    ready(d)
    d.goto(HOME)

    explain(d, "Shift+click to pin the tooltip")
    tab = d.page.locator(NAV_TABS).nth(1)  # CSS
    d.point(tab)
    with d.hold("Shift"):
        shown(d)
        d.click(tab)  # Scope swallows the click, so the menu doesn't open
    d.pause(1.5)

    # A pinned tooltip on the right leaves the top free for captions.
    d.caption("Click a value to copy it")
    d.click(value(d, "color"))
    d.pause(2)
    d.caption("or the copy button for every row, as CSS")
    d.click(part(d, ".icon-button"))
    d.pause(2.5)

    # The tab's parents are in the header, under where captions go, so
    # each caption is gone before its keys are pressed.
    explain(d, "Arrow keys walk the element tree")
    d.press("ArrowUp", badge=True)
    d.pause(1.5)
    d.press("ArrowUp", badge=True)
    d.pause(1.5)
    d.press("ArrowDown", badge=True)
    d.pause(1.5)
    explain(d, "Or click any part of its path")
    d.click(part(d, ".crumb", "nav.navigation"))
    d.pause(2.5)

    explain(d, "Esc closes it")
    d.press("Escape", badge=True)
    d.pause(1)


def value(d: Director, row: str) -> dict[str, float]:
    """Box of the first value in the tooltip row named ``row``."""
    return part(d, ".row-values .copyable", row=row)


@scenario.scene("03-spacing", title="Spacing and measuring")
def spacing(d: Director) -> None:
    """Margins, padding and gaps on the page, then measure with Alt."""
    ready(d)
    d.goto(HOME)

    # A card on the right, between its title and summary, so the card is
    # what's inspected and the tooltip opens beside it. Over the grid of
    # cards, the tooltip would cover the gaps it shows.
    explain(d, "Margin, padding and the gaps between children show on the page")
    card = d.page.locator(ARTICLES).nth(1)
    d.point(under(card.locator(".featured-articles__title"), card.locator(".featured-articles__summary")))
    with d.hold("Shift"):
        shown(d)
        d.pause(4)

    explain(d, "Hold Alt and point at another element to measure the distance")
    titles = d.page.locator(".featured-articles__title")
    d.point(titles.nth(0))
    with d.hold("Shift"):
        shown(d)
        d.pause(1)
        with d.hold("Alt"):
            d.point(titles.nth(1))
            d.pause(2.5)
            d.point(d.page.get_by_role("heading", name="Featured articles"))
            d.pause(2.5)
        d.pause(0.5)


@scenario.scene("04-settings", title="Settings")
def settings(d: Director) -> None:
    """The toolbar popup: switches and tooltip rows, then the accessibility rows."""
    ready(d)
    d.goto(HOME)

    d.caption("Its toolbar button opens the settings")
    popup = d.open_popup()
    d.point(popup.locator("label.row").filter(has_text="Always ready"))
    d.pause(2)
    d.caption("Pick which rows the tooltip shows")
    d.click(popup.locator("#rows summary"))
    d.pause(1.5)
    d.caption("Accessibility rows are off until you turn them on")
    d.click(popup.get_by_role("button", name=re.compile(r"^Accessibility")))
    d.pause(1.5)
    d.close_popup()

    explain(d, "Now it shows the accessible name, role and keyboard focus too")
    # The theme switcher, named by its aria-label, in an open shadow root
    # that both Playwright and Scope reach into. Its edge, past the icon.
    theme = d.page.locator("mdn-color-theme button.color-theme__button")
    box = theme.bounding_box()
    if box is None:
        raise RuntimeError("no theme switcher on the page")
    d.point({"x": box["x"] + 2, "y": box["y"] + box["height"] / 2 - 1, "width": 2, "height": 2})
    with d.hold("Shift"):
        shown(d)
        d.pause(4)

    host = re.sub(r"^https?://", "", d.options.base_url)
    d.caption(None, hold=0.3)
    d.card("Firefox and Chrome", "Scope", f"Recorded on {host}", hold=3.5)
