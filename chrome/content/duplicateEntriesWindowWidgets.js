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

	var isTB128 = (typeof messenger !== "undefined" && messenger.addressBooks);

	/**
	 * Creates a dropdown. Legacy: XUL menulist; TB128: HTML select. Callers use .selectedItem.value; we expose that on both.
	 */
	function createSelectionList(cls, labels, values, selected) {
		if (isTB128) {
			var select = document.createElement('select');
			if (cls) select.className = cls;
			for (var i = 0; i < labels.length; i++) {
				var opt = document.createElement('option');
				opt.textContent = labels[i];
				opt.value = values[i];
				if (values[i] == selected) opt.selected = true;
				select.appendChild(opt);
			}
			Object.defineProperty(select, 'selectedItem', {
				get: function() { var o = this.options[this.selectedIndex]; return o ? { value: o.value } : null; },
				configurable: true
			});
			return select;
		}
		var menulist = document.createElement('menulist');
		if (cls != null) menulist.setAttribute('class', cls);
		var menupopup = document.createElement('menupopup');
		if (cls != null) menupopup.setAttribute('class', cls);
		for (var i = 0; i < labels.length; i++) {
			var menuitem = document.createElement('menuitem');
			menuitem.setAttribute('crop', 'end');
			if (cls != null) menuitem.setAttribute('class', cls);
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

	function createHbox() {
		if (isTB128) { var d = document.createElement('div'); d.className = 'hbox'; d.style.display = 'flex'; return d; }
		return document.createElement('hbox');
	}

	function createDescription() {
		if (isTB128) return document.createElement('span');
		return document.createElement('description');
	}

	/** Label element; same tag in XUL and HTML. */
	function createLabel() {
		return document.createElement('label');
	}

	/** Single-line input. TB128: input; legacy: XUL textbox. */
	function createTextbox() {
		if (isTB128) return document.createElement('input');
		return document.createElement('textbox');
	}

	/** Image. TB128: img; legacy: XUL image. */
	function createImage() {
		if (isTB128) return document.createElement('img');
		return document.createElement('image');
	}

	/** Table row. TB128: tr; legacy: XUL row. */
	function createRow() {
		if (isTB128) return document.createElement('tr');
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
