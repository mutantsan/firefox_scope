// Chrome runs the background as a service worker, which loads the scripts
// Firefox lists in the manifest.
importScripts("/shared/browser.js", "/background/injection.js", "/background/background.js");
