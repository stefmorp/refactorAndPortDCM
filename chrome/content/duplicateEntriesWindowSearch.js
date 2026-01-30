// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowSearch.js
//
// Search position stepping and duplicate-find loop: searchPositionsToNext, skipPositionsToNext,
// runIntervalAction. ctx is the main window (DuplicateEntriesWindow).
// ctx must have: vcards, BOOK_1, BOOK_2, abDir1, abDir2, positionSearch, position1, position2,
// deferInteractive, nowHandling, positionDuplicates, duplicates, updateProgress, getSimplifiedCard,
// deleteAbCard, displayCardData, endSearch, getString, autoremoveDups, preserveFirst.
// Load after duplicateEntriesWindowDisplay.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowSearch = (function() {
	"use strict";

	/**
	 * Increments internal pointers to next available card pair.
	 * Returns true if and only if next pair is available.
	 */
	function searchPositionsToNext(ctx) {
		if (!ctx.vcards[ctx.BOOK_1][ctx.position1])
			ctx.position2 = ctx.vcards[ctx.BOOK_2].length;

		ctx.positionSearch++;
		do {
			++(ctx.position2);
			if (ctx.position2 >= ctx.vcards[ctx.BOOK_2].length) {
				do {
					ctx.position1++;
					ctx.updateProgress();
					if (ctx.position1 + (ctx.abDir1 == ctx.abDir2 ? 1 : 0) >= ctx.vcards[ctx.BOOK_1].length)
						return false;
				} while (!ctx.vcards[ctx.BOOK_1][ctx.position1]);
				ctx.position2 = (ctx.abDir1 == ctx.abDir2 ? ctx.position1 + 1 : 0);
			}
		} while (!ctx.vcards[ctx.BOOK_2][ctx.position2]);
		return true;
	}

	/**
	 * Advances internal pointers to next available card pair (or next in duplicates queue).
	 * Returns true if and only if next pair is available.
	 */
	function skipPositionsToNext(ctx) {
		if (!ctx.deferInteractive || !ctx.nowHandling) {
			if (searchPositionsToNext(ctx))
				return true;
			if (!ctx.deferInteractive)
				return false;
			ctx.nowHandling = true;
		}
		do {
			if (ctx.positionDuplicates++ >= ctx.duplicates.length)
				return false;
			[ctx.position1, ctx.position2] = ctx.duplicates[ctx.positionDuplicates - 1];
		} while (!ctx.vcards[ctx.BOOK_1][ctx.position1] ||
		         !ctx.vcards[ctx.BOOK_2][ctx.position2]);
		ctx.updateProgress();
		return true;
	}

	/**
	 * Performs the actual search loop. Called via setTimeout from the main window's searchNextDuplicate.
	 * Runs until a duplicate is found (then shows UI and returns), or 1s has elapsed (then re-schedules itself), or search ends (calls ctx.endSearch()).
	 */
	function runIntervalAction(ctx) {
		var lasttime = new Date();
		while (skipPositionsToNext(ctx)) {
			if ((new Date()) - lasttime >= 1000) {
				setTimeout(function() { DuplicateEntriesWindowSearch.runIntervalAction(ctx); }, 13);
				return;
			}

			var simplified_card1 = ctx.getSimplifiedCard(ctx.BOOK_1, ctx.position1);
			var simplified_card2 = ctx.getSimplifiedCard(ctx.BOOK_2, ctx.position2);
			if (simplified_card1['_AimScreenName'] != simplified_card2['_AimScreenName'])
				continue;
			var M = DuplicateEntriesWindowMatching;
			var namesmatch = M.namesMatch(simplified_card1, simplified_card2);
			var mailsmatch = M.mailsMatch(simplified_card1, simplified_card2);
			var phonesmatch = M.phonesMatch(simplified_card1, simplified_card2);
			var nomailsphonesmatch = M.noMailsPhonesMatch(simplified_card1) &&
			                        M.noMailsPhonesMatch(simplified_card2);
			var nomatch = M.noNamesMatch(simplified_card1) &&
			              M.noNamesMatch(simplified_card2) && nomailsphonesmatch;
			if (namesmatch || mailsmatch || phonesmatch || nomatch) {
				var card1 = ctx.vcards[ctx.BOOK_1][ctx.position1];
				var card2 = ctx.vcards[ctx.BOOK_2][ctx.position2];
				var comparisonResult = DuplicateEntriesWindowComparison.compareCards(card1, card2, ctx);
				var comparison = comparisonResult[0];
				var preference = comparisonResult[1];
				if (comparison != -2 && ctx.autoremoveDups &&
				    !(ctx.abDir1 != ctx.abDir2 && ctx.preserveFirst && preference < 0)) {
					if (preference < 0)
						ctx.deleteAbCard(ctx.abDir1, ctx.BOOK_1, ctx.position1, true);
					else
						ctx.deleteAbCard(ctx.abDir2, ctx.BOOK_2, ctx.position2, true);
				} else {
					if (ctx.deferInteractive && !ctx.nowHandling) {
						ctx.duplicates.push([ctx.position1, ctx.position2]);
					} else {
						DuplicateEntriesWindowUI.showDuplicatePairState(ctx);
						ctx.statustext.className = 'with-progress';
						ctx.statustext.textContent = ctx.getString(nomatch ? 'noMatch' : 'matchFound');
						ctx.displayCardData(card1, card2, comparison, preference,
							namesmatch, mailsmatch, phonesmatch);
						return;
					}
				}
			}
		}
		ctx.endSearch();
	}

	return {
		searchPositionsToNext: searchPositionsToNext,
		skipPositionsToNext: skipPositionsToNext,
		runIntervalAction: runIntervalAction
	};
})();
