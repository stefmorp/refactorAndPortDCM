// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowComparison.js
//
// Card comparison logic: "equivalent or less information" and preference for deletion.
// Used by duplicateEntriesWindow.js. Load after duplicateEntriesWindowMatching.js, before duplicateEntriesWindow.js.
// Set.prototype.isSuperset/toString are defined here for use by Display (and Comparison internals).

Set.prototype.isSuperset = function(other) {
	for (var elem of other) {
		if (!this.has(elem))
			return false;
	}
	return true;
};

Set.prototype.toString = function() {
	return "{" + Array.from(this).join(", ") + "}";
};

var DuplicateEntriesWindowComparison = (function() {
	"use strict";

	function pushIfNew(elem, array) {
		if (!array.includes(elem))
			array.push(elem);
		return array;
	}

	/**
	 * Returns true if setA is a superset of setB (every element of setB is in setA).
	 * @param {Set} setA
	 * @param {Set} setB
	 * @returns {boolean}
	 */
	function isSupersetOf(setA, setB) {
		for (var e of setB) {
			if (!setA.has(e))
				return false;
		}
		return true;
	}

	/**
	 * Returns the union of property names from two address book cards.
	 * @param {nsIAbCard} c1
	 * @param {nsIAbCard} c2
	 * @returns {string[]}
	 */
	function propertyUnion(c1, c2) {
		var union = [];
		for (var i = 0; i < 2; i++) {
			var it = i === 0 ? c1.properties : c2.properties;
			while (it.hasMoreElements()) {
				var name = it.getNext().QueryInterface(Components.interfaces.nsIProperty).name;
				pushIfNew(name, union);
			}
		}
		return union;
	}

	/**
	 * Compares two address book cards for "equivalent or less information".
	 * @param {nsIAbCard} c1 - Card 1
	 * @param {nsIAbCard} c2 - Card 2
	 * @param {object} context - Must have: consideredFields, metaProperties,
	 *   isNumerical(property), isEmail(property), isPhoneNumber(property), isSet(property), isText(property),
	 *   defaultValue(property), getAbstractedTransformedProperty(card, property), nonequivalentProperties (array)
	 * @returns {[number, number]} [comparison, preference] where
	 *   comparison = 1 if second card has less information
	 *   comparison = 0 if cards are equivalent
	 *   comparison =-1 if first card has less information
	 *   comparison =-2 if cards are incomparable
	 *   preference > 0 if first card preferred to keep (second to delete)
	 *   preference < 0 if second card preferred to keep
	 *   preference = 0 otherwise
	 */
	function compareCards(c1, c2, context) {
		var comparison, preference;
		var c1_less_complete = true;
		var c2_less_complete = true;
		var props = propertyUnion(c1, c2);
		var diffProps = context.nonequivalentProperties;
		// TODO: combine these comparisons with those in displayCardField

		for (var i = 0; i < props.length; i++) {
			var property = props[i];
			if (!context.consideredFields.includes(property) ||  /* do not compare ignored fields */
				context.isNumerical(property) ||  /* ignore PopularityIndex, LastModifiedDate and other integers */
				context.metaProperties.includes(property) ||  /* ignore meta properties */
				context.isEmail(property) || context.isPhoneNumber(property))
				continue;
			var defaultValue = context.isSet(property) ? new Set() : context.defaultValue(property);
			var value1, value2;
			if (context.isSet(property)) {
				value1 = c1.getProperty(property, defaultValue);
				value2 = c2.getProperty(property, defaultValue);
			} else {
				value1 = context.getAbstractedTransformedProperty(c1, property);
				value2 = context.getAbstractedTransformedProperty(c2, property);
			}
			if (value1 != value2) {
				var diffProp = property == '__MailListNames' ? "(MailingListMembership)" :
					property == '__Emails' ? "{PrimaryEmail,SecondEmail}" :
					property == '__PhoneNumbers' ? "{CellularNumber,HomePhone,WorkPhone,FaxNumber,PagerNumber}" :
					property;
				pushIfNew(diffProp, diffProps);

				if (!c1_less_complete && !c2_less_complete)
					continue;

				if (context.isText(property)) {
					if (!value2.includes(value1))
						c1_less_complete = false;
					if (!value1.includes(value2))
						c2_less_complete = false;
				} else if (context.isSet(property)) {
					if (!isSupersetOf(value2, value1))
						c1_less_complete = false;
					if (!isSupersetOf(value1, value2))
						c2_less_complete = false;
				} else {
					if (value1 != defaultValue)
						c1_less_complete = false;
					if (value2 != defaultValue)
						c2_less_complete = false;
				}
			}
		}

		if (c1_less_complete != c2_less_complete) {
			comparison = preference = c1_less_complete ? -1 : 1;
		} else {
			comparison = c1_less_complete ? 0 : -2;
			preference = c1.getProperty('__NonEmptyFields', 0) - c2.getProperty('__NonEmptyFields', 0);
			if (preference == 0)
				preference = c1.getProperty('__CharWeight', 0) - c2.getProperty('__CharWeight', 0);
			if (preference == 0)
				preference = c1.getProperty('PopularityIndex', 0) - c2.getProperty('PopularityIndex', 0);
			if (preference == 0) {
				var date1 = c1.getProperty('LastModifiedDate', 0);
				var date2 = c2.getProperty('LastModifiedDate', 0);
				if (date1 != 0 && date2 != 0)
					preference = date1 - date2;
			}
		}
		return [comparison, preference];
	}

	return {
		propertyUnion: propertyUnion,
		compareCards: compareCards
	};
})();
