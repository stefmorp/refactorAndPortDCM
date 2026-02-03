// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowContacts.js
//
// Read/write logic for Thunderbird address book contacts (cards and directories).
// Insulates callers from card type: getAllAbCards returns wrapped cards (getProperty, setProperty, getPropertyNames, getRawCard);
// only this module touches nsIAbCard; TB128 can wrap a different contact type without changing CardValues/Comparison.
// Insulates directory listing: getAddressBookList(abManager), getSelectedDirectoryFromOpener() (legacy: directories enum, window.opener; TB128 may differ).
// Used by duplicateEntriesWindow.js. Load this script before duplicateEntriesWindow.js.

/*
   References:
   https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/nsIAbCard_(Tb3)
   https://developer.mozilla.org/en-US/docs/Mozilla/Thunderbird/Address_Book_Examples
*/

var DuplicateEntriesWindowContacts = (function() {
	"use strict";

	var abManager = null;
	var cachedListInfo = null; /* TB128: cache for getDirectory dirName lookup */

	var isTB128 = (typeof messenger !== "undefined" && messenger.addressBooks);

	/**
	 * Stable card interface. Legacy wraps nsIAbCard; TB128 wraps contact from messenger.addressBooks.contacts.
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

	/** TB128: wrap contact from messenger.contacts (id, properties). */
	function wrapTB128Contact(contact, parentId) {
		var props = contact.properties || {};
		return {
			_contact: contact,
			_parentId: parentId,
			getProperty: function(name, defaultValue) { return (props[name] !== undefined && props[name] !== null && props[name] !== "") ? props[name] : defaultValue; },
			setProperty: function(name, value) { props[name] = value; },
			getPropertyNames: function() { return Object.keys(props); },
			getRawCard: function() { return this._contact; }
		};
	}

	function getAbManager() {
		if (isTB128)
			return { list: function() { return messenger.addressBooks.list(); } };
		if (!abManager) {
			abManager = Components.classes["@mozilla.org/abmanager;1"]
				.getService(Components.interfaces.nsIAbManager);
		}
		return abManager;
	}

	/**
	 * Returns the address book directory for the given URI (legacy: nsIAbDirectory; TB128: facade with id, dirName, isMailList).
	 */
	function getDirectory(uri) {
		if (isTB128) {
			var dirName = uri;
			if (cachedListInfo && cachedListInfo.URIs) {
				var idx = cachedListInfo.URIs.indexOf(uri);
				if (idx >= 0 && cachedListInfo.dirNames[idx]) dirName = cachedListInfo.dirNames[idx];
			}
			return { id: uri, dirName: dirName, isMailList: false };
		}
		return getAbManager().getDirectory(uri);
	}

	/**
	 * Returns a list of all address book directories. Always returns a Promise (legacy: Promise.resolve(sync); TB128: async list()).
	 */
	function getAddressBookList(abManager) {
		if (isTB128 && abManager && abManager.list) {
			return abManager.list().then(function(books) {
				var dirNames = [];
				var URIs = [];
				if (books && books.length) {
					for (var i = 0; i < books.length; i++) {
						/* AddressBookNode typically has .id and .name (or .displayName in some versions). */
						dirNames.push(books[i].name != null ? books[i].name : (books[i].displayName != null ? books[i].displayName : books[i].id || ""));
						URIs.push(books[i].id);
					}
				}
				cachedListInfo = { dirNames: dirNames, URIs: URIs };
				return cachedListInfo;
			});
		}
		var dirNames = [];
		var URIs = [];
		if (!abManager || !abManager.directories)
			return Promise.resolve({ dirNames: dirNames, URIs: URIs });
		var allDirs = abManager.directories;
		while (allDirs.hasMoreElements()) {
			var dir = allDirs.getNext();
			if (dir instanceof Components.interfaces.nsIAbDirectory) {
				dirNames.push(dir.dirName);
				URIs.push(dir.URI);
			}
		}
		return Promise.resolve({ dirNames: dirNames, URIs: URIs });
	}

	/**
	 * Returns the selected address book URI from the opener window when opened from the Address Book UI.
	 * Legacy: window.opener.GetSelectedDirectory(); TB128 may use a different API or messaging.
	 * @returns {string|null} URI of the selected directory, or null if not available.
	 */
	function getSelectedDirectoryFromOpener() {
		if (typeof window === "undefined" || !window.opener || typeof window.opener.GetSelectedDirectory !== "function")
			return null;
		var raw = window.opener.GetSelectedDirectory();
		if (!raw || typeof raw !== "string")
			return null;
		// Full URI is match[0]; legacy code used match[1] (mdb|osx) by mistake.
		var match = raw.match(/(moz-ab(mdb|osx)directory:\/\/([^\/]+\.mab|\/)).*/);
		return (match && match[0]) ? match[0] : null;
	}

	/**
	 * Returns all contact cards from a directory. Returns a Promise (TB128: async list+get; legacy: Promise.resolve(sync)).
	 */
	function getAllAbCards(directory, context) {
		if (isTB128 && directory && directory.id) {
			/* TB128: addressBooks.contacts.list(parentId) returns contact nodes; get(id) returns full contact. */
			return messenger.addressBooks.contacts.list(directory.id).then(function(contactNodes) {
				var mailLists = [];
				var abCards = [];
				return Promise.all((contactNodes || []).map(function(node) {
					return messenger.addressBooks.contacts.get(node.id).then(function(contact) {
						if (!contact) return;
						/* Skip mailing lists for now in TB128 (no isMailList on node?) */
						var wrapped = wrapTB128Contact(contact, directory.id);
						abCards.push(wrapped);
					});
				})).then(function() {
					for (var j = 0; j < abCards.length; j++)
						context.enrichCardForComparison(abCards[j], mailLists);
					return { cards: abCards, totalBefore: abCards.length };
				});
			});
		}
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
			} catch (ex) {}
		}
		for (var j = 0; j < abCards.length; j++)
			context.enrichCardForComparison(abCards[j], mailLists);
		return Promise.resolve({ cards: abCards, totalBefore: abCards.length });
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
	 * Persists card changes. Returns Promise (TB128: messenger.addressBooks.contacts.update; legacy: sync, Promise.resolve).
	 */
	function saveCard(abDir, card) {
		var raw = (card.getRawCard && card.getRawCard()) || card;
		if (isTB128 && raw.id) {
			var props = raw.properties || {};
			return messenger.addressBooks.contacts.update(raw.id, props);
		}
		abDir.modifyCard(raw);
		return Promise.resolve();
	}

	/**
	 * Deletes a card. Returns Promise (TB128: messenger.addressBooks.contacts.delete; legacy: sync, Promise.resolve).
	 */
	function deleteCard(abDir, card) {
		var raw = (card.getRawCard && card.getRawCard()) || card;
		if (isTB128 && raw.id)
			return messenger.addressBooks.contacts.delete(raw.id);
		var deleteCards = Components.classes["@mozilla.org/array;1"]
			.createInstance(Components.interfaces.nsIMutableArray);
		deleteCards.appendElement(raw, false);
		abDir.deleteCards(deleteCards);
		return Promise.resolve();
	}

	return {
		getAbManager: getAbManager,
		getDirectory: getDirectory,
		getAddressBookList: getAddressBookList,
		getSelectedDirectoryFromOpener: getSelectedDirectoryFromOpener,
		getAllAbCards: getAllAbCards,
		getCardProperty: getCardProperty,
		setCardProperty: setCardProperty,
		saveCard: saveCard,
		deleteCard: deleteCard
	};
})();
