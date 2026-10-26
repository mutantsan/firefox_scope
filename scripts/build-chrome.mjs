// Builds the Chrome version in dist/chrome from the Firefox one, and zips
// it for the Chrome Web Store into web-ext-artifacts/.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const out = "dist/chrome";
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

// Chrome has no background pages in Manifest V3, only a service worker.
manifest.background = { service_worker: "background/worker.js" };

// Chrome rejects Ctrl+Alt shortcuts, which clash with AltGr.
manifest.commands.start.suggested_key.default = "Alt+Shift+S";

// Firefox's ID and data collection settings, unknown to Chrome.
delete manifest.browser_specific_settings;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const path of ["background", "content", "popup", "shared", "icons", "LICENSE"]) {
    cpSync(path, `${out}/${path}`, { recursive: true });
}

rmSync(`${out}/icons/icon.svg`);
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");

const zip = `scope-chrome-${manifest.version}.zip`;

mkdirSync("web-ext-artifacts", { recursive: true });
rmSync(`web-ext-artifacts/${zip}`, { force: true });
execFileSync("zip", ["-qr", `../../web-ext-artifacts/${zip}`, "."], { cwd: out });

console.log(`Built ${out} and web-ext-artifacts/${zip}`);
