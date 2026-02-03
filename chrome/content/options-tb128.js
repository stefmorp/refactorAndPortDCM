// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: options-tb128.js
//
// TB128 options page: loads/saves addon option prefs (docpath, doctitle) from browser.storage.local.
// Keys use prefix DuplicateContactsManager.* to match legacy pref namespacing.

(function() {
	"use strict";
	var PREFIX = "DuplicateContactsManager.";
	function key(n) { return PREFIX + n; }

	document.addEventListener("DOMContentLoaded", function() {
		browser.storage.local.get([key("docpath"), key("doctitle")]).then(function(o) {
			var docpath = document.getElementById("docpath");
			var doctitle = document.getElementById("doctitle");
			if (docpath) docpath.value = o[key("docpath")] || "";
			if (doctitle) doctitle.value = o[key("doctitle")] || "";
		});
	});

	/* Save on unload; note: beforeunload may not fire in all tab-close cases. */
	window.addEventListener("beforeunload", function() {
		var docpath = document.getElementById("docpath");
		var doctitle = document.getElementById("doctitle");
		var o = {};
		if (docpath) o[key("docpath")] = docpath.value;
		if (doctitle) o[key("doctitle")] = doctitle.value;
		browser.storage.local.set(o);
	});
})();
