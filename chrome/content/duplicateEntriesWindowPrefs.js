// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowPrefs.js
//
// Load/save preferences for the duplicate-entries window. Prefix: extensions.DuplicateContactsManager.
// loadPrefs(ctx) reads from prefs branch into ctx; applyPrefsToDOM(ctx) writes ctx to form;
// readPrefsFromDOM(ctx) reads form into ctx; savePrefs(ctx) writes ctx to prefs branch.
// ctx must have: prefsBranch (set by getPrefsBranch or caller), ignoredFieldsDefault, addressBookFields, ignoredFields, consideredFields, isSet, matchablesList.
// Load after duplicateEntriesWindowFields.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowPrefs = (function() {
	"use strict";

	var PREF_BRANCH_ID = "extensions.DuplicateContactsManager.";

	/**
	 * Legacy prefs backend: wraps nsIPrefBranch. Same interface can be implemented
	 * by a WebExt backend (e.g. browser.storage) for TB128 without changing callers.
	 * Backend interface: getBoolPref(name), getCharPref(name), setBoolPref(name, value), setCharPref(name, value).
	 */
	function createLegacyBackend() {
		try {
			var Prefs = Components.classes["@mozilla.org/preferences-service;1"]
				.getService(Components.interfaces.nsIPrefService);
			var branch = Prefs.getBranch(PREF_BRANCH_ID);
			return {
				getBoolPref: function(name) { return branch.getBoolPref(name); },
				getCharPref: function(name) { return branch.getCharPref(name); },
				setBoolPref: function(name, value) { branch.setBoolPref(name, value); },
				setCharPref: function(name, value) { branch.setCharPref(name, value); }
			};
		} catch (e) {
			return null;
		}
	}

	/**
	 * Returns the prefs backend for the duplicate-entries window. Stored on ctx as ctx.prefsBranch.
	 * Legacy: nsIPrefBranch wrapper. TB128: can return a backend that uses browser.storage.
	 */
	function getPrefsBranch() {
		return createLegacyBackend();
	}

	/**
	 * Reads preference values from ctx.prefsBranch into ctx. Sets RegExps from prefix strings.
	 */
	function loadPrefs(ctx) {
		if (!ctx.prefsBranch)
			return;
		try {
			ctx.autoremoveDups = ctx.prefsBranch.getBoolPref('autoremoveDups');
		} catch (e) {}
		try {
			ctx.preserveFirst = ctx.prefsBranch.getBoolPref('preserveFirst');
		} catch (e) {}
		try {
			ctx.deferInteractive = ctx.prefsBranch.getBoolPref('deferInteractive');
		} catch (e) {}
		try {
			ctx.natTrunkPrefix = ctx.prefsBranch.getCharPref('natTrunkPrefix');
			ctx.natTrunkPrefixReqExp = new RegExp("^" + ctx.natTrunkPrefix + "([1-9])");
		} catch (e) {}
		try {
			ctx.intCallPrefix = ctx.prefsBranch.getCharPref('intCallPrefix');
			ctx.intCallPrefixReqExp = new RegExp("^" + ctx.intCallPrefix + "([1-9])");
		} catch (e) {}
		try {
			ctx.countryCallingCode = ctx.prefsBranch.getCharPref('countryCallingCode');
		} catch (e) {}
		ctx.ignoredFields = ctx.ignoredFieldsDefault.slice();
		try {
			var prefStringValue = ctx.prefsBranch.getCharPref('ignoreFields');
			if (prefStringValue.length > 0)
				ctx.ignoredFields = prefStringValue.split(/\s*,\s*/);
		} catch (e) {}
	}

	/**
	 * Writes ctx preference values to the options form elements.
	 */
	function applyPrefsToDOM(ctx) {
		document.getElementById('autoremove').checked = ctx.autoremoveDups;
		document.getElementById('preservefirst').checked = ctx.preserveFirst;
		document.getElementById('deferInteractive').checked = ctx.deferInteractive;
		document.getElementById('natTrunkPrefix').value = ctx.natTrunkPrefix;
		document.getElementById('intCallPrefix').value = ctx.intCallPrefix;
		document.getElementById('countryCallingCode').value = ctx.countryCallingCode;
		ctx.consideredFields = ctx.addressBookFields.filter(function(x) { return !ctx.ignoredFields.includes(x); });
		document.getElementById('consideredFields').textContent = ctx.consideredFields
			.filter(function(x) { return !ctx.isSet(x) && !ctx.matchablesList.includes(x); }).join(", ");
		document.getElementById('ignoredFields').value = ctx.ignoredFields.join(", ");
	}

	/**
	 * Reads current values from the options form into ctx.
	 */
	function readPrefsFromDOM(ctx) {
		ctx.autoremoveDups = document.getElementById('autoremove').getAttribute('checked');
		ctx.preserveFirst = document.getElementById('preservefirst').getAttribute('checked');
		ctx.deferInteractive = document.getElementById('deferInteractive').getAttribute('checked');
		ctx.natTrunkPrefix = document.getElementById('natTrunkPrefix').value;
		ctx.intCallPrefix = document.getElementById('intCallPrefix').value;
		ctx.countryCallingCode = document.getElementById('countryCallingCode').value;
		ctx.ignoredFields = document.getElementById('ignoredFields').value.split(/\s*,\s*/);
		ctx.natTrunkPrefixReqExp = new RegExp("^" + ctx.natTrunkPrefix + "([1-9])");
		ctx.intCallPrefixReqExp = new RegExp("^" + ctx.intCallPrefix + "([1-9])");
		ctx.consideredFields = ctx.addressBookFields.filter(function(x) { return !ctx.ignoredFields.includes(x); });
	}

	/**
	 * Writes ctx preference values to the prefs branch.
	 */
	function savePrefs(ctx) {
		if (!ctx.prefsBranch)
			return;
		ctx.prefsBranch.setBoolPref('autoremoveDups', ctx.autoremoveDups);
		ctx.prefsBranch.setBoolPref('preserveFirst', ctx.preserveFirst);
		ctx.prefsBranch.setBoolPref('deferInteractive', ctx.deferInteractive);
		ctx.prefsBranch.setCharPref('natTrunkPrefix', ctx.natTrunkPrefix);
		ctx.prefsBranch.setCharPref('intCallPrefix', ctx.intCallPrefix);
		ctx.prefsBranch.setCharPref('countryCallingCode', ctx.countryCallingCode);
		ctx.prefsBranch.setCharPref('ignoreFields', ctx.ignoredFields.join(", "));
	}

	return {
		getPrefsBranch: getPrefsBranch,
		loadPrefs: loadPrefs,
		applyPrefsToDOM: applyPrefsToDOM,
		readPrefsFromDOM: readPrefsFromDOM,
		savePrefs: savePrefs
	};
})();
