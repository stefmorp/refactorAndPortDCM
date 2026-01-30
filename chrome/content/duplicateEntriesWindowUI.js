// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowUI.js
//
// Grouped UI state transitions for the duplicate-entries window.
// ctx must have: enable(id), disable(id), show(id), hide(id), make_visible(id), make_invisible(id), show_hack(id), and optionally window.
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

	return {
		showReadyState: showReadyState,
		showSearchingState: showSearchingState,
		showDuplicatePairState: showDuplicatePairState,
		disableDuplicateActionButtons: disableDuplicateActionButtons,
		showFinishedState: showFinishedState,
		showComparisonTableHeader: showComparisonTableHeader,
		hideComparisonTableHeader: hideComparisonTableHeader
	};
})();
