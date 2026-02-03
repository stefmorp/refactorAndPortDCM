// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: background.js
//
// TB128 only: background script for the WebExtension. Registers Tools menu (and optional
// toolbar via browserAction if declared in manifest). On click, opens the duplicate-finder
// window via DuplicateContactsManagerLauncher.openDuplicatesWindow().

(function() {
	"use strict";

	function onLauncherClick() {
		DuplicateContactsManagerLauncher.openDuplicatesWindow();
	}

	// Toolbar button (requires "browser_action" or "action" in manifest to show)
	if (typeof browser !== "undefined" && browser.browserAction) {
		browser.browserAction.onClicked.addListener(onLauncherClick);
	}

	// Tools menu item (requires "menus" permission)
	if (typeof browser !== "undefined" && browser.menus) {
		browser.menus.create({
			id: "dcm-manage-duplicates",
			title: browser.i18n.getMessage("toolsmenu_items_handleduplicates_label") || "Duplicate Contacts Manager…",
			contexts: ["tools_menu"]
		});
		browser.menus.onClicked.addListener(function(info, tab) {
			if (info.menuItemId === "dcm-manage-duplicates")
				onLauncherClick();
		});
	}
})();
