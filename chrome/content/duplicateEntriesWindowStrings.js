// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowStrings.js
//
// Strings (i18n) adapter for the duplicate-entries window. Insulates the rest of the app
// from how localized strings are loaded (legacy: Services.strings / stringbundle; TB128: e.g. browser.i18n).
// Exports createStringProvider(ctx); assign ctx.getString = DuplicateEntriesWindowStrings.createStringProvider(ctx) in init.
// Load before duplicateEntriesWindow.js. No other module dependencies.

var DuplicateEntriesWindowStrings = (function() {
	"use strict";

	var BUNDLE_URL = "chrome://duplicatecontactsmanager/locale/duplicateContactsManager.properties";
	var FALLBACK_BUNDLE_ID = "bundle_duplicateContactsManager";

	/**
	 * Creates the string bundle for ctx (legacy implementation) and returns a getString(name) function.
	 * Sets ctx.stringBundle. Call once from init; then assign ctx.getString = DuplicateEntriesWindowStrings.createStringProvider(ctx).
	 * @param {object} ctx - Window context (will get ctx.stringBundle set)
	 * @returns {function(string): string} getString(name)
	 */
	function createStringProvider(ctx) {
		try {
			var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
			ctx.stringBundle = Services.strings.createBundle(BUNDLE_URL);
		} catch (e) {
			ctx.stringBundle = document.getElementById(FALLBACK_BUNDLE_ID);
		}
		return function(name) {
			return ctx.stringBundle_old ? ctx.stringBundle_old.getString(name) : ctx.stringBundle.GetStringFromName(name);
		};
	}

	return {
		createStringProvider: createStringProvider
	};
})();
