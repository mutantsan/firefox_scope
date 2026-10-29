/*
 * Runs the Chrome version (dist/chrome, from `npm run build:chrome`) in
 * Chromium on a fixture page, to catch what only breaks in a real browser.
 *
 * The test copy of the extension is granted all sites up front, which a
 * user does from the popup, since Chrome's permission prompt can't be
 * clicked from a test. That also turns "always ready" on.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const temp = mkdtempSync(join(tmpdir(), "scope-e2e-"));
const extension = join(temp, "extension");
const fixture = readFileSync(new URL("fixture.html", import.meta.url));

let server;
let pageUrl;
let context;
let worker;

before(async () => {
    cpSync("dist/chrome", extension, { recursive: true });

    const manifestPath = join(extension, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    manifest.host_permissions = manifest.optional_host_permissions;
    writeFileSync(manifestPath, JSON.stringify(manifest));

    server = createServer((request, response) => {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(fixture);
    });

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    pageUrl = `http://127.0.0.1:${server.address().port}/`;

    // The "chromium" channel runs extensions headless, the default
    // headless shell doesn't.
    context = await chromium.launchPersistentContext(join(temp, "profile"), {
        channel: "chromium",
        args: [
            `--disable-extensions-except=${extension}`,
            `--load-extension=${extension}`
        ]
    });

    worker = context.serviceWorkers()[0] ??
        await context.waitForEvent("serviceworker");

    // The loader is registered once the install event has been handled.
    await until(() => worker.evaluate(async () =>
        (await chrome.scripting.getRegisteredContentScripts()).length > 0
    ));

    // The Accessibility rows are off until checked in the popup.
    await worker.evaluate(() => chrome.storage.local.set({
        shownProperties: ["accessibleName", "role", "focusable"]
    }));
});

after(async () => {
    await context?.close();
    server?.close();
    rmSync(temp, { recursive: true, force: true });
});

// Polls `check` until it returns something truthy, and returns that.
async function until(check, timeout = 5000) {
    const end = Date.now() + timeout;

    for (;;) {
        const result = await check();

        if (result) {
            return result;
        }

        if (Date.now() > end) {
            throw new Error(`Timed out waiting for ${check}`);
        }

        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

/*
 * Scope's UI is in a closed shadow root that the page, and so Playwright,
 * can't reach. The extension's own world in the page can, so the tooltip
 * is read there over the DevTools protocol.
 */
async function openPage() {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const { frameTree } = await cdp.send("Page.getFrameTree");
    let scopeWorld = null;

    cdp.on("Runtime.executionContextCreated", ({ context: world }) => {
        if (
            world.auxData?.isDefault === false &&
            world.auxData?.frameId === frameTree.frame.id &&
            world.origin.startsWith("chrome-extension://")
        ) {
            scopeWorld = world.id;
        }
    });

    await cdp.send("Runtime.enable");
    await page.goto(pageUrl);

    async function inScope(expression) {
        if (scopeWorld === null) {
            return undefined;
        }

        const { result } = await cdp.send("Runtime.evaluate", {
            expression,
            contextId: scopeWorld,
            returnByValue: true
        });

        return result.value;
    }

    // The tooltip's text while it's shown, otherwise null.
    function tooltip() {
        return inScope(`(() => {
            const el = globalThis.Scope?.ui?.root.querySelector(".tooltip");
            return el && getComputedStyle(el).display !== "none"
                ? el.innerText
                : null;
        })()`);
    }

    return { page, inScope, tooltip };
}

test("the keyboard shortcut starts Scope, and Shift inspects", async () => {
    const { page, tooltip } = await openPage();

    await page.bringToFront();
    await worker.evaluate(() => globalThis.Scope.background.onCommand("start"));

    assert.match(await until(tooltip), /Scope is ready/);

    await page.locator(".cta").hover();
    await page.keyboard.down("Shift");

    const text = await until(async () => {
        const shown = await tooltip();
        return shown?.startsWith("button\n.cta") && shown;
    });

    // Rows from styles.js, colors.js and accessibility.js.
    assert.match(text, /background-color\n#0b57d0\n/);
    assert.match(text, /WCAG contrast\n[\d.]+:1AA ✓/);
    assert.match(text, /name\n"Buy now"\nrole\nbutton\n/);

    await page.keyboard.up("Shift");
    await until(async () => (await tooltip()) === null);

    await page.close();
});

test("inspecting a list shades the gaps between its items", async () => {
    const { page, inScope, tooltip } = await openPage();

    await page.bringToFront();
    await worker.evaluate(() => globalThis.Scope.background.onCommand("start"));
    await until(tooltip);

    // Over the list itself, in the space between two items.
    const list = await page.locator(".stats").boundingBox();
    const item = await page.locator(".stats li").first().boundingBox();

    await page.mouse.move(item.x + item.width + 8, list.y + list.height / 2);
    await page.keyboard.down("Shift");

    const labels = () => inScope(`[
        ...globalThis.Scope.ui.root.querySelectorAll(".gap-label")
    ]
        .filter(el => el.style.display === "block")
        .map(el => el.textContent)`);

    const shown = await until(async () => {
        const text = await labels();
        return text?.length > 0 && text;
    });

    assert.deepEqual(shown, ["16", "16"]);

    // Turning off Show gaps in the popup hides them straight away.
    await worker.evaluate(() => chrome.storage.local.set({ showGaps: false }));
    await until(async () => (await labels())?.length === 0);

    await worker.evaluate(() => chrome.storage.local.remove("showGaps"));
    await page.keyboard.up("Shift");
    await page.close();
});

test("with always ready, the first Shift press loads Scope", async () => {
    const { page, inScope, tooltip } = await openPage();

    await until(() => inScope("Boolean(globalThis.Scope?.loader)"));
    assert.equal(await inScope("Boolean(globalThis.Scope.inspector)"), false);

    // Inside an open shadow root, which tree.js looks into.
    await page.locator(".inner-link").hover();
    await page.keyboard.down("Shift");

    const text = await until(async () => {
        const shown = await tooltip();
        return shown?.startsWith("a\n.inner-link") && shown;
    });

    assert.match(text, /name\n"Inside a shadow root"\nrole\nlink\n/);

    await page.keyboard.up("Shift");
    await page.close();
});
