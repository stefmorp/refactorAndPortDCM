// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowUI.js
//
// Grouped UI state transitions, progress display, and finished stats for the duplicate-entries window.
// ctx must have: enable(id), disable(id), show(id), hide(id), make_visible(id), make_invisible(id), show_hack(id),
// getString, and optionally window. For updateProgress/updateDeletedInfo/showFinishedStats: progressmeter, progresstext,
// vcards, BOOK_1, BOOK_2, abDir1, abDir2, deferInteractive, nowHandling, positionSearch, positionDuplicates, duplicates,
// totalCardsDeleted1, totalCardsDeleted2, totalCardsDeletedAuto, totalCardsBefore, totalCardsChanged, totalCardsSkipped,
// consideredFields, isSet, matchablesList, ignoredFields, nonequivalentProperties.
// Load after duplicateEntriesWindowComparison.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowUI = (function() {
	"use strict";

	/**
	 * Ready state: intro visible, address book choice, Quit; action buttons visible but disabled; no progress/table/Stop.
	 */
	function showReadyState(ctx) {
		ctx.hide('statusAddressBook1');
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
		ctx.hide('explanation');
		ctx.hide('endinfo');
		ctx.show('progressMeter');
		ctx.show('statusAddressBook1');
		ctx.show('statusAddressBook2');
		ctx.show('stopbutton');
		ctx.hide('quitbutton');
		ctx.show_hack('tablepane');
		ctx.disable('startbutton');
	}

	/**
	 * Duplicate pair state: enable Skip / Keep / Apply and remove wait cursor (user can act on the pair).
	 */
	function showDuplicatePairState(ctx) {
		ctx.enable('skipnextbutton');
		ctx.enable('keepnextbutton');
		ctx.enable('applynextbutton');
		if (ctx.window)
			ctx.window.removeAttribute('wait-cursor');
	}

	/**
	 * Disable Skip / Keep / Apply (e.g. while searching for next pair).
	 */
	function disableDuplicateActionButtons(ctx) {
		ctx.disable('skipnextbutton');
		ctx.disable('keepnextbutton');
		ctx.disable('applynextbutton');
	}

	/**
	 * Finished state: hide table and Stop, show Quit and end summary; enable Start (as Restart).
	 */
	function showFinishedState(ctx) {
		ctx.hide('tablepane');
		ctx.make_invisible('skipnextbutton');
		ctx.make_invisible('keepnextbutton');
		ctx.make_invisible('applynextbutton');
		if (ctx.window)
			ctx.window.removeAttribute('wait-cursor');
		ctx.hide('stopbutton');
		ctx.show('quitbutton');
		ctx.show('endinfo');
		ctx.enable('startbutton');
	}

	/**
	 * Show the comparison table header row.
	 */
	function showComparisonTableHeader(ctx) {
		ctx.make_visible('tableheader');
	}

	/**
	 * Hide the comparison table header row.
	 */
	function hideComparisonTableHeader(ctx) {
		ctx.make_invisible('tableheader');
	}

	/**
	 * Updates the card-count label for one address book in the status bar.
	 */
	function updateDeletedInfo(ctx, label, book, nDeleted) {
		var cards = ctx.getString('cards');
		var n = ctx.vcards[book].length -
			(ctx.abDir1 == ctx.abDir2 ? ctx.totalCardsDeleted1 + ctx.totalCardsDeleted2 : nDeleted);
		document.getElementById(label).value = '(' + cards + ': ' + n + ')';
	}

	/**
	 * Updates progress meter and progress text; refreshes deleted-info labels.
	 */
	function updateProgress(ctx) {
		var current, pos, max;
		if (!ctx.deferInteractive || !ctx.nowHandling) {
			current = 'pair';
			pos = ctx.positionSearch + 1;
			var num1 = ctx.vcards[ctx.BOOK_1].length;
			var num2 = ctx.vcards[ctx.BOOK_2].length;
			max = ctx.abDir1 == ctx.abDir2 ? (num1 * (num1 - 1) / 2) : (num1 * num2);
			if (pos > max)
				pos = max;
		} else {
			current = 'parity';
			pos = ctx.positionDuplicates;
			max = ctx.duplicates.length;
		}
		ctx.progressmeter.setAttribute('value', ((max == 0 ? 1 : pos / max) * 100) + '%');
		ctx.progresstext.value = ctx.getString(current) + " " + pos + " " + ctx.getString('of') + " " + max;
		updateDeletedInfo(ctx, 'statusAddressBook1_size', ctx.BOOK_1, ctx.totalCardsDeleted1);
		updateDeletedInfo(ctx, 'statusAddressBook2_size', ctx.BOOK_2, ctx.totalCardsDeleted2);
	}

	/**
	 * Fills the finished-state panel with result statistics. Call after showFinishedState.
	 */
	function showFinishedStats(ctx) {
		var totalCardsDeleted = ctx.totalCardsDeleted1 + ctx.totalCardsDeleted2;
		document.getElementById('resultNumBefore').value = ctx.totalCardsBefore;
		document.getElementById('resultNumAfter').value = ctx.totalCardsBefore - totalCardsDeleted;
		document.getElementById('resultNumRemovedMan').value = totalCardsDeleted - ctx.totalCardsDeletedAuto;
		document.getElementById('resultNumRemovedAuto').value = ctx.totalCardsDeletedAuto;
		document.getElementById('resultNumChanged').value = ctx.totalCardsChanged;
		document.getElementById('resultNumSkipped').value = ctx.totalCardsSkipped;
		document.getElementById('resultConsideredFields').textContent = ctx.consideredFields
			.filter(function(x) { return !ctx.isSet(x) && !ctx.matchablesList.includes(x); }).join(", ");
		document.getElementById('resultIgnoredFields').textContent = ctx.ignoredFields.join(", ");
		document.getElementById('resultDiffProps').textContent = ctx.nonequivalentProperties.join(", ");
		document.getElementById('startbutton').setAttribute('label', ctx.getString('Restart'));
	}

	return {
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
