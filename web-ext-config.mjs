// Repo-only files the extension doesn't use, kept out of the zip and the
// lint. web-ext already skips dotfiles and node_modules.
export default {
    ignoreFiles: [
        "AUDIT.md",
        "image.png",
        "icons/icon.svg",
        "web-ext-config.mjs",
        "package.json",
        "package-lock.json",
        "test"
    ]
};
