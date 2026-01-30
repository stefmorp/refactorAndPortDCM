// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowCardValues.js
//
// Card value pipeline: get display or comparison value from a card (getProperty, getPrunedProperty,
// getTransformedProperty, getAbstractedTransformedProperty, getSimplifiedCard, completeFirstLastDisplayName, propertySet).
// ctx must have: defaultValue, isSelection, isSet, isFirstLastDisplayName, isEmail, getNormalizationConfig,
// ignoredFields, vcards, vcardsSimplified (for getSimplifiedCard).
// Load after duplicateEntriesWindowMatching.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowCardValues = (function() {
	"use strict";

	function getProperty(ctx, card, property) {
		var defaultValue = ctx.defaultValue(property);
		var value = card.getProperty(property, defaultValue);
		if (ctx.isSelection(property) && value == "")
			return defaultValue;
		if (ctx.isSet(property))
			return value.toString();
		if (property == 'LastModifiedDate')
			return value == "0" ? "" : new Date(value * 1000).toLocaleString();
		if (property == 'PhotoURI' && value == 'chrome://messenger/skin/addressbook/icons/contact-generic.png')
			return defaultValue;
		return value + "";
	}

	function getPrunedProperty(ctx, card, property) {
		var defaultValue = ctx.defaultValue(property);
		if (ctx.ignoredFields.includes(property))
			return defaultValue;
		var value = DuplicateEntriesWindowMatching.pruneText(getProperty(ctx, card, property), property, ctx.getNormalizationConfig());
		if (ctx.isFirstLastDisplayName(property)) {
			if (value == getPrunedProperty(ctx, card, 'PrimaryEmail') || value == getPrunedProperty(ctx, card, 'SecondEmail'))
				return defaultValue;
		}
		if (ctx.isEmail(property))
			value = value.replace(/@googlemail.com$/i, "@gmail.com");
		return value;
	}

	function getTransformedProperty(ctx, card, property) {
		var value = getPrunedProperty(ctx, card, property);
		var M = DuplicateEntriesWindowMatching;
		if (ctx.isFirstLastDisplayName(property)) {
			var p, fn, ln;
			if (property == 'DisplayName') {
				if ((p = value.match(/^([^,]+),\s+(.+)$/))) {
					var pair = M.transformMiddlePrefixName(p[2], p[1]);
					value = pair[0] + " " + pair[1];
				}
				return value;
			}
			fn = getPrunedProperty(ctx, card, 'FirstName');
			ln = getPrunedProperty(ctx, card, 'LastName');
			if (/,\s*$/.test(fn)) {
				ln = fn.replace(/,\s*$/,"");
				fn = getProperty(ctx, card, 'LastName');
			} else {
				if ((p = fn.match(/^([^,]+),\s+(.+)$/))) {
					fn = p[2] + (ln != "" ? " " + ln : "");
					ln = p[1];
				}
			}
			var pair = M.transformMiddlePrefixName(fn, ln);
			return (property == 'FirstName' ? pair[0] : pair[1]);
		}
		return value;
	}

	function getAbstractedTransformedProperty(ctx, card, property) {
		return DuplicateEntriesWindowMatching.abstract(getTransformedProperty(ctx, card, property), property, ctx.getNormalizationConfig());
	}

	/**
	 * @param {object} ctx - context (window)
	 * @param {[string, string, string]} nameArray - [firstName, lastName, displayName]
	 * @param {nsIAbCard} card
	 * @returns {[string, string, string]} [firstName, lastName, displayName]
	 */
	function completeFirstLastDisplayName(ctx, nameArray, card) {
		var fn = nameArray[0], ln = nameArray[1], dn = nameArray[2];
		if (dn == "" && fn != "" && ln != "")
			dn = fn + " " + ln;
		else if (fn == "" || ln == "" || dn == "") {
			function getFirstLastFromEmail(email) {
				var p = email.match(/^\s*([A-Za-z0-9\x80-\uFFFF]+)[\.\-_]+([A-Za-z0-9\x80-\uFFFF]+)@/);
				if (p && p[1] == "no")
					p = undefined;
				if (!p)
					p = email.match(/^\s*([A-Z][a-z0-9_\x80-\uFFFF]*)([A-Z][a-z0-9_\x80-\uFFFF]*)@/);
				return p;
			}
			var p = dn.match(/^\s*([A-Za-z0-9_\x80-\uFFFF]+)\s+([A-Za-z0-9_\x80-\uFFFF]+)\s*$/);
			if (!p)
				p = getFirstLastFromEmail(getPrunedProperty(ctx, card, 'PrimaryEmail'));
			if (!p)
				p = getFirstLastFromEmail(getPrunedProperty(ctx, card, 'SecondEmail'));
			if (p) {
				var cfg = ctx.getNormalizationConfig();
				if (fn == "")
					fn = DuplicateEntriesWindowMatching.abstract(p[1].replace(/[0-9]/g, ''), 'FirstName', cfg);
				if (ln == "")
					ln = DuplicateEntriesWindowMatching.abstract(p[2].replace(/[0-9]/g, ''), 'LastName', cfg);
				if (dn == "")
					dn = fn + " " + ln;
			}
		}
		return [fn, ln, dn];
	}

	function getSimplifiedCard(ctx, book, i) {
		if (!ctx.vcardsSimplified[book][i] && ctx.vcards[book][i]) {
			var card = ctx.vcards[book][i].QueryInterface(Components.interfaces.nsIAbCard);
			var vcard = {};
			var fn = getAbstractedTransformedProperty(ctx, card, 'FirstName');
			var ln = getAbstractedTransformedProperty(ctx, card, 'LastName');
			var dn = getAbstractedTransformedProperty(ctx, card, 'DisplayName');
			var completed = completeFirstLastDisplayName(ctx, [fn, ln, dn], card);
			vcard['FirstName'] = completed[0];
			vcard['LastName'] = completed[1];
			vcard['DisplayName'] = completed[2];
			vcard['_AimScreenName'] = getAbstractedTransformedProperty(ctx, card, '_AimScreenName');
			vcard['PrimaryEmail'] = getAbstractedTransformedProperty(ctx, card, 'PrimaryEmail');
			vcard['SecondEmail'] = getAbstractedTransformedProperty(ctx, card, 'SecondEmail');
			vcard['Phone1'] = getAbstractedTransformedProperty(ctx, card, 'CellularNumber');
			vcard['Phone2'] = getAbstractedTransformedProperty(ctx, card, 'PagerNumber');
			vcard['Phone3'] = getAbstractedTransformedProperty(ctx, card, 'WorkPhone');
			ctx.vcardsSimplified[book][i] = vcard;
		}
		return ctx.vcardsSimplified[book][i];
	}

	function propertySet(ctx, card, properties) {
		var result = new Set();
		for (var i = 0; i < properties.length; i++) {
			var property = properties[i];
			var defaultValue = ctx.defaultValue(property);
			var value = getAbstractedTransformedProperty(ctx, card, property);
			if (value != defaultValue)
				result.add(value);
		}
		return result;
	}

	return {
		getProperty: getProperty,
		getPrunedProperty: getPrunedProperty,
		getTransformedProperty: getTransformedProperty,
		getAbstractedTransformedProperty: getAbstractedTransformedProperty,
		completeFirstLastDisplayName: completeFirstLastDisplayName,
		getSimplifiedCard: getSimplifiedCard,
		propertySet: propertySet
	};
})();
