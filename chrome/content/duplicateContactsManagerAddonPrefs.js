// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateContactsManagerAddonPrefs.js
//
// Addon prefs adapter: registers extension preference definitions with the platform.
// Insulates callers from how prefs are registered (legacy: Preferences.addAll from preferencesBindings;
// TB128 may use a different mechanism, e.g. storage or options schema).
// Only this module defines and registers the addon's option prefs; Preferences.js (options dialog) calls
// addAddonPrefs() and does not call Preferences.addAll directly. Load after preferencesBindings.js
// (which defines Preferences) and before Preferences.js in options.xul.

var DuplicateContactsManagerAddonPrefs = (function() {
	"use strict";

	/** Preference definitions for the addon options dialog (legacy: passed to Preferences.addAll). */
	var PREF_DEFINITIONS = [
		{ id: "extensions.duplicatecontactsmanager.docpath", type: "string" }
	];

	var isTB128 = (typeof browser !== "undefined" && browser.storage);

	/**
	 * Registers the addon's preference definitions with the platform.
	 * Legacy: Preferences.addAll(PREF_DEFINITIONS); TB128: no-op (options use storage directly).
	 */
	function addAddonPrefs() {
		if (isTB128) return;
		if (typeof Preferences !== "undefined" && Preferences.addAll)
			Preferences.addAll(PREF_DEFINITIONS);
	}

	return {
		addAddonPrefs: addAddonPrefs
	};
})();
