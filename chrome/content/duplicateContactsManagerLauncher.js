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

	/** Chrome URL for the duplicate-entries window (legacy). TB128 may use an extension page URL. */
	var DUPLICATE_WINDOW_URL = "chrome://duplicatecontactsmanager/content/duplicateEntriesWindow.xul";
	/** Window features for window.open (legacy). */
	var WINDOW_FEATURES = "chrome,centerscreen";

	/**
	 * Opens the Duplicate Contacts Manager (duplicate-entries) window.
	 * Legacy: window.open(chrome URL); TB128: can use browser.windows.create(extension URL) instead.
	 * Call from DuplicateContactsManager.manageDuplicates(); do not open the window from elsewhere.
	 * @returns {Window|null} The opened window, or null if blocked.
	 */
	function openDuplicatesWindow() {
		var win = window.open(DUPLICATE_WINDOW_URL, "Duplicate Contacts Manager", WINDOW_FEATURES);
		if (win)
			win.focus();
		return win;
	}

	return {
		openDuplicatesWindow: openDuplicatesWindow
	};
})();
