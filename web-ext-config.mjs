// Repo-only files the extension doesn't use, kept out of the zip and the
// lint, along with the Chrome-only service worker. web-ext already skips
// dotfiles and node_modules.
export default {
    ignoreFiles: [
        "AUDIT.md",
        "background/worker.js",
        "dist",
        "e2e",
        "image.png",
        "icons/icon.svg",
        "web-ext-config.mjs",
        "package.json",
        "package-lock.json",
        "scripts",
        "test"
    ]
};
