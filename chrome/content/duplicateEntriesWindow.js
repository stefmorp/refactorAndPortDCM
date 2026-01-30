// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindow.js

// This file includes UTF-8 encoding. Please make sure your text editor can deal with this prior to saving any changes!

/* Change history:
## Version 1.1.1 (seen as 2.1.1 by Thunderbird 68+):
 * compatiblility with Thunderbird 68+; slightly improve documentation
## Version 1.1:
 * improve progress calculation and display; clean up photo image handling
## Version 1.0.9:
 * fix bug introduced in version 1.0.8 regarding manual selection which side to keep
## Version 1.0.8:
 * make vertical size more flexible for small displays
 * fix display layout for overlong list membership information etc.
 * add comparison of number of non-empty fields for determining card preferred for deletion
 * improve calculation of character weight for determining card preferred for deletion
 * correct comparison of selection fields determining which side has less information
 * fix use of default value for ignoreFields; ignore by default also phone number types
 * various implementation improvements for more efficiency and better readability
## Version 1.0.7:
 * add option for normalizing international call prefix
 * fix horizontal layout issues, automatic width of contents
 * improve name matching: allow substrings, stop removing singleton digits and letters
 * mail user names like no-reply@... or no.service@... not anymore taken as first+last names
## Version 1.0.6:
 * various UI layout (width, vertical scrolling) and small documentation improvements
## Version 1.0.5:
 * correction of mistake in packaging version 1.0.4 that prevented it from running
## Version 1.0.4:
 * various small UI improvements: indication for card matching, layout, language, doc
## Version 1.0.3:
 * fixed syntax error in de-DE locale that lead to obscure initialization error
 * minor improvements of localization in the extension and of the entry in the TB add-ons list
## Version 1.0.1 and 1.0.2:
 * improved label of DCM menu entry for address book window
## Version 1.0:
 * major speedup in particular when searching for duplicates in large address books
 * improved user guidance; new Tools menu entry with default address book selection
 * various improvements of content matching and card comparison for equivalence
 * cards may be excluded from being presented as matching by setting a different AIM name
 * photos are compared for equality and are shown during manual inspection
 * mailing list membership is taken into account for comparison and shown during inspection
 * during manual inspection, field-by-field (resp. set-by-set) comparison information is shown
 * option to consider phone numbers with national prefix and with default country code equivalent
 * option to customize list of ignored fields; output summary of different fields
 * option to preserve entries of first address book when auto-deleting redundant entries
 * options are saved in TB configuration/preferences at `extensions.DuplicateContactsManager.*`
## Version 0.9.2:
 * few critical bug fixes
 * layout improvements
## Version 0.9:
 * Can now edit contacts.
 * Auto-removal of contacts which only contain some less fields.
 * Can work across two address books.
 * Option to collect all potential duplicates before interacting with the user.
 * Progress bar and other usability improvements
## Version 0.8:
 * Offer to delete exact duplicates without asking
 * Correctly search for exact duplicates
 * upgrade to support Thunderbird 7
 */

// TODO: add option to prune and transform contents of individual or all cards
// TODO: add option to automatically and/or manually merge fields (e.g., buttons with arrow)
// TODO: generalize matching/comparison and manual treatment to more than two entries

/*
   References:
   https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/nsIAbCard_(Tb3)
   https://developer.mozilla.org/en-US/docs/Mozilla/Thunderbird/Address_Book_Examples
*/

Set.prototype.isSuperset = function(other) {
	for(let elem of other) {
		if (!this.has(elem)) {
			return false;
		}
	}
	return true;
}

Set.prototype.toString = function() {
	return "{" + Array.from(this).join(", ") + "}";
}

function pushIfNew(elem, array) { /* well, this 'function' has a side effect on array */
	if (!array.includes(elem))
		array.push(elem);
	return array;
}
/*
T.prototype.pushIfNew = function(elem) {
	if (!this.includes(elem))
		this.push(elem);
	return this;
where T = Array would be an elegant extension of the built-in JS type Array. Yet in TB this not allowed for security and compatibility reasons.
It also would have the weird effect of adding an extra enumerable value to each array, as described here:
https://stackoverflow.com/questions/948358/adding-custom-functions-into-array-prototype
The following does not really work better:
Object.defineProperty(Array.prototype, 'insert', {
	enumerable: false,
	value: function (elem) {
	if (!this.includes(elem))
		this.push(elem);
	return this; }
});
As a workaround, one would need to avoid using the enumerator "for(let variable in ...)"
*/

if (typeof(DuplicateContactsManager_Running) == "undefined") {
	var DuplicateEntriesWindow = {
		restart: false,
		abManager : null, // set in init() from DuplicateEntriesWindowContacts

		stringBundle: null,
		stringBundle_old: null,
		prefsBranch: null,

		statustext: '',
		progresstext: '',
		progressmeter: null,
		window: null,

		// Constants for first index of vcards arrays
		BOOK_1 : 0,
		BOOK_2 : 1,
		// Contacts. Two dimensions arrays. The first index is the adress book.
		vcards          : new Array(),
		vcardsSimplified: new Array(),

		positionSearch: 0,
		position1: 0,
		position2: 0,
		deferInteractive: true,
		nowHandling: false,
		positionDuplicates: 0,
		duplicates: null,

		table: null,
		displayedFields: null,
		editableFields: null,

		sideKept: null,
		keepLeftRadioButton: null,
		keepRightRadioButton: null,

		abURI1: null,
		abURI2: null,
		abDir1: null,
		abDir2: null,

		card1: null,
		card2: null,

		totalCardsBefore: 0,
		totalCardsChanged: 0,
		totalCardsSkipped: 0,
		totalCardsDeleted1: 0,
		totalCardsDeleted2: 0,
		totalCardsDeletedAuto: 0,
		autoremoveDups: false,
		preserveFirst: false,
		nonequivalentProperties : [],
		ignoredFields : [],
		consideredFields : [],
		natTrunkPrefix : "", // national phone number trunk prefix
		natTrunkPrefixReqExp : /^0([1-9])/, // typical RegExp for national trunk prefix
		intCallPrefix : "", // international call prefix
		intCallPrefixReqExp : /^00([1-9])/, // typical RegExp for international call prefix
		countryCallingCode : "", // international country calling code

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
			do {
				var Prefs = Components.classes["@mozilla.org/preferences-service;1"]
					.getService(Components.interfaces.nsIPrefService);
				var prefBranchPrefixId = "extensions.DuplicateContactsManager.";
				this.prefsBranch = Prefs.getBranch(prefBranchPrefixId);
				if (!this.prefsBranch)
					break;
				try { this.autoremoveDups = this.prefsBranch.getBoolPref('autoremoveDups'); } catch(e) {}
				try { this.preserveFirst = this.prefsBranch.getBoolPref('preserveFirst'); } catch(e) {}
				try { this.deferInteractive = this.prefsBranch.getBoolPref('deferInteractive'); } catch(e) {}

				try { this.natTrunkPrefix  = this.prefsBranch.getCharPref('natTrunkPrefix');
				      this.natTrunkPrefixReqExp = new RegExp("^"+this.natTrunkPrefix+"([1-9])"); } catch(e) {}
				try { this.intCallPrefix  = this.prefsBranch.getCharPref('intCallPrefix');
				      this.intCallPrefixReqExp = new RegExp("^"+this.intCallPrefix+"([1-9])"); } catch(e) {}
				try { this.countryCallingCode = this.prefsBranch.getCharPref('countryCallingCode'); } catch(e) {}
				this.ignoredFields = this.ignoredFieldsDefault.slice();
				try { var prefStringValue = this.prefsBranch.getCharPref('ignoreFields');
				      if (prefStringValue.length > 0)
					      this.ignoredFields = prefStringValue.split(/\s*,\s*/);
				    } catch(e) {}
			} while (0);
			document.getElementById('autoremove').checked = this.autoremoveDups;
			document.getElementById('preservefirst').checked = this.preserveFirst;
			document.getElementById('deferInteractive').checked = this.deferInteractive;
			document.getElementById('natTrunkPrefix').value = this.natTrunkPrefix;
			document.getElementById('intCallPrefix').value = this.intCallPrefix;
			document.getElementById('countryCallingCode').value = this.countryCallingCode;
			this.consideredFields = /* value before any interactive changes by user */
				this.addressBookFields.filter(x => !this.ignoredFields.includes(x));
			document.getElementById('consideredFields').textContent = this.consideredFields.
				filter(x => !this.isSet(x) && !this.matchablesList.includes(x)).join(", ");
			document.getElementById('ignoredFields').value = this.ignoredFields.join(", ");

			try { /* for Thunderbird 68+. */
				var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
				this.stringBundle = Services.strings.createBundle("chrome://duplicatecontactsmanager/locale/duplicateContactsManager.properties");
			} catch(e) {
				this.stringBundle = document.getElementById('bundle_duplicateContactsManager');
			}
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

		getString: function(name) {
			return this.stringBundle_old ? this.stringBundle_old.getString(name) : this.stringBundle.GetStringFromName(name);
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

			this.autoremoveDups = document.getElementById('autoremove').getAttribute('checked');
			this.preserveFirst = document.getElementById('preservefirst').getAttribute('checked');
			this.deferInteractive = document.getElementById('deferInteractive').getAttribute('checked');
			this.natTrunkPrefix = document.getElementById('natTrunkPrefix').value;
			this.intCallPrefix = document.getElementById('intCallPrefix').value;
			this.countryCallingCode = document.getElementById('countryCallingCode').value;
			if (this.natTrunkPrefix != "" && !this.natTrunkPrefix.match(/^[0-9]{1,2}$/))
				alert("National phone number trunk prefix '"+this.natTrunkPrefix+"' should contain one or two digits");
			if (this.intCallPrefix != "" && !this.intCallPrefix.match(/^[0-9]{2,4}$/))
				alert("International call prefix '"+this.intCallPrefix+"' should contain two to four digits");
			if (this.countryCallingCode != "" && !this.countryCallingCode.match(/^(\+|[0-9])[0-9]{1,6}$/))
				alert("Default country calling code '"+this.countryCallingCode+"' should contain a leading '+' or digit followed by one to six digits");
			this.ignoredFields = document.getElementById('ignoredFields').value.split(/\s*,\s*/);
			this.consideredFields = this.addressBookFields./*
				concat(this.ignoredFieldsDefault).
				filter(x => !this.matchablesList.includes(x)). */
				filter(x => !this.ignoredFields.includes(x));

			this.prefsBranch.setBoolPref('autoremoveDups', this.autoremoveDups);
			this.prefsBranch.setBoolPref('preserveFirst', this.preserveFirst);
			this.prefsBranch.setBoolPref('deferInteractive', this.deferInteractive);
			this.prefsBranch.setCharPref('natTrunkPrefix', this.natTrunkPrefix);
			this.prefsBranch.setCharPref('intCallPrefix', this.intCallPrefix);
			this.prefsBranch.setCharPref('countryCallingCode', this.countryCallingCode);
			this.prefsBranch.setCharPref('ignoreFields', this.ignoredFields.join(", "));

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
			setTimeout(function() { DuplicateEntriesWindow.searchDuplicateIntervalAction(); }, 13);
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
			var card = this.vcards[book][index];

			// see what's been modified
			var updateFields = this.getCardFieldValues(side);
			var entryModified = false;
			for(let property in updateFields) {
				const defaultValue = this.defaultValue(property); /* cannot be a set here */
				if (card.getProperty(property, defaultValue) != updateFields[property]) {
				// not using this.getProperty here to give a chance to update wrongly empty field
					try {
						// this.debug("updating "+property+" from "+card.getProperty(property, defaultValue)+" to "+updateFields[property]);
						card.setProperty(property, updateFields[property]);
						entryModified = true;
					} catch (e) {
						alert("Internal error: cannot set field '"+property+"' of "+card.displayName+": "+e);
					}
				}
			}
			if (entryModified) {
				this.vcardsSimplified[book][index] = null; // request reconstruction by getSimplifiedCard
				try {
					DuplicateEntriesWindowContacts.saveCard(abDir, card);
					this.totalCardsChanged++;
				} catch (e) {
					alert("Internal error: cannot update card '"+card.displayName+"': "+e);
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
			var card = this.vcards[book][index];
			try {
				DuplicateEntriesWindowContacts.deleteCard(abDir, card);
				if (abDir == this.abDir1)
					this.totalCardsDeleted1++;
				else
					this.totalCardsDeleted2++;
				if (auto)
					this.totalCardsDeletedAuto++;
			} catch (e) {
				alert("Internal error: cannot remove card '"+card.displayName+"': "+e);
			}
			this.vcards[book][index] = null; // set empty element, but leave element number as is
		},

		updateDeletedInfo: function (label, book, nDeleted) {
			const cards = this.getString('cards');
			document.getElementById(label).value = '('+cards+': '+ (this.vcards[book].length -
			                         (this.abDir1 == this.abDir2 ? this.totalCardsDeleted1 +
			                                                       this.totalCardsDeleted2 : nDeleted)) +')';
		},

		updateProgress: function() {
			// update status info - will not be visible immediately during search, see also http://forums.mozillazine.org/viewtopic.php?p=5300605
			var current, pos, max;
			if(!this.deferInteractive || !this.nowHandling) {
				current = 'pair';
				pos = this.positionSearch + 1;
				const num1 = this.vcards[this.BOOK_1].length;
				const num2 = this.vcards[this.BOOK_2].length;
				max = this.abDir1 == this.abDir2 ? (num1*(num1-1)/2) : (num1*num2);
				if (pos > max) /* happens at end */
					pos = max;
			} else {
				current = 'parity';
				pos = this.positionDuplicates;
				max = this.duplicates.length;
			}
			this.progressmeter.setAttribute('value', ((max == 0 ? 1 : pos/max) * 100) + '%');
			this.progresstext.value = this.getString(current)+" "+pos+
				" "+this.getString('of')+" "+max;
			this.updateDeletedInfo('statusAddressBook1_size' , this.BOOK_1, this.totalCardsDeleted1);
			this.updateDeletedInfo('statusAddressBook2_size' , this.BOOK_2, this.totalCardsDeleted2);
		},

		/**
		 * advances internal pointers to next available card pair.
		 * Returns true if and only if next pair is available
		 */
		skipPositionsToNext: function() {
			if(!this.deferInteractive || !this.nowHandling) {
				if (this.searchPositionsToNext())
					return true;
				if (!this.deferInteractive)
					return false;
				this.nowHandling = true;
			}
			do {
				if (this.positionDuplicates++ >= this.duplicates.length) {
				  return false;
				}
				[this.position1, this.position2] = this.duplicates[this.positionDuplicates-1];
			} while(!this.vcards[this.BOOK_1][this.position1] ||
			        !this.vcards[this.BOOK_2][this.position2]);
			this.updateProgress();
			return true;
		},

		/**
		 * increments internal pointers to next available card pair.
		 * Returns true if and only if next pair is available
		 */
		searchPositionsToNext: function() {
			// If the current position is deleted, force the search for a next one by
			// setting the position2 to the end.
			if(!this.vcards[this.BOOK_1][this.position1])
				this.position2 = this.vcards[this.BOOK_2].length;

			this.positionSearch++;
			// Search for the next position2
			do
			{
				++(this.position2);
				if(this.position2 >= this.vcards[this.BOOK_2].length)
				{
					// We have reached the end, search for the next position
					do
					{
						this.position1++;
						this.updateProgress();
						// if same book, make sure it's possible to have ...,position1, position2.
						if(this.position1 + (this.abDir1 == this.abDir2 ? 1 : 0) >= this.vcards[this.BOOK_1].length)
							return false;
					} while(!this.vcards[this.BOOK_1][this.position1]);

					// if same book, we start searching the pair with the position after.
					this.position2 = (this.abDir1 == this.abDir2 ? this.position1 + 1 : 0);
				}
			} while(!this.vcards[this.BOOK_2][this.position2]);

			return true;
		},

		/**
		 * performs the actual search action. Should not be called directly, but by searchNextDuplicate().
		 */
		searchDuplicateIntervalAction: function() {
			var lasttime = new Date;
			while (this.skipPositionsToNext()) {
				if ((new Date)-lasttime >= 1000) {
					// Force/enable Thunderbird every 1000 milliseconds to redraw the progress bar etc.
					// See also http://stackoverflow.com/questions/2592335/how-to-report-progress-of-a-javascript-function
					// As a nice side effect, this allows the stop button to take effect while this main loop is active!
					setTimeout(function() { DuplicateEntriesWindow.searchDuplicateIntervalAction(); }, 13);
					return;
				}

				var simplified_card1 = this.getSimplifiedCard(this.BOOK_1, this.position1);
				var simplified_card2 = this.getSimplifiedCard(this.BOOK_2, this.position2);
				if (simplified_card1['_AimScreenName'] != simplified_card2['_AimScreenName'])
					continue; // useful for manual differentiation to prevent repeated treatment
				var M = DuplicateEntriesWindowMatching;
				var namesmatch = M.namesMatch(simplified_card1, simplified_card2);
				var mailsmatch = M.mailsMatch(simplified_card1, simplified_card2);
				var phonesmatch = M.phonesMatch(simplified_card1, simplified_card2);
				var nomailsphonesmatch = M.noMailsPhonesMatch(simplified_card1) &&
				                        M.noMailsPhonesMatch(simplified_card2);
				var nomatch = M.noNamesMatch(simplified_card1) &&
				              M.noNamesMatch(simplified_card2) && nomailsphonesmatch;  // pathological case
				if (namesmatch || mailsmatch || phonesmatch || nomatch) {
					// OK, we found something that looks like a duplicate or cannot match anything.
					var card1 = this.vcards[this.BOOK_1][this.position1];
					var card2 = this.vcards[this.BOOK_2][this.position2];
					var [comparison, preference] = DuplicateEntriesWindowComparison.compareCards(card1, card2, this);
					if (comparison != -2 && this.autoremoveDups &&
					    !(this.abDir1 != this.abDir2 && this.preserveFirst && preference < 0)) {
						if (preference < 0)
							this.deleteAbCard(this.abDir1, this.BOOK_1, this.position1, true);
						else // if preference >= 0, prefer to delete c2
							this.deleteAbCard(this.abDir2, this.BOOK_2, this.position2, true);
					} else {
						//window.clearInterval(this.searchInterval);

						if (this.deferInteractive && !this.nowHandling) { // append the positions to queue
							this.duplicates.push([this.position1, this.position2]);
						}
						else {
							DuplicateEntriesWindowUI.showDuplicatePairState(this);
							this.statustext.className = 'with-progress';
							this.statustext.textContent = this.getString(
							                        nomatch ? 'noMatch' : 'matchFound');
							this.displayCardData(card1, card2, comparison, preference,
							                     namesmatch, mailsmatch, phonesmatch);
							return;
						}
					}
				}
			}
			this.endSearch();
		},

		endSearch: function() {
			DuplicateEntriesWindowUI.showFinishedState(this);
			this.statustext.className = 'with-progress';
			this.statustext.textContent = this.getString('finished');

			// show statistics
			var totalCardsDeleted = this.totalCardsDeleted1+this.totalCardsDeleted2;
			document.getElementById('resultNumBefore').value = this.totalCardsBefore;
			document.getElementById('resultNumAfter').value = this.totalCardsBefore - totalCardsDeleted;
			document.getElementById('resultNumRemovedMan').value = totalCardsDeleted - this.totalCardsDeletedAuto;
			document.getElementById('resultNumRemovedAuto').value = this.totalCardsDeletedAuto;
			document.getElementById('resultNumChanged').value = this.totalCardsChanged;
			document.getElementById('resultNumSkipped').value = this.totalCardsSkipped;
			document.getElementById('resultConsideredFields').textContent = this.consideredFields.
				filter(x => !this.isSet(x) && !this.matchablesList.includes(x)).join(", ");
			document.getElementById('resultIgnoredFields').textContent = this.ignoredFields.join(", ");
			document.getElementById('resultDiffProps').textContent = this.nonequivalentProperties.join(", ");
			document.getElementById('startbutton').setAttribute('label', this.getString('Restart'));
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
		 * Enriches a card with virtual properties used for comparison (__NonEmptyFields,
		 * __CharWeight, __MailListNames, __Emails, __PhoneNumbers). Called by
		 * DuplicateEntriesWindowContacts.getAllAbCards for each card.
		 */
		enrichCardForComparison: function(card, mailLists) {
			var nonemptyFields = 0;
			var charWeight = 0;
			for (var index = 0; index < this.consideredFields.length; index++) {
				var property = this.consideredFields[index];
				if (this.isNumerical(property))
					continue;
				var defaultValue = this.defaultValue(property);
				var value = card.getProperty(property, defaultValue);
				if (value != defaultValue)
					nonemptyFields += 1;
				if (this.isText(property) || this.isEmail(property) || this.isPhoneNumber(property))
					charWeight += this.charWeight(value, property);
			}
			card.setProperty('__NonEmptyFields', nonemptyFields);
			card.setProperty('__CharWeight', charWeight);

			var mailListNames = new Set();
			var email = card.primaryEmail;
			if (email) {
				for (var i = 0; i < mailLists.length; i++) {
					if (mailLists[i][1].includes(email))
						mailListNames.add(mailLists[i][0]);
				}
			}
			card.setProperty('__MailListNames', mailListNames);
			card.setProperty('__Emails', DuplicateEntriesWindowCardValues.propertySet(this, card, ['PrimaryEmail', 'SecondEmail']));
			card.setProperty('__PhoneNumbers', DuplicateEntriesWindowCardValues.propertySet(this, card, ['HomePhone', 'WorkPhone',
				'FaxNumber', 'PagerNumber', 'CellularNumber']));
		},

		readAddressBooks: function() {
			var Contacts = DuplicateEntriesWindowContacts;
			if (!this.abDir1.isMailList) {
				var result1 = Contacts.getAllAbCards(this.abDir1, this);
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
		 * Marks the side specified by the parameter 'left' or 'right' as to be kept.
		 * If no parameter is given (or the side parameter is null) the selection is toggled.
		 */
		setContactLeftRight: function(side) {
			if (!side)
				side = keepLeftRadioButton.getAttribute('selected') == 'true' ? 'right' : 'left';
			if (side != this.sideKept) {
				this.sideKept = side;
				const other = side == 'right' ? 'left' : 'right';
				const to_be_kept    = this.getString('to_be_kept');
				const to_be_removed = this.getString('to_be_removed');
				this.keepLeftRadioButton .label = side == 'right' ? to_be_removed : to_be_kept;
				this.keepRightRadioButton.label = side == 'right' ? to_be_kept : to_be_removed;
				this.keepLeftRadioButton .setAttribute('selected', side == 'right' ? 'false' : 'true');
				this.keepRightRadioButton.setAttribute('selected', side == 'right' ? 'true' : 'false');
				document.getElementById('headerLeft' ).className = side == 'right' ? 'remove' : 'keep';
				document.getElementById('headerRight').className = side == 'right' ? 'keep': 'remove';
				for(let index = 0; index < this.displayedFields.length; index++) {
					var cell1 = document.getElementById('cell_' + side  + '_' + this.displayedFields[index]);
					var cell2 = document.getElementById('cell_' + other + '_' + this.displayedFields[index]);
					if (cell1.className == 'remove')
						  cell1.className = 'keep';
					if (cell2.className == 'keep')
						  cell2.className = 'remove';
				}
			}
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

/*
		readFile: function(url, async, binary) {
			if (url) {
				const req = new XMLHttpRequest();
				req.op en('GET', url, async);  // async == `false` makes the request synchronous
				if (binary)
					req.overrideMimeType('text/plain; charset=x-user-defined')
				try {
					req.send(null);
				} catch(e) {
					return null;
				}
				var responseText = req.status == 200 ? req.responseText : null;
				if (binary && responseText) {
					const responseTextLen = responseText.length;
					let data = '';
					for(let i = 0; i < responseTextLen; i+=1)
						data += String.fromCharCode(responseText.charCodeAt(i) & 0xff)
					responseText = data;
				}
				return responseText;
			}
			return null;
		},
*/

		/** Delegates to DuplicateEntriesWindowComparison.compareCards; context is this (window). */
		abCardsCompare: function(c1, c2) {
			return DuplicateEntriesWindowComparison.compareCards(c1, c2, this);
		},

		enable: function(id) {
			const elem = document.getElementById(id);
			elem.setAttribute('disabled', 'false');
			elem.className = '';
		},
		disable: function(id) {
			const elem = document.getElementById(id);
			elem.setAttribute('disabled', 'true');
			elem.className = 'disabled';
		},

		show: function(id) {
			document.getElementById(id).style.display=''; /* remove display property, restoring default */
		},
		show_hack: function(id) {
			document.getElementById(id).style.display='-moz-inline-stack'; /* enables scroll bar and stretches horizonally */
		},
		hide: function(id) {
			document.getElementById(id).style.display='none';
		},

		make_visible: function(id) {
			document.getElementById(id).style.visibility='visible';
		},
		make_invisible: function(id) {
			document.getElementById(id).style.visibility='hidden';
		},

		getPrunedProperty: function(card, property) {
			return DuplicateEntriesWindowCardValues.getPrunedProperty(this, card, property);
		},

		createSelectionList: function(cls, labels, values, selected) {
			var menulist = document.createElement('menulist');
			if (cls != null)
				menulist.setAttribute('class', cls);
			var menupopup = document.createElement('menupopup');
			if (cls != null)
				menupopup.setAttribute('class', cls);
			for(let index = 0; index < labels.length; index++) {
				var menuitem = document.createElement('menuitem');
				menuitem.setAttribute('crop', 'end');
				if (cls != null)
					menuitem.setAttribute('class', cls);
				menuitem.setAttribute('label', labels[index]);
				menuitem.setAttribute('value', values[index]);
				if (values[index] == selected) {
					menuitem.setAttribute('selected' ,'true');
					menupopup.selectedItem = menuitem;
				}
				menupopup.appendChild(menuitem);
			}
			menulist.appendChild(menupopup);
			return menulist;
		},
	}
}
