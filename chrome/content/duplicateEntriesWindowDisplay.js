// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowDisplay.js
//
// Comparison table display: displayCardData, displayCardField, SetRelation,
// purgeAttributesTable, getCardFieldValues.
// ctx must have: attributesTableRows, displayedFields, editableFields, consideredFields,
// nonequivalentProperties, matchablesList, getString, getProperty, getAbstractedTransformedProperty,
// defaultValue, isSet, isEmail, isPhoneNumber, isText, isNumerical, isSelection,
// createSelectionList, sideKept, setContactLeftRight.
// Load after duplicateEntriesWindowUI.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowDisplay = (function() {
	"use strict";

	function pushIfNew(elem, array) {
		if (!array.includes(elem))
			array.push(elem);
		return array;
	}

	/**
	 * Returns [both_empty, equ] for set comparison display (⊇ ⊆ ≅).
	 */
	function setRelation(card1, card2, property) {
		const defaultValue_Set = new Set();
		const value1 = card1.getProperty(property, defaultValue_Set);
		const value2 = card2.getProperty(property, defaultValue_Set);
		const both_empty = value1.size == 0 && value2.size == 0;
		let equ;
		if (value1.isSuperset(value2)) {
			if (value2.isSuperset(value1))
				equ = '≅';
			else
				equ = '⊇';
		} else {
			if (value2.isSuperset(value1))
				equ = '⊆';
			else
				equ = '';
		}
		return [both_empty, equ];
	}

	/**
	 * Creates table row for one address book field for side-by-side comparison and editing.
	 * Editable fields will be listed in ctx.editableFields.
	 */
	function displayCardField(ctx, card1, card2, defaultValue, leftValue, rightValue, property, row) {
		ctx.displayedFields.push(property);
		var editable = property != 'PhotoURI' && !ctx.isSet(property) && property != 'LastModifiedDate';
		if (editable)
			pushIfNew(property, ctx.editableFields);

		const cell1 = document.createElement('hbox');
		const cell2 = document.createElement('hbox');
		const cellEqu = document.createElement('hbox');
		const descEqu = document.createElement('description');
		cellEqu.className = 'equivalence';
		cellEqu.appendChild(descEqu);

		var identical = true;
		let equ = '≡';
		var both_empty = 0;
		if (ctx.isSet(property)) {
			[both_empty, equ] = setRelation(card1, card2, property);
			identical = equ == '≅';
		} else {
			identical = leftValue == rightValue;
			both_empty = leftValue == defaultValue && rightValue == defaultValue;
			if        (ctx.isEmail(property)) {
				[both_empty, equ] = setRelation(card1, card2, '__Emails');
			} else if (ctx.isPhoneNumber(property)) {
				[both_empty, equ] = setRelation(card1, card2, '__PhoneNumbers');
			} else if (!identical) {
				const value1 = ctx.getAbstractedTransformedProperty(card1, property);
				const value2 = ctx.getAbstractedTransformedProperty(card2, property);
				if      (value1 == value2)
					equ = '≅';
				else if (value1 == defaultValue)
					equ = '⋦';
				else if (value2 == defaultValue)
					equ = '⋧';
				else if (ctx.isText(property)) {
					if      (value2.includes(value1))
						equ = '<';
					else if (value1.includes(value2))
						equ = '>';
					else
						equ = '';
				}
				else if (ctx.isNumerical(property)) {
					const comparison = card1.getProperty(property, 0) - card2.getProperty(property, 0);
					if      (comparison < 0)
						equ = '<';
					else if (comparison > 0)
						equ = '>';
					else
						equ = '≡';
				}
				else
					equ = '';
			}
		}
		if (!identical) {
			cell1.setAttribute('class', ctx.sideKept == 'left' ? 'keep' : 'remove');
			cell2.setAttribute('class', ctx.sideKept == 'left' ? 'remove' : 'keep');
		}
		if (both_empty)
			equ = '';
		if (equ != '' &&
		    (property == 'SecondEmail' ||
		     property != 'CellularNumber' && ctx.isPhoneNumber(property)))
			equ = '⋮';
		descEqu.setAttribute('value', equ);

		let cell1valuebox;
		let cell2valuebox;

		if (property == 'PhotoURI') {
			descEqu.style.marginTop = '1em';
			cell1valuebox = document.createElement('image');
			cell2valuebox = document.createElement('image');
		} else if (ctx.isSelection(property)) {
			var labels;
			if (property == 'PreferMailFormat') {
				labels = [ctx.getString('unknown_label'),
					  ctx.getString('plaintext_label'),
					  ctx.getString('html_label')];
			} else {
				labels = [ctx.getString('false_label'),
					  ctx.getString('true_label')];
			}
			var values = [0, 1, 2];
			cell1valuebox = ctx.createSelectionList(null, labels, values,  leftValue);
			cell2valuebox = ctx.createSelectionList(null, labels, values, rightValue);
		} else {
			function make_valuebox(value) {
				const valuebox = editable ? document.createElement('textbox') :
				                 property == '__MailListNames' ? document.createElement('description')
				                                               : document.createElement('label');
				valuebox.className = 'textbox';
				if (property == '__MailListNames')
					valuebox.textContent = value;
				else
					valuebox.setAttribute('value', value);
				if (property == 'Notes')
					valuebox.setAttribute('multiline', 'true');
				return valuebox;
			}
			cell1valuebox = make_valuebox( leftValue);
			cell2valuebox = make_valuebox(rightValue);
		}

		cell1valuebox.setAttribute('flex', '2');
		cell2valuebox.setAttribute('flex', '2');
		cell1valuebox.setAttribute('id',  'left_'+property);
		cell2valuebox.setAttribute('id', 'right_'+property);

		cell1.appendChild(cell1valuebox);
		cell1.setAttribute('id', 'cell_left_' +property);
		cell2.appendChild(cell2valuebox);
		cell2.setAttribute('id', 'cell_right_'+property);

		row.appendChild(cell1);
		row.appendChild(cellEqu);
		row.appendChild(cell2);

		ctx.attributesTableRows.appendChild(row);
		if (property == 'PhotoURI') {
			cell1valuebox.height = 100;
			cell2valuebox.height = 100;
			cell1valuebox.setAttribute('flex', "");
			cell2valuebox.setAttribute('flex', "");
			cell1valuebox.src = card1.getProperty('PhotoURI', "");
			cell2valuebox.src = card2.getProperty('PhotoURI', "");
		}
	}

	/**
	 * Creates table with address book fields for side-by-side comparison and editing.
	 */
	function displayCardData(ctx, card1, card2, comparison, preference,
			namesmatch, mailsmatch, phonesmatch) {
		DuplicateEntriesWindowDisplay.purgeAttributesTable(ctx);
		ctx.displayedFields = [];
		ctx.editableFields = [];
		DuplicateEntriesWindowUI.showComparisonTableHeader(ctx);
		const cardsEqu = document.getElementById('cardsEqu');
		cardsEqu.value = comparison == -2 ? '' :
		                 comparison == 0 ? '≅' :
		                 comparison <  0 ? '⋦' : '⋧';

		const mail1 = ctx.getAbstractedTransformedProperty(card1, 'PrimaryEmail');
		const mail2 = ctx.getAbstractedTransformedProperty(card2, 'PrimaryEmail');
		const displaySecondMail = (mail1 != '' && mail2 != '' && mail1 != mail2);
		const dn1 = ctx.getAbstractedTransformedProperty(card1, 'DisplayName');
		const dn2 = ctx.getAbstractedTransformedProperty(card2, 'DisplayName');
		const displayNickName = (dn1 != '' && dn1 != ctx.getAbstractedTransformedProperty(card1,'FirstName')+" "+
			ctx.getAbstractedTransformedProperty(card1, 'LastName'))
			|| (dn2 != '' && dn2 != ctx.getAbstractedTransformedProperty(card2,'FirstName')+" "+
			ctx.getAbstractedTransformedProperty(card2, 'LastName'))
			|| (dn1 != dn2);

		var fields = ctx.consideredFields.slice();
		const diffProps = ctx.nonequivalentProperties;
		for (var i = 0; i < diffProps.length; i++) {
			const property = diffProps[i];
			if (!property.match(/^\{/))
				pushIfNew(property, fields);
		}
		for (var j = 0; j < fields.length; j++) {
			const property = fields[j];
			var row = document.createElement('row');
			var labelcell = document.createElement('label');
			var localName = property;
			try {
				localName = ctx.getString(property + '_label');
			} catch (e) {}
			labelcell.setAttribute('value', localName + ':');
			labelcell.setAttribute('class', 'field');
			row.appendChild(labelcell);
			if (ctx.matchablesList.includes(property)) {
				const cell1 = document.createElement('label');
				const cellEqu = document.createElement('hbox');
				const descEqu = document.createElement('description');
				cellEqu.className = 'equivalence';
				cellEqu.appendChild(descEqu);
				if (namesmatch && property == '__Names' ||
				    mailsmatch && property == '__Emails' ||
				    phonesmatch && property == '__PhoneNumbers')
					descEqu.setAttribute('value', '≃');
				row.appendChild(cell1);
				row.appendChild(cellEqu);
				ctx.attributesTableRows.appendChild(row);
			} else {
				const defaultValue = ctx.defaultValue(property);
				const leftValue = ctx.getProperty(card1, property);
				const rightValue = ctx.getProperty(card2, property);
				const displayOnlyIfDifferent = /^(PhotoType|CellularNumberType|HomePhoneType|WorkPhoneType|FaxNumberType|PagerNumberType|UID|UUID|CardUID)$/;
				const displayAlways = /^(FirstName|LastName|DisplayName|_AimScreenName|PrimaryEmail|SecondEmail|CellularNumber|HomePhone|WorkPhone|FaxNumber|Notes|PopularityIndex)$/;
				if ((!property.match(displayOnlyIfDifferent) || leftValue != rightValue) &&
				    (   ( leftValue &&  leftValue != defaultValue)
				     || (rightValue && rightValue != defaultValue)
				     || (property=='SecondEmail' && displaySecondMail)
				     || (property=='NickName'    && displayNickName)
				     || property.match(displayAlways)
				   ))
					displayCardField(ctx, card1, card2, defaultValue, leftValue, rightValue, property, row);
			}
		}
		ctx.setContactLeftRight(preference < 0 ? 'right' : 'left');
	}

	/**
	 * Removes all rows (excluding header) from the attribute comparison & edit table.
	 */
	function purgeAttributesTable(ctx) {
		DuplicateEntriesWindowUI.hideComparisonTableHeader(ctx);
		while (ctx.attributesTableRows.firstChild.nextSibling) {
			ctx.attributesTableRows.removeChild(ctx.attributesTableRows.firstChild.nextSibling);
		}
		ctx.displayedFields = null;
		ctx.editableFields = null;
	}

	/**
	 * Returns an object with all editable field values for the given side ('left' or 'right').
	 */
	function getCardFieldValues(ctx, side) {
		var result = {};
		for (var i = 0; i < ctx.editableFields.length; i++) {
			const id = side + '_' + ctx.editableFields[i];
			const valuebox = document.getElementById(id);
			const value = valuebox.selectedItem ? valuebox.selectedItem.value : valuebox.value;
			result[ctx.editableFields[i]] = value;
		}
		return result;
	}

	return {
		displayCardData: displayCardData,
		purgeAttributesTable: purgeAttributesTable,
		getCardFieldValues: getCardFieldValues
	};
})();
