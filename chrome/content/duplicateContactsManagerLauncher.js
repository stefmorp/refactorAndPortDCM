// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateContactsManagerLauncher.js
//
// Launcher adapter: opens the duplicate-finder window. Insulates callers from how the window
// is opened (legacy: window.open chrome URL; TB128: e.g. browser.windows.create with extension URL).
// Only this module touches window.open for the duplicate-entries window; duplicateContactsManager.js
// calls openDuplicatesWindow() and does not open the window directly.
// Load before duplicateContactsManager.js in overlays (menuOverlay.xul, menuOverlayABook.xul, duplicateContactsManager.xul).

var DuplicateContactsManagerLauncher = (function() {
	"use strict";

	/** Chrome URL for the duplicate-entries window (legacy). TB128 uses extension page URL. */
	var DUPLICATE_WINDOW_URL = "chrome://duplicatecontactsmanager/content/duplicateEntriesWindow.xul";
	/** Window features for window.open (legacy). */
	var WINDOW_FEATURES = "chrome,centerscreen";

	var isTB128 = (typeof browser !== "undefined" && browser.windows && browser.runtime);

	/**
	 * Opens the Duplicate Contacts Manager (duplicate-entries) window.
	 * Legacy: window.open(chrome URL); TB128: browser.windows.create(extension URL).
	 * Call from DuplicateContactsManager.manageDuplicates(); do not open the window from elsewhere.
	 * @returns {Window|Promise} Legacy: Window or null; TB128: Promise resolving to the created window.
	 */
	function openDuplicatesWindow() {
		if (isTB128) {
			/* Extension-relative path; getURL() resolves to e.g. moz-extension://id/chrome/content/duplicateEntriesWindow.html */
			var url = browser.runtime.getURL("chrome/content/duplicateEntriesWindow.html");
			return browser.windows.create({ url: url, type: "popup", width: 900, height: 600 });
		}
		var win = window.open(DUPLICATE_WINDOW_URL, "Duplicate Contacts Manager", WINDOW_FEATURES);
		if (win)
			win.focus();
		return win;
	}

	return {
		openDuplicatesWindow: openDuplicatesWindow
	};
})();
