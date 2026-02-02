// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowWidgets.js
//
// DOM/Widget adapter for the duplicate-entries window. Insulates UI and Display from element type:
// legacy uses XUL (menulist, hbox, description, textbox, label, image, row); TB128 can use HTML equivalents.
// Only this module calls document.createElement with tag names; UI and Display use Widgets.* instead.
// Exports: createSelectionList, createHbox, createDescription, createLabel, createTextbox, createImage, createRow.
// Load before duplicateEntriesWindowUI.js and duplicateEntriesWindowDisplay.js. No other module dependencies.

var DuplicateEntriesWindowWidgets = (function() {
	"use strict";

	/**
	 * Creates a dropdown (menulist + menupopup + menuitems). Legacy: XUL; TB128: <select> + <option>.
	 * @param {string|null} cls - Optional class name for menulist and menupopup
	 * @param {string[]} labels - Display labels for each option
	 * @param {any[]} values - Values for each option (stored as attribute 'value')
	 * @param {any} selected - Value that should be selected
	 * @returns {Element} The dropdown element (menulist or select)
	 */
	function createSelectionList(cls, labels, values, selected) {
		var menulist = document.createElement('menulist');
		if (cls != null)
			menulist.setAttribute('class', cls);
		var menupopup = document.createElement('menupopup');
		if (cls != null)
			menupopup.setAttribute('class', cls);
		for (var i = 0; i < labels.length; i++) {
			var menuitem = document.createElement('menuitem');
			menuitem.setAttribute('crop', 'end');
			if (cls != null)
				menuitem.setAttribute('class', cls);
			menuitem.setAttribute('label', labels[i]);
			menuitem.setAttribute('value', values[i]);
			if (values[i] == selected) {
				menuitem.setAttribute('selected', 'true');
				menupopup.selectedItem = menuitem;
			}
			menupopup.appendChild(menuitem);
		}
		menulist.appendChild(menupopup);
		return menulist;
	}

	/** Creates a horizontal container. Legacy: hbox; TB128: div with flex/display. */
	function createHbox() {
		return document.createElement('hbox');
	}

	/** Creates a text/description element. Legacy: description; TB128: span or div. */
	function createDescription() {
		return document.createElement('description');
	}

	/** Creates a label element. Legacy: label; TB128: label or span. */
	function createLabel() {
		return document.createElement('label');
	}

	/** Creates a single-line or multiline text input. Legacy: textbox; TB128: input or textarea. */
	function createTextbox() {
		return document.createElement('textbox');
	}

	/** Creates an image element. Legacy: image; TB128: img. */
	function createImage() {
		return document.createElement('image');
	}

	/** Creates a table row. Legacy: row; TB128: tr or div. */
	function createRow() {
		return document.createElement('row');
	}

	return {
		createSelectionList: createSelectionList,
		createHbox: createHbox,
		createDescription: createDescription,
		createLabel: createLabel,
		createTextbox: createTextbox,
		createImage: createImage,
		createRow: createRow
	};
})();
