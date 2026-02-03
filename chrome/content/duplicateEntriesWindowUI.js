// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowUI.js
//
// Grouped UI state transitions, progress display, finished stats, low-level DOM helpers, and setContactLeftRight.
// createSelectionList delegates to DuplicateEntriesWindowWidgets (no raw createElement for dropdown).
// This module provides enable, disable, show, hide, make_visible, make_invisible, show_hack (by id); the main window delegates to them.
// ctx must have: getString, and optionally window. For updateProgress/updateDeletedInfo/showFinishedStats: progressmeter, progresstext,
// vcards, BOOK_1, BOOK_2, abDir1, abDir2, deferInteractive, nowHandling, positionSearch, positionDuplicates, duplicates,
// totalCardsDeleted1, totalCardsDeleted2, totalCardsDeletedAuto, totalCardsBefore, totalCardsChanged, totalCardsSkipped,
// consideredFields, isSet, matchablesList, ignoredFields, nonequivalentProperties.
// Load after duplicateEntriesWindowComparison.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowUI = (function() {
	"use strict";

	function enable(id) {
		var elem = document.getElementById(id);
		elem.setAttribute('disabled', 'false');
		elem.className = '';
	}
	function disable(id) {
		var elem = document.getElementById(id);
		elem.setAttribute('disabled', 'true');
		elem.className = 'disabled';
	}
	function show(id) {
		document.getElementById(id).style.display = '';
	}
	/** Enables scroll bar and stretches horizontally (vs plain show). */
	function show_hack(id) {
		document.getElementById(id).style.display = '-moz-inline-stack';
	}
	function hide(id) {
		document.getElementById(id).style.display = 'none';
	}
	function make_visible(id) {
		document.getElementById(id).style.visibility = 'visible';
	}
	function make_invisible(id) {
		document.getElementById(id).style.visibility = 'hidden';
	}

	/**
	 * Creates a dropdown with the given labels and values; optional class and selected value.
	 * Delegates to DuplicateEntriesWindowWidgets (legacy: XUL menulist; TB128: HTML select).
	 * Used for address book selection in init() and for PreferMailFormat/boolean fields in the comparison table.
	 */
	function createSelectionList(cls, labels, values, selected) {
		return DuplicateEntriesWindowWidgets.createSelectionList(cls, labels, values, selected);
	}

	/**
	 * Marks the side specified by 'left' or 'right' as to be kept. If side is null/undefined, toggles from current radio state.
	 * ctx must have: keepLeftRadioButton, keepRightRadioButton, getString, sideKept, displayedFields.
	 */
	function setContactLeftRight(ctx, side) {
		if (!side)
			side = ctx.keepLeftRadioButton.getAttribute('selected') == 'true' ? 'right' : 'left';
		if (side != ctx.sideKept) {
			ctx.sideKept = side;
			var other = side == 'right' ? 'left' : 'right';
			var to_be_kept = ctx.getString('to_be_kept');
			var to_be_removed = ctx.getString('to_be_removed');
			ctx.keepLeftRadioButton.label = side == 'right' ? to_be_removed : to_be_kept;
			ctx.keepRightRadioButton.label = side == 'right' ? to_be_kept : to_be_removed;
			ctx.keepLeftRadioButton.setAttribute('selected', side == 'right' ? 'false' : 'true');
			ctx.keepRightRadioButton.setAttribute('selected', side == 'right' ? 'true' : 'false');
			document.getElementById('headerLeft').className = side == 'right' ? 'remove' : 'keep';
			document.getElementById('headerRight').className = side == 'right' ? 'keep' : 'remove';
			if (ctx.displayedFields) {
				for (var i = 0; i < ctx.displayedFields.length; i++) {
					var cell1 = document.getElementById('cell_' + side + '_' + ctx.displayedFields[i]);
					var cell2 = document.getElementById('cell_' + other + '_' + ctx.displayedFields[i]);
					if (cell1 && cell1.className == 'remove')
						cell1.className = 'keep';
					if (cell2 && cell2.className == 'keep')
						cell2.className = 'remove';
				}
			}
		}
	}

	/**
	 * Ready state: intro visible, address book choice, Quit; action buttons visible but disabled; no progress/table/Stop.
	 */
	function showReadyState(ctx) {
		hide('statusAddressBook1');
		hide('statusAddressBook2');
		hide('progressMeter');
		hide('tablepane');
		hide('endinfo');
		make_visible('skipnextbutton');
		make_visible('keepnextbutton');
		make_visible('applynextbutton');
		disable('skipnextbutton');
		disable('keepnextbutton');
		disable('applynextbutton');
		hide('stopbutton');
		show('quitbutton');
		show('explanation');
		ctx.hide('statusAddressBook2');
		ctx.hide('progressMeter');
		ctx.hide('tablepane');
		ctx.hide('endinfo');
		ctx.make_visible('skipnextbutton');
		ctx.make_visible('keepnextbutton');
		ctx.make_visible('applynextbutton');
		ctx.disable('skipnextbutton');
		ctx.disable('keepnextbutton');
		ctx.disable('applynextbutton');
		ctx.hide('stopbutton');
		ctx.show('quitbutton');
		ctx.show('explanation');
	}

	/**
	 * Searching state: progress and address book counts visible, Stop, table area; no intro/Quit; Start disabled.
	 */
	function showSearchingState(ctx) {
		hide('explanation');
		hide('endinfo');
		show('progressMeter');
		show('statusAddressBook1');
		show('statusAddressBook2');
		show('stopbutton');
		hide('quitbutton');
		show_hack('tablepane');
		disable('startbutton');
	}

	/**
	 * Duplicate pair state: enable Skip / Keep / Apply and remove wait cursor (user can act on the pair).
	 */
	function showDuplicatePairState(ctx) {
		enable('skipnextbutton');
		enable('keepnextbutton');
		enable('applynextbutton');
		if (ctx.window)
			ctx.window.removeAttribute('wait-cursor');
	}

	/**
	 * Disable Skip / Keep / Apply (e.g. while searching for next pair).
	 */
	function disableDuplicateActionButtons(ctx) {
		disable('skipnextbutton');
		disable('keepnextbutton');
		disable('applynextbutton');
	}

	/**
	 * Finished state: hide table and Stop, show Quit and end summary; enable Start (as Restart).
	 */
	function showFinishedState(ctx) {
		hide('tablepane');
		make_invisible('skipnextbutton');
		make_invisible('keepnextbutton');
		make_invisible('applynextbutton');
		if (ctx.window)
			ctx.window.removeAttribute('wait-cursor');
		hide('stopbutton');
		show('quitbutton');
		show('endinfo');
		enable('startbutton');
	}

	/**
	 * Show the comparison table header row.
	 */
	function showComparisonTableHeader(ctx) {
		make_visible('tableheader');
	}

	/**
	 * Hide the comparison table header row.
	 */
	function hideComparisonTableHeader(ctx) {
		make_invisible('tableheader');
	}

	/**
	 * Updates the card-count label for one address book in the status bar.
	 */
	function updateDeletedInfo(ctx, label, book, nDeleted) {
		var cards = ctx.getString('cards');
		var n = ctx.vcards[book].length -
			(ctx.abDir1 == ctx.abDir2 ? ctx.totalCardsDeleted1 + ctx.totalCardsDeleted2 : nDeleted);
		var el = document.getElementById(label);
		if (el) { if (el.value !== undefined) el.value = '(' + cards + ': ' + n + ')'; el.textContent = '(' + cards + ': ' + n + ')'; }
	}

	/**
	 * Updates progress meter and progress text; refreshes deleted-info labels.
	 * Status will not be visible immediately during search; see also
	 * http://forums.mozillazine.org/viewtopic.php?p=5300605
	 */
	function updateProgress(ctx) {
		var current, pos, max;
		if (!ctx.deferInteractive || !ctx.nowHandling) {
			current = 'pair';
			pos = ctx.positionSearch + 1;
			var num1 = ctx.vcards[ctx.BOOK_1].length;
			var num2 = ctx.vcards[ctx.BOOK_2].length;
			max = ctx.abDir1 == ctx.abDir2 ? (num1 * (num1 - 1) / 2) : (num1 * num2);
			if (pos > max)  /* happens at end */
				pos = max;
		} else {
			current = 'parity';
			pos = ctx.positionDuplicates;
			max = ctx.duplicates.length;
		}
		ctx.progressmeter.setAttribute('value', ((max == 0 ? 1 : pos / max) * 100) + '%');
		if (ctx.progressmeter.value !== undefined) ctx.progressmeter.value = (max == 0 ? 1 : pos / max) * 100;
		var progVal = ctx.getString(current) + " " + pos + " " + ctx.getString('of') + " " + max;
		if (ctx.progresstext) { if (ctx.progresstext.value !== undefined) ctx.progresstext.value = progVal; ctx.progresstext.textContent = progVal; }
		updateDeletedInfo(ctx, 'statusAddressBook1_size', ctx.BOOK_1, ctx.totalCardsDeleted1);
		updateDeletedInfo(ctx, 'statusAddressBook2_size', ctx.BOOK_2, ctx.totalCardsDeleted2);
	}

	/** Sets element value; supports both XUL (.value) and HTML (.textContent) for status/result fields. */
	function setElVal(id, v) {
		var el = document.getElementById(id);
		if (el) { if (el.value !== undefined) el.value = v; el.textContent = v; }
	}

	/**
	 * Fills the finished-state panel with result statistics. Call after showFinishedState.
	 */
	function showFinishedStats(ctx) {
		var totalCardsDeleted = ctx.totalCardsDeleted1 + ctx.totalCardsDeleted2;
		setElVal('resultNumBefore', ctx.totalCardsBefore);
		setElVal('resultNumAfter', ctx.totalCardsBefore - totalCardsDeleted);
		setElVal('resultNumRemovedMan', totalCardsDeleted - ctx.totalCardsDeletedAuto);
		setElVal('resultNumRemovedAuto', ctx.totalCardsDeletedAuto);
		setElVal('resultNumChanged', ctx.totalCardsChanged);
		setElVal('resultNumSkipped', ctx.totalCardsSkipped);
		document.getElementById('resultConsideredFields').textContent = ctx.consideredFields
			.filter(function(x) { return !ctx.isSet(x) && !ctx.matchablesList.includes(x); }).join(", ");
		document.getElementById('resultIgnoredFields').textContent = ctx.ignoredFields.join(", ");
		document.getElementById('resultDiffProps').textContent = ctx.nonequivalentProperties.join(", ");
		var sb = document.getElementById('startbutton');
		if (sb) { sb.setAttribute('label', ctx.getString('Restart')); if (sb.tagName === 'BUTTON') sb.textContent = ctx.getString('Restart'); }
	}

	return {
		enable: enable,
		disable: disable,
		show: show,
		hide: hide,
		show_hack: show_hack,
		make_visible: make_visible,
		make_invisible: make_invisible,
		createSelectionList: createSelectionList,
		setContactLeftRight: setContactLeftRight,
		showReadyState: showReadyState,
		showSearchingState: showSearchingState,
		showDuplicatePairState: showDuplicatePairState,
		disableDuplicateActionButtons: disableDuplicateActionButtons,
		showFinishedState: showFinishedState,
		showComparisonTableHeader: showComparisonTableHeader,
		hideComparisonTableHeader: hideComparisonTableHeader,
		updateDeletedInfo: updateDeletedInfo,
		updateProgress: updateProgress,
		showFinishedStats: showFinishedStats
	};
})();
