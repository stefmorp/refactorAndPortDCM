# Duplicate Contacts Manager — Architecture and Change History

For user-facing features, usage, and matching rules, see [README.md](README.md).

This document describes the **internal architecture** of the duplicate-finder window and the **change history** of the add-on. Script load order below is required for correct behaviour; do not reorder scripts in `duplicateEntriesWindow.xul` without checking module dependencies.

---

## Architecture

The add-on’s duplicate-finder window is implemented as a single XUL window (`duplicateEntriesWindow.xul`) and a main script (`duplicateEntriesWindow.js`) that orchestrates several JavaScript modules. The main script holds window state (cards, positions, preferences, DOM references) and delegates logic to the modules. Modules are loaded in a fixed order so that dependencies are available when each script runs.

### Script load order (in `duplicateEntriesWindow.xul`)

1. **duplicateEntriesWindowContacts.js**
2. **duplicateEntriesWindowFields.js**
3. **duplicateEntriesWindowPrefs.js**
4. **duplicateEntriesWindowMatching.js**
5. **duplicateEntriesWindowCardValues.js**
6. **duplicateEntriesWindowComparison.js**
7. **duplicateEntriesWindowUI.js**
8. **duplicateEntriesWindowDisplay.js**
9. **duplicateEntriesWindowSearch.js**
10. **duplicateEntriesWindow.js** (main window object)

---

### Module overview

#### 1. duplicateEntriesWindowContacts.js

**Role:** Read/write access to Thunderbird address books and contact cards.

**Exports:** `getAbManager`, `getDirectory(uri)`, `getAllAbCards(directory, context)`, `getCardProperty`, `setCardProperty`, `saveCard(abDir, card)`, `deleteCard(abDir, card)`.

**Responsibilities:**
- Obtain the nsIAbManager and resolve directory URIs to nsIAbDirectory.
- Load all cards from one or two address books; optionally enrich each card for comparison (virtual properties) via the context’s `enrichCardForComparison`.
- Read/write individual card properties and persist cards (save/delete).

**Dependencies:** None (load first). The main window passes itself as `context` so that card enrichment can use Fields/CardValues logic.

---

#### 2. duplicateEntriesWindowFields.js

**Role:** Central definition of address-book field lists and property-type predicates.

**Exports:** `addressBookFields`, `matchablesList`, `metaProperties`, `ignoredFieldsDefault`, and predicates: `isText`, `isFirstLastDisplayName`, `isEmail`, `isPhoneNumber`, `isSet`, `isSelection`, `isNumerical`, `defaultValue`, `charWeight`.

**Responsibilities:**
- Define the full list of address book properties and which are used for matching (`__Names`, `__Emails`, `__PhoneNumbers`).
- Provide type checks (text, email, phone, set, selection, numerical) and default values per property.
- Provide `charWeight` for “information content” used when preferring one card over another.

**Dependencies:** None. Other modules and the main window read these constants and functions.

---

#### 3. duplicateEntriesWindowPrefs.js

**Role:** Load and save user preferences for the duplicate-finder window (pref branch `extensions.DuplicateContactsManager.*`).

**Exports:** `getPrefsBranch`, `loadPrefs(ctx)`, `applyPrefsToDOM(ctx)`, `readPrefsFromDOM(ctx)`, `savePrefs(ctx)`.

**Responsibilities:**
- Create the prefs branch; read prefs into the window context (autoremove, preserve first book, defer interactive, phone prefixes, ignored fields).
- Sync context to/from the options form (apply to DOM on init, read from DOM on Start, write back to prefs when saving).

**Dependencies:** Expects `ctx` to have Fields-derived data (`ignoredFieldsDefault`, `addressBookFields`, `consideredFields`, `isSet`, `matchablesList`) and to set `prefsBranch` from `getPrefsBranch()`.

---

#### 4. duplicateEntriesWindowMatching.js

**Role:** Normalization and matching logic for duplicate detection (names, emails, phones).

**Exports:** `simplifyText`, `pruneText`, `abstract`, `transformMiddlePrefixName`, `noMailsPhonesMatch`, `noNamesMatch`, `phonesMatch`, `mailsMatch`, `namesMatch`.

**Responsibilities:**
- Normalize text (prune, transform name order, abstract for comparison) using a config object that supplies type checks and phone-prefix settings.
- Decide whether two simplified cards match on names, emails, or phones; handle the “no names/emails/phones to match” case.

**Dependencies:** Uses a normalization config (from main window’s `getNormalizationConfig()`); no other add-on modules.

---

#### 5. duplicateEntriesWindowCardValues.js

**Role:** Card value pipeline — get display or comparison values from a card, and build simplified cards for matching.

**Exports:** `getProperty`, `getPrunedProperty`, `getTransformedProperty`, `getAbstractedTransformedProperty`, `completeFirstLastDisplayName`, `getSimplifiedCard`, `propertySet`, `enrichCardForComparison`.

**Responsibilities:**
- Get raw, pruned, transformed, or abstracted values for a property (used by comparison and display).
- Build simplified card objects (abstracted names, emails, phones) for the matching module.
- Enrich cards with virtual properties (`__NonEmptyFields`, `__CharWeight`, `__MailListNames`, `__Emails`, `__PhoneNumbers`) when loading from Contacts.

**Dependencies:** Uses Matching for `pruneText`, `abstract`, `transformMiddlePrefixName`. Expects `ctx` to have Fields predicates and `getNormalizationConfig`, `vcards`, `vcardsSimplified`, `consideredFields`.

---

#### 6. duplicateEntriesWindowComparison.js

**Role:** Compare two cards for “equivalent or less information” and compute preference for which to delete.

**Exports:** `propertyUnion`, `compareCards(c1, c2, context)`.

**Also defines:** `Set.prototype.isSuperset` and `Set.prototype.toString` (used by Display and by comparison internals).

**Responsibilities:**
- Union of property names from two cards; field-by-field comparison using context’s value pipeline and Fields predicates.
- Push differing properties into `context.nonequivalentProperties`; return comparison result and preference (which card to prefer for deletion).

**Dependencies:** Uses Matching’s `abstract` (via context’s getters). Expects context to expose `consideredFields`, `metaProperties`, type predicates, `defaultValue`, `getAbstractedTransformedProperty`, etc.

---

#### 7. duplicateEntriesWindowUI.js

**Role:** UI state transitions, progress/finished stats, low-level DOM helpers, and “which side to keep” selection.

**Exports:** `enable`, `disable`, `show`, `hide`, `show_hack`, `make_visible`, `make_invisible`, `createSelectionList`, `setContactLeftRight`, `showReadyState`, `showSearchingState`, `showDuplicatePairState`, `disableDuplicateActionButtons`, `showFinishedState`, `showComparisonTableHeader`, `hideComparisonTableHeader`, `updateDeletedInfo`, `updateProgress`, `showFinishedStats`.

**Responsibilities:**
- Show/hide/enable/disable elements by id; create XUL menulists (address book dropdowns, PreferMailFormat/boolean in comparison table).
- Switch between “ready”, “searching”, “duplicate pair”, and “finished” states; update progress meter and card-count labels; fill the finished-state panel with result statistics.
- Implement “keep left/right” (radio labels, header and cell classes) via `setContactLeftRight(ctx, side)`.

**Dependencies:** None (only DOM and context data). Other code calls these with the main window as `ctx` where needed.

---

#### 8. duplicateEntriesWindowDisplay.js

**Role:** Build and clear the comparison table (side-by-side fields, equivalence symbols, editable inputs).

**Exports:** `displayCardData`, `purgeAttributesTable`, `getCardFieldValues`.

**Responsibilities:**
- Fill the comparison table for a pair of cards: labels, matchable rows (names/emails/phones), per-field rows with left/right values and equivalence (≡ ≅ ⋦ ⋧ etc.), including PhotoURI and selection dropdowns.
- Clear the table (purge rows, hide header via UI module).
- Read back edited values from the table for a given side (“left” or “right”).

**Dependencies:** Uses UI’s `showComparisonTableHeader`, `hideComparisonTableHeader`; expects `ctx` to have Fields predicates, `getProperty`, `getAbstractedTransformedProperty`, `createSelectionList`, `setContactLeftRight`, `attributesTableRows`, `displayedFields`, `editableFields`, etc.

---

#### 9. duplicateEntriesWindowSearch.js

**Role:** Position stepping over card pairs and the main duplicate-find loop.

**Exports:** `searchPositionsToNext`, `skipPositionsToNext`, `runIntervalAction`.

**Responsibilities:**
- Advance (position1, position2) over all pairs (same-book triangle or two-book rectangle), skipping deleted slots.
- When “defer interactive” is on, walk the pre-collected `duplicates` queue instead.
- In `runIntervalAction(ctx)`: loop over pairs; for each pair get simplified cards, run matching (names/mails/phones); if match, run comparison; auto-delete or enqueue or show comparison UI; yield every ~1 s for UI updates and re-schedule via `setTimeout`.

**Dependencies:** Uses Matching, Comparison, UI, Display; expects `ctx` to provide `vcards`, positions, `updateProgress`, `getSimplifiedCard`, `deleteAbCard`, `displayCardData`, `endSearch`, `getString`, and options (autoremoveDups, preserveFirst, etc.).

---

#### 10. duplicateEntriesWindow.js (main)

**Role:** Window object and orchestration.

**Responsibilities:**
- Hold all state (vcards, positions, preferences, DOM refs, options).
- `init()`: bind Fields, get Contacts’ abManager, load prefs, apply to DOM, init string bundle and DOM refs, build address book dropdowns, show ready state.
- `startSearch()`: read prefs from DOM, validate, save prefs, read address books, reset search state, show searching state, call `searchNextDuplicate()` which schedules `DuplicateEntriesWindowSearch.runIntervalAction`.
- Handle user actions: skip, keep both, apply (keep one + delete other); delegate card updates/deletes to Contacts; delegate table display to Display; delegate progress/stats to UI.
- Thin delegates for all module APIs so that the window object remains the single “context” passed to modules.

**Dependencies:** All modules above; no module depends on the main file except as “ctx” or by name for `setTimeout` (e.g. `DuplicateEntriesWindowSearch.runIntervalAction(DuplicateEntriesWindow)`).

---

## Change history

### Version 2.1.6
* Move `createSelectionList` into DuplicateEntriesWindowUI; main window delegates.
* Add ARCHITECTURE_AND_HISTORY.md (architecture and this change history).

### Version 2.1.5
* Cleanup: remove dead code from main file (pushIfNew, Array.prototype comment block, commented-out readFile).
* Move Set.prototype.isSuperset and Set.prototype.toString to duplicateEntriesWindowComparison.js.
* Move setContactLeftRight implementation to DuplicateEntriesWindowUI.
* Move enable, disable, show, hide, show_hack, make_visible, make_invisible to UI module; main file delegates.

### Version 2.1.4
* Refactor: extract enrichCardForComparison to DuplicateEntriesWindowCardValues.
* Extract search position stepping and runIntervalAction to duplicateEntriesWindowSearch.js.
* Move updateProgress, updateDeletedInfo, showFinishedStats to DuplicateEntriesWindowUI.
* Extract prefs load/save to duplicateEntriesWindowPrefs.js.
* Remove unresolved appmenu_taskPopup overlay from menuOverlay.xul (fix Overlays.jsm “Could not resolve” warning).

### Version 2.1.3
* Extract comparison table display to duplicateEntriesWindowDisplay.js (displayCardData, displayCardField, SetRelation, purgeAttributesTable, getCardFieldValues).

### Version 2.1.2
* Extract card value pipeline to duplicateEntriesWindowCardValues.js (getProperty, getPrunedProperty, getTransformedProperty, getAbstractedTransformedProperty, getSimplifiedCard, completeFirstLastDisplayName, propertySet).

### Version 1.1.1 (seen as 2.1.1 by Thunderbird 68+)
* Compatibility with Thunderbird 68+; slightly improve documentation.

### Version 1.1
* Improve progress calculation and display; clean up photo image handling.

### Version 1.0.9
* Fix bug introduced in version 1.0.8 regarding manual selection which side to keep.

### Version 1.0.8
* Make vertical size more flexible for small displays.
* Fix display layout for overlong list membership information etc.
* Add comparison of number of non-empty fields for determining card preferred for deletion.
* Improve calculation of character weight for determining card preferred for deletion.
* Correct comparison of selection fields determining which side has less information.
* Fix use of default value for ignoreFields; ignore by default also phone number types.
* Various implementation improvements for more efficiency and better readability.

### Version 1.0.7
* Add option for normalizing international call prefix.
* Fix horizontal layout issues, automatic width of contents.
* Improve name matching: allow substrings, stop removing singleton digits and letters.
* Mail user names like no-reply@... or no.service@... not anymore taken as first+last names.

### Version 1.0.6
* Various UI layout (width, vertical scrolling) and small documentation improvements.

### Version 1.0.5
* Correction of mistake in packaging version 1.0.4 that prevented it from running.

### Version 1.0.4
* Various small UI improvements: indication for card matching, layout, language, doc.

### Version 1.0.3
* Fixed syntax error in de-DE locale that led to obscure initialization error.
* Minor improvements of localization in the extension and of the entry in the TB add-ons list.

### Version 1.0.1 and 1.0.2
* Improved label of DCM menu entry for address book window.

### Version 1.0
* Major speedup in particular when searching for duplicates in large address books.
* Improved user guidance; new Tools menu entry with default address book selection.
* Various improvements of content matching and card comparison for equivalence.
* Cards may be excluded from being presented as matching by setting a different AIM name.
* Photos are compared for equality and are shown during manual inspection.
* Mailing list membership is taken into account for comparison and shown during inspection.
* During manual inspection, field-by-field (resp. set-by-set) comparison information is shown.
* Option to consider phone numbers with national prefix and with default country code equivalent.
* Option to customize list of ignored fields; output summary of different fields.
* Option to preserve entries of first address book when auto-deleting redundant entries.
* Options are saved in TB configuration/preferences at `extensions.DuplicateContactsManager.*`.

### Version 0.9.2
* Few critical bug fixes.
* Layout improvements.

### Version 0.9
* Can now edit contacts.
* Auto-removal of contacts which only contain some less fields.
* Can work across two address books.
* Option to collect all potential duplicates before interacting with the user.
* Progress bar and other usability improvements.

### Version 0.8
* Offer to delete exact duplicates without asking.
* Correctly search for exact duplicates.
* Upgrade to support Thunderbird 7.
