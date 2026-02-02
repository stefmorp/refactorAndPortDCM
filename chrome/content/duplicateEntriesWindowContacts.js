// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowContacts.js
//
// Read/write logic for Thunderbird address book contacts (cards and directories).
// Insulates callers from card type: getAllAbCards returns wrapped cards (getProperty, setProperty, getPropertyNames, getRawCard);
// only this module touches nsIAbCard; TB128 can wrap a different contact type without changing CardValues/Comparison.
// Used by duplicateEntriesWindow.js. Load this script before duplicateEntriesWindow.js.

/*
   References:
   https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/nsIAbCard_(Tb3)
   https://developer.mozilla.org/en-US/docs/Mozilla/Thunderbird/Address_Book_Examples
*/

var DuplicateEntriesWindowContacts = (function() {
	"use strict";

	var abManager = null;

	/**
	 * Stable card interface for insulation: getProperty(name, default), setProperty(name, value),
	 * getPropertyNames(), getRawCard(). Legacy wraps nsIAbCard; TB128 can wrap a different type.
	 */
	function wrapCard(abCard) {
		return {
			_card: abCard,
			getProperty: function(name, defaultValue) { return abCard.getProperty(name, defaultValue); },
			setProperty: function(name, value) { abCard.setProperty(name, value); },
			getPropertyNames: function() {
				var names = [];
				var it = abCard.properties;
				if (it) {
					while (it.hasMoreElements()) {
						var prop = it.getNext().QueryInterface(Components.interfaces.nsIProperty);
						names.push(prop.name);
					}
				}
				return names;
			},
			getRawCard: function() { return this._card; }
		};
	}

	function getAbManager() {
		if (!abManager) {
			abManager = Components.classes["@mozilla.org/abmanager;1"]
				.getService(Components.interfaces.nsIAbManager);
		}
		return abManager;
	}

	/**
	 * Returns the address book directory for the given URI.
	 * @param {string} uri - Address book URI (e.g. moz-abmdbdirectory://...)
	 * @returns {nsIAbDirectory}
	 */
	function getDirectory(uri) {
		return getAbManager().getDirectory(uri);
	}

	/**
	 * Returns all contact cards from a directory (wrapped: stable interface getProperty, setProperty, getPropertyNames).
	 * For each card, context.enrichCardForComparison(card, mailLists) is called.
	 * @param {nsIAbDirectory} directory - Address book directory
	 * @param {object} context - Must have enrichCardForComparison(card, mailLists)
	 * @returns {{ cards: Array, totalBefore: number }} - cards array (wrapped) and total count
	 */
	function getAllAbCards(directory, context) {
		var abCards = [];
		var mailLists = [];
		var childCards = directory.QueryInterface(Components.interfaces.nsIAbDirectory).childCards;

		if (childCards) {
			try {
				while (childCards.hasMoreElements()) {
					var abCard = childCards.getNext();
					if (abCard != null && abCard instanceof Components.interfaces.nsIAbCard) {
						if (abCard.isMailList) {
							var mailListDir = getAbManager().getDirectory(abCard.mailListURI);
							var addressList = mailListDir.addressLists;
							var primaryEmails = [];
							for (var i = 0; i < addressList.length; i++) {
								primaryEmails.push(addressList.queryElementAt(i, Components.interfaces.nsIAbCard).primaryEmail);
							}
							mailLists.push([abCard.displayName, primaryEmails]);
						} else {
							abCards.push(wrapCard(abCard));
						}
					}
				}
			} catch (ex) {
				// Return empty array on error
			}
		}

		for (var j = 0; j < abCards.length; j++) {
			context.enrichCardForComparison(abCards[j], mailLists);
		}

		return { cards: abCards, totalBefore: abCards.length };
	}

	/**
	 * Reads a single property from a card (wrapped or raw).
	 * @param {object} card - Card with getProperty(name, default)
	 * @param {string} property
	 * @param {string|number} defaultValue
	 * @returns {string|number}
	 */
	function getCardProperty(card, property, defaultValue) {
		return card.getProperty(property, defaultValue);
	}

	/**
	 * Writes a single property to a card (in memory only). Call saveCard to persist.
	 * @param {object} card - Card with setProperty(name, value)
	 * @param {string} property
	 * @param {string|number} value
	 */
	function setCardProperty(card, property, value) {
		card.setProperty(property, value);
	}

	/**
	 * Persists card changes to the address book.
	 * @param {nsIAbDirectory} abDir - Directory the card belongs to
	 * @param {object} card - Card (wrapped or raw) with modified properties
	 * @throws on failure
	 */
	function saveCard(abDir, card) {
		var raw = (card.getRawCard && card.getRawCard()) || card;
		abDir.modifyCard(raw);
	}

	/**
	 * Deletes a card from the address book.
	 * @param {nsIAbDirectory} abDir - Directory the card belongs to
	 * @param {object} card - Card (wrapped or raw) to delete
	 * @throws on failure
	 */
	function deleteCard(abDir, card) {
		var raw = (card.getRawCard && card.getRawCard()) || card;
		var deleteCards = Components.classes["@mozilla.org/array;1"]
			.createInstance(Components.interfaces.nsIMutableArray);
		deleteCards.appendElement(raw, false);
		abDir.deleteCards(deleteCards);
	}

	return {
		getAbManager: getAbManager,
		getDirectory: getDirectory,
		getAllAbCards: getAllAbCards,
		getCardProperty: getCardProperty,
		setCardProperty: setCardProperty,
		saveCard: saveCard,
		deleteCard: deleteCard
	};
})();
