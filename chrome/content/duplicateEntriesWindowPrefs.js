// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowPrefs.js
//
// Load/save preferences for the duplicate-entries window. Prefix: extensions.DuplicateContactsManager.
// Insulates callers from storage: ctx.prefsBranch is a backend (legacy: nsIPrefBranch; TB128: e.g. browser.storage).
// loadPrefs(ctx) reads from prefs branch into ctx; applyPrefsToDOM(ctx) writes ctx to form;
// readPrefsFromDOM(ctx) reads form into ctx; savePrefs(ctx) writes ctx to prefs branch.
// ctx must have: prefsBranch (set by getPrefsBranch or caller), ignoredFieldsDefault, addressBookFields, ignoredFields, consideredFields, isSet, matchablesList.
// Load after duplicateEntriesWindowFields.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowPrefs = (function() {
	"use strict";

	var PREF_BRANCH_ID = "extensions.DuplicateContactsManager.";
	var STORAGE_PREFIX = "DuplicateContactsManager.";
	var isTB128 = (typeof browser !== "undefined" && browser.storage && browser.storage.local);

	/**
	 * Legacy prefs backend: wraps nsIPrefBranch.
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
	 * TB128: backend using browser.storage.local. Methods return Promises.
	 * Missing keys: getBoolPref returns false, getCharPref returns "" (caller keeps State defaults on first run).
	 */
	function createStorageBackend() {
		var storage = browser.storage.local;
		function key(name) { return STORAGE_PREFIX + name; }
		return {
			getBoolPref: function(name) {
				return storage.get(key(name)).then(function(o) { return o[key(name)] === true; });
			},
			getCharPref: function(name) {
				return storage.get(key(name)).then(function(o) { var v = o[key(name)]; return (v != null && v !== "") ? v : ""; });
			},
			setBoolPref: function(name, value) {
				var o = {}; o[key(name)] = !!value; return storage.set(o);
			},
			setCharPref: function(name, value) {
				var o = {}; o[key(name)] = (value != null) ? String(value) : ""; return storage.set(o);
			}
		};
	}

	/**
	 * Returns the prefs backend. Legacy: nsIPrefBranch wrapper. TB128: browser.storage.local backend.
	 */
	function getPrefsBranch() {
		if (isTB128)
			return createStorageBackend();
		return createLegacyBackend();
	}

	/**
	 * Reads preference values from ctx.prefsBranch into ctx. Returns Promise so init can await (TB128 async; legacy sync wrapped).
	 */
	function loadPrefs(ctx) {
		if (!ctx.prefsBranch) return Promise.resolve();
		if (isTB128) {
			return ctx.prefsBranch.getBoolPref('autoremoveDups').then(function(v) { ctx.autoremoveDups = v; })
				.then(function() { return ctx.prefsBranch.getBoolPref('preserveFirst'); }).then(function(v) { ctx.preserveFirst = v; })
				.then(function() { return ctx.prefsBranch.getBoolPref('deferInteractive'); }).then(function(v) { ctx.deferInteractive = v; })
				.then(function() { return ctx.prefsBranch.getCharPref('natTrunkPrefix'); }).then(function(v) { ctx.natTrunkPrefix = v || ""; ctx.natTrunkPrefixReqExp = new RegExp("^" + (v || "") + "([1-9])"); })
				.then(function() { return ctx.prefsBranch.getCharPref('intCallPrefix'); }).then(function(v) { ctx.intCallPrefix = v || ""; ctx.intCallPrefixReqExp = new RegExp("^" + (v || "") + "([1-9])"); })
				.then(function() { return ctx.prefsBranch.getCharPref('countryCallingCode'); }).then(function(v) { ctx.countryCallingCode = v || ""; })
				.then(function() {
					ctx.ignoredFields = ctx.ignoredFieldsDefault.slice();
					return ctx.prefsBranch.getCharPref('ignoreFields');
				}).then(function(prefStringValue) {
					if (prefStringValue && prefStringValue.length > 0)
						ctx.ignoredFields = prefStringValue.split(/\s*,\s*/);
				});
		}
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
		return Promise.resolve();
	}

	/**
	 * Writes ctx preference values to the options form elements. (HTML: .checked; XUL: .checked or setAttribute.)
	 */
	function applyPrefsToDOM(ctx) {
		var el;
		el = document.getElementById('autoremove'); if (el) { el.checked = ctx.autoremoveDups; if (el.setAttribute) el.setAttribute('checked', ctx.autoremoveDups ? 'true' : ''); }
		el = document.getElementById('preservefirst'); if (el) { el.checked = ctx.preserveFirst; if (el.setAttribute) el.setAttribute('checked', ctx.preserveFirst ? 'true' : ''); }
		el = document.getElementById('deferInteractive'); if (el) { el.checked = ctx.deferInteractive; if (el.setAttribute) el.setAttribute('checked', ctx.deferInteractive ? 'true' : ''); }
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
	 * HTML: use .checked (boolean); XUL: getAttribute('checked') for legacy setBoolPref.
	 */
	function readPrefsFromDOM(ctx) {
		var el;
		el = document.getElementById('autoremove'); ctx.autoremoveDups = (el && (el.checked === true || el.getAttribute('checked') === 'true'));
		el = document.getElementById('preservefirst'); ctx.preserveFirst = (el && (el.checked === true || el.getAttribute('checked') === 'true'));
		el = document.getElementById('deferInteractive'); ctx.deferInteractive = (el && (el.checked === true || el.getAttribute('checked') === 'true'));
		ctx.natTrunkPrefix = document.getElementById('natTrunkPrefix').value;
		ctx.intCallPrefix = document.getElementById('intCallPrefix').value;
		ctx.countryCallingCode = document.getElementById('countryCallingCode').value;
		ctx.ignoredFields = document.getElementById('ignoredFields').value.split(/\s*,\s*/);
		ctx.natTrunkPrefixReqExp = new RegExp("^" + ctx.natTrunkPrefix + "([1-9])");
		ctx.intCallPrefixReqExp = new RegExp("^" + ctx.intCallPrefix + "([1-9])");
		ctx.consideredFields = ctx.addressBookFields.filter(function(x) { return !ctx.ignoredFields.includes(x); });
	}

	/**
	 * Writes ctx preference values to the prefs branch. Returns Promise (TB128 async; legacy sync wrapped).
	 */
	function savePrefs(ctx) {
		if (!ctx.prefsBranch) return Promise.resolve();
		if (isTB128) {
			return ctx.prefsBranch.setBoolPref('autoremoveDups', ctx.autoremoveDups)
				.then(function() { return ctx.prefsBranch.setBoolPref('preserveFirst', ctx.preserveFirst); })
				.then(function() { return ctx.prefsBranch.setBoolPref('deferInteractive', ctx.deferInteractive); })
				.then(function() { return ctx.prefsBranch.setCharPref('natTrunkPrefix', ctx.natTrunkPrefix); })
				.then(function() { return ctx.prefsBranch.setCharPref('intCallPrefix', ctx.intCallPrefix); })
				.then(function() { return ctx.prefsBranch.setCharPref('countryCallingCode', ctx.countryCallingCode); })
				.then(function() { return ctx.prefsBranch.setCharPref('ignoreFields', ctx.ignoredFields.join(", ")); });
		}
		ctx.prefsBranch.setBoolPref('autoremoveDups', ctx.autoremoveDups);
		ctx.prefsBranch.setBoolPref('preserveFirst', ctx.preserveFirst);
		ctx.prefsBranch.setBoolPref('deferInteractive', ctx.deferInteractive);
		ctx.prefsBranch.setCharPref('natTrunkPrefix', ctx.natTrunkPrefix);
		ctx.prefsBranch.setCharPref('intCallPrefix', ctx.intCallPrefix);
		ctx.prefsBranch.setCharPref('countryCallingCode', ctx.countryCallingCode);
		ctx.prefsBranch.setCharPref('ignoreFields', ctx.ignoredFields.join(", "));
		return Promise.resolve();
	}

	return {
		getPrefsBranch: getPrefsBranch,
		loadPrefs: loadPrefs,
		applyPrefsToDOM: applyPrefsToDOM,
		readPrefsFromDOM: readPrefsFromDOM,
		savePrefs: savePrefs
	};
})();
