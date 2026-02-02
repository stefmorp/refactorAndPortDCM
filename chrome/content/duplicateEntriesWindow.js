// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindow.js

// This file includes UTF-8 encoding. Please make sure your text editor can deal with this prior to saving any changes!
// Change history and architecture: see ARCHITECTURE_AND_HISTORY.md in the project root.

// TODO: add option to prune and transform contents of individual or all cards
// TODO: add option to automatically and/or manually merge fields (e.g., buttons with arrow)
// TODO: generalize matching/comparison and manual treatment to more than two entries

/*
   References:
   https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/nsIAbCard_(Tb3)
   https://developer.mozilla.org/en-US/docs/Mozilla/Thunderbird/Address_Book_Examples
*/

if (typeof(DuplicateContactsManager_Running) == "undefined") {
	/** Single window object; passed as context (ctx) to all duplicate-finder modules. Holds state and delegates to Contacts, Fields, Prefs, Matching, CardValues, Comparison, UI, Display, Search. */
	var DuplicateEntriesWindow = Object.assign(DuplicateEntriesWindowState.defaultState(), {
		debug: function(str) {
			console.log(str);
		},

		/** Returns config object for DuplicateEntriesWindowMatching (normalization). */
		getNormalizationConfig: function() {
			return {
				isText: this.isText.bind(this),
				isPhoneNumber: this.isPhoneNumber.bind(this),
				natTrunkPrefix: this.natTrunkPrefix,
				countryCallingCode: this.countryCallingCode,
				natTrunkPrefixReqExp: this.natTrunkPrefixReqExp,
				intCallPrefix: this.intCallPrefix,
				intCallPrefixReqExp: this.intCallPrefixReqExp
			};
		},

		/**
		 * Will be called by duplicateEntriesWindow.xul once the according window is loaded
		 */
		init: function() {
			var F = DuplicateEntriesWindowFields;
			this.addressBookFields = F.addressBookFields;
			this.matchablesList = F.matchablesList;
			this.metaProperties = F.metaProperties;
			this.ignoredFieldsDefault = F.ignoredFieldsDefault;
			this.isText = F.isText;
			this.isFirstLastDisplayName = F.isFirstLastDisplayName;
			this.isEmail = F.isEmail;
			this.isPhoneNumber = F.isPhoneNumber;
			this.isSet = F.isSet;
			this.isSelection = F.isSelection;
			this.isNumerical = F.isNumerical;
			this.defaultValue = F.defaultValue;
			this.charWeight = F.charWeight;

			this.abManager = DuplicateEntriesWindowContacts.getAbManager();
			this.prefsBranch = DuplicateEntriesWindowPrefs.getPrefsBranch();
			DuplicateEntriesWindowPrefs.loadPrefs(this);
			DuplicateEntriesWindowPrefs.applyPrefsToDOM(this);

			this.getString = DuplicateEntriesWindowStrings.createStringProvider(this);
			this.running = true;
			this.statustext = document.getElementById('statusText');
			this.progresstext = document.getElementById('progressText');
			this.progressmeter = document.getElementById('progressMeter');
			this.window = document.getElementById('handleDuplicates-window');
			this.attributesTableRows = document.getElementById('AttributesTableRows');
			this.keepLeftRadioButton = document.getElementById('keepLeft');
			this.keepRightRadioButton = document.getElementById('keepRight');
			this.progresstext.value = "";
			DuplicateEntriesWindowUI.showReadyState(this);

			if (!this.abManager || !this.abManager.directories || this.abManager.directories.length == 0) {
				this.disable('startbutton');
				this.statustext.className = 'error-message'; /* not 'with-progress' */
				this.statustext.textContent = this.getString("NoABookFound");
				return;
			}
			if (this.abURI1 == null || this.abURI2 == null) {
				var default_abook = this.abManager.directories.getNext().URI;
				if (typeof window.opener.GetSelectedDirectory != 'undefined') {
					const addressbookURIs = window.opener.GetSelectedDirectory().
				                                match(/(moz-ab(mdb|osx)directory:\/\/([^\/]+\.mab|\/)).*/);
					if (addressbookURIs && addressbookURIs.length > 0)
						default_abook = addressbookURIs[1];
				}
				this.abURI1 = this.abURI2 = default_abook;
			}

			// We will process the first/selected address book, plus optionally a second one
			// read all addressbooks, fill lists in preferences dialog
			var allAddressBooks = this.abManager.directories;
			var dirNames = new Array();
			var URIs = new Array();
			while (allAddressBooks.hasMoreElements()) {
				var addressBook = allAddressBooks.getNext();
				if (addressBook instanceof Components.interfaces.nsIAbDirectory)
				{
					dirNames.push(addressBook.dirName);
					URIs    .push(addressBook.URI);
				}
			}
			var ablists = document.getElementById('addressbooklists');
			var ablist1 = this.createSelectionList('addressbookname', dirNames, URIs, this.abURI1);
			var ablist2 = this.createSelectionList('addressbookname', dirNames, URIs, this.abURI2);
			ablists.appendChild(ablist1);
			ablists.appendChild(ablist2);

			this.statustext.className = ''; /* not 'with-progress' */
			this.statustext.textContent = this.getString('PleasePressStart');
			document.getElementById('startbutton').setAttribute('label', this.getString('Start'));
			document.getElementById('startbutton').focus();
		},

		/**
		 * Will be called by duplicateEntriesWindow.xul
		 * once the according window is closed
		 */
		OnUnloadWindow: function() {
			this.running = false;
			this.vcards[this.BOOK_1] = null;
			this.vcards[this.BOOK_2] = null;
		},

		startSearch: function() {
			if (this.restart) {
				this.restart = false;
				this.init();
				return;
			}
			const ablist = document.getElementById('addressbooklists');
			const ab1 = ablist.firstChild;
			const ab2 = ab1.nextSibling;
			if (ab1.selectedItem)
				this.abURI1 = ab1.selectedItem.value;
			if (ab2.selectedItem)
				this.abURI2 = ab2.selectedItem.value;
			this.abDir1 = this.abManager.getDirectory(this.abURI1);
			this.abDir2 = this.abManager.getDirectory(this.abURI2);
			if([this.abURI1, this.abURI2].includes("moz-abosxdirectory:///"))
				alert("Mac OS X Address Book is read-only.\nYou can use it only for comparison.");
			//It seems that Thunderbird 11 on Max OS 10.7 can actually be write fields, although an exception is thrown.
			this.readAddressBooks();

			DuplicateEntriesWindowPrefs.readPrefsFromDOM(this);
			if (this.natTrunkPrefix != "" && !this.natTrunkPrefix.match(/^[0-9]{1,2}$/))
				alert("National phone number trunk prefix '"+this.natTrunkPrefix+"' should contain one or two digits");
			if (this.intCallPrefix != "" && !this.intCallPrefix.match(/^[0-9]{2,4}$/))
				alert("International call prefix '"+this.intCallPrefix+"' should contain two to four digits");
			if (this.countryCallingCode != "" && !this.countryCallingCode.match(/^(\+|[0-9])[0-9]{1,6}$/))
				alert("Default country calling code '"+this.countryCallingCode+"' should contain a leading '+' or digit followed by one to six digits");
			DuplicateEntriesWindowPrefs.savePrefs(this);

			this.purgeAttributesTable();
			DuplicateEntriesWindowUI.showSearchingState(this);
			this.statustext.className = 'with-progress';
			this.statustext.textContent = this.getString('SearchingForDuplicates');
			document.getElementById('statusAddressBook1_label').value = this.abDir1.dirName;
			document.getElementById('statusAddressBook2_label').value = this.abDir2.dirName;
			this.updateDeletedInfo('statusAddressBook1_size' , this.BOOK_1, 0);
			this.updateDeletedInfo('statusAddressBook2_size' , this.BOOK_2, 0);

			// re-initialization needed in case of restart:
			while (ablist.firstChild)
				ablist.removeChild(ablist.firstChild);
			this.positionSearch = 0;
			this.position1 = 0;
			this.position2 = (this.abDir1 == this.abDir2 ? 0 : -1);
			this.nowHandling = false;
			this.positionDuplicates = 0;
			this.duplicates = new Array();
			this.totalCardsChanged = 0;
			this.totalCardsSkipped = 0;
			this.totalCardsDeleted1 = 0;
			this.totalCardsDeleted2 = 0;
			this.totalCardsDeletedAuto = 0;
			this.updateProgress();
			DuplicateEntriesWindowUI.disableDuplicateActionButtons(this);
			this.searchNextDuplicate();
		},

		skipAndSearchNextDuplicate: function() {
			this.totalCardsSkipped++;
			this.searchNextDuplicate();
		},

		/**
		 * Continues searching the whole vcard array for a duplicate until one is found.
		 */
		searchNextDuplicate: function() {
			this.purgeAttributesTable();
			if (!this.nowHandling) {
				DuplicateEntriesWindowUI.disableDuplicateActionButtons(this);
				this.window.setAttribute('wait-cursor', 'true');
				this.statustext.className = 'with-progress';
				this.statustext.textContent = this.getString('SearchingForDuplicates');
			}
			this.updateProgress();
			// starting the search via setTimeout allows redrawing the progress info
			setTimeout(function() { DuplicateEntriesWindowSearch.runIntervalAction(DuplicateEntriesWindow); }, 13);
		},

		/**
		 * Saves modifications to one card and deletes the other one.
		 */
		applyAndSearchNextDuplicate: function() {
			// for the case that right one will be kept
			var [deleAbDir, deleBook, deleIndex] = [this.abDir1, this.BOOK_1, this.position1];
			var [keptAbDir, keptBook, keptIndex] = [this.abDir2, this.BOOK_2, this.position2];
			if (this.sideKept == 'left') { // left one will be kept
				[deleAbDir, deleBook, deleIndex, keptAbDir, keptBook, keptIndex] =
				[keptAbDir, keptBook, keptIndex, deleAbDir, deleBook, deleIndex];
			}
			this.updateAbCard(keptAbDir, keptBook, keptIndex, this.sideKept);
			this.deleteAbCard(deleAbDir, deleBook, deleIndex, false);
			this.searchNextDuplicate();
		},

		updateAbCard: function(abDir, book, index, side) {
			var card = this.vcards[book][index];  /* wrapped (getProperty, setProperty) from Contacts */

			// see what's been modified
			var updateFields = this.getCardFieldValues(side);
			var entryModified = false;
			for(let property in updateFields) {
				const defaultValue = this.defaultValue(property); /* cannot be a set here */
				if (card.getProperty(property, defaultValue) != updateFields[property]) {
				// not using this.getProperty here to give a chance to update wrongly empty field
					try {
						card.setProperty(property, updateFields[property]);
						entryModified = true;
					} catch (e) {
						var nameForError = card.getProperty ? card.getProperty('DisplayName', '') : (card.displayName || '');
						alert("Internal error: cannot set field '"+property+"' of "+nameForError+": "+e);
					}
				}
			}
			if (entryModified) {
				this.vcardsSimplified[book][index] = null; // request reconstruction by getSimplifiedCard
				try {
					DuplicateEntriesWindowContacts.saveCard(abDir, card);
					this.totalCardsChanged++;
				} catch (e) {
					var nameForError = card.getProperty ? card.getProperty('DisplayName', '') : (card.displayName || '');
					alert("Internal error: cannot update card '"+nameForError+"': "+e);
				}
			}
		},

		/**
		 * Saves modifications to both cards
		 */
		keepAndSearchNextDuplicate: function() {
			this.updateAbCard(this.abDir1, this.BOOK_1, this.position1, 'left' );
			this.updateAbCard(this.abDir2, this.BOOK_2, this.position2, 'right');
			this.searchNextDuplicate();
		},

		/**
		 * Deletes the card identified by 'index' from the given address book.
		 */
		deleteAbCard: function(abDir, book, index, auto) {
			var card = this.vcards[book][index];  /* wrapped from Contacts; save/delete use getRawCard() */
			try {
				DuplicateEntriesWindowContacts.deleteCard(abDir, card);
				if (abDir == this.abDir1)
					this.totalCardsDeleted1++;
				else
					this.totalCardsDeleted2++;
				if (auto)
					this.totalCardsDeletedAuto++;
			} catch (e) {
				var nameForError = card.getProperty ? card.getProperty('DisplayName', '') : (card.displayName || '');
				alert("Internal error: cannot remove card '"+nameForError+"': "+e);
			}
			this.vcards[book][index] = null; // set empty element, but leave element number as is
		},

		updateDeletedInfo: function(label, book, nDeleted) {
			DuplicateEntriesWindowUI.updateDeletedInfo(this, label, book, nDeleted);
		},

		updateProgress: function() {
			DuplicateEntriesWindowUI.updateProgress(this);
		},

		skipPositionsToNext: function() {
			return DuplicateEntriesWindowSearch.skipPositionsToNext(this);
		},

		searchPositionsToNext: function() {
			return DuplicateEntriesWindowSearch.searchPositionsToNext(this);
		},

		endSearch: function() {
			DuplicateEntriesWindowUI.showFinishedState(this);
			this.statustext.className = 'with-progress';
			this.statustext.textContent = this.getString('finished');
			DuplicateEntriesWindowUI.showFinishedStats(this);
			this.restart = true;
		},

		getProperty: function(card, property) {
			return DuplicateEntriesWindowCardValues.getProperty(this, card, property);
		},
		getTransformedProperty: function(card, property) {
			return DuplicateEntriesWindowCardValues.getTransformedProperty(this, card, property);
		},
		getAbstractedTransformedProperty: function(card, property) {
			return DuplicateEntriesWindowCardValues.getAbstractedTransformedProperty(this, card, property);
		},
		getSimplifiedCard: function(book, i) {
			return DuplicateEntriesWindowCardValues.getSimplifiedCard(this, book, i);
		},

		/**
		 * Creates table with address book fields for side-by-side comparison
		 * and editing. Editable fields will be listed in this.editableFields.
		 */
		displayCardData: function(card1, card2, comparison, preference,
			                  namesmatch, mailsmatch, phonesmatch) {
			DuplicateEntriesWindowDisplay.displayCardData(this, card1, card2, comparison, preference,
				namesmatch, mailsmatch, phonesmatch);
		},

		completeFirstLastDisplayName: function(nameArray, card) {
			return DuplicateEntriesWindowCardValues.completeFirstLastDisplayName(this, nameArray, card);
		},

		/**
		 * Enriches a card with virtual properties used for comparison. Delegates to DuplicateEntriesWindowCardValues.
		 */
		enrichCardForComparison: function(card, mailLists) {
			DuplicateEntriesWindowCardValues.enrichCardForComparison(this, card, mailLists);
		},

		readAddressBooks: function() {
			var Contacts = DuplicateEntriesWindowContacts;
			if (!this.abDir1.isMailList) {
				var result1 = Contacts.getAllAbCards(this.abDir1, this);  /* cards are wrapped */
				this.vcards[this.BOOK_1] = result1.cards;
				this.vcardsSimplified[this.BOOK_1] = new Array();
				this.totalCardsBefore = result1.totalBefore;
			}
			if (this.abDir2 != this.abDir1 && !this.abDir2.isMailList) {
				var result2 = Contacts.getAllAbCards(this.abDir2, this);
				this.vcards[this.BOOK_2] = result2.cards;
				this.vcardsSimplified[this.BOOK_2] = new Array();
				this.totalCardsBefore += result2.totalBefore;
			} else {
				this.vcards[this.BOOK_2] = this.vcards[this.BOOK_1];
				this.vcardsSimplified[this.BOOK_2] = this.vcardsSimplified[this.BOOK_1];
			}
		},

		/**
		 * Marks the side specified by 'left' or 'right' as to be kept. Delegates to DuplicateEntriesWindowUI.
		 */
		setContactLeftRight: function(side) {
			DuplicateEntriesWindowUI.setContactLeftRight(this, side);
		},

		/**
		 * Removes all rows (excluding header) from the attribute comparison & edit table.
		 */
		purgeAttributesTable: function() {
			DuplicateEntriesWindowDisplay.purgeAttributesTable(this);
		},

		/**
		 * Returns a table with all editable fields.
		 * The parameter ('left' or 'right') specifies the column of the table to be used.
		 */
		getCardFieldValues: function(side) {
			return DuplicateEntriesWindowDisplay.getCardFieldValues(this, side);
		},

		propertySet: function(card, properties) {
			return DuplicateEntriesWindowCardValues.propertySet(this, card, properties);
		},

		/** Delegates to DuplicateEntriesWindowComparison.compareCards; context is this (window). */
		abCardsCompare: function(c1, c2) {
			return DuplicateEntriesWindowComparison.compareCards(c1, c2, this);
		},

		enable: function(id) {
			DuplicateEntriesWindowUI.enable(id);
		},
		disable: function(id) {
			DuplicateEntriesWindowUI.disable(id);
		},
		show: function(id) {
			DuplicateEntriesWindowUI.show(id);
		},
		hide: function(id) {
			DuplicateEntriesWindowUI.hide(id);
		},
		show_hack: function(id) {
			DuplicateEntriesWindowUI.show_hack(id);
		},
		make_visible: function(id) {
			DuplicateEntriesWindowUI.make_visible(id);
		},
		make_invisible: function(id) {
			DuplicateEntriesWindowUI.make_invisible(id);
		},

		getPrunedProperty: function(card, property) {
			return DuplicateEntriesWindowCardValues.getPrunedProperty(this, card, property);
		},

		createSelectionList: function(cls, labels, values, selected) {
			return DuplicateEntriesWindowUI.createSelectionList(cls, labels, values, selected);
		}
	});
}
