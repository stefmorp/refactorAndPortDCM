# Duplicate Contacts Manager — Architecture and Change History

For user-facing features, usage, and matching rules, see [README.md](README.md).

This document describes the **internal architecture** of the duplicate-finder window and the **change history** of the add-on. Script load order below is required for correct behaviour; do not reorder scripts in `duplicateEntriesWindow.xul` without checking module dependencies.

---

## Architecture

The add-on’s duplicate-finder window is implemented as a single XUL window (`duplicateEntriesWindow.xul`) and a main script (`duplicateEntriesWindow.js`) that orchestrates several JavaScript modules. The main script holds window state (cards, positions, preferences, DOM references) and delegates logic to the modules. Modules are loaded in a fixed order so that dependencies are available when each script runs.

### Script load order (in `duplicateEntriesWindow.xul`)

1. **duplicateEntriesWindowState.js**
2. **duplicateEntriesWindowStrings.js**
3. **duplicateEntriesWindowContacts.js**
4. **duplicateEntriesWindowFields.js**
5. **duplicateEntriesWindowPrefs.js**
6. **duplicateEntriesWindowMatching.js**
7. **duplicateEntriesWindowCardValues.js**
8. **duplicateEntriesWindowComparison.js**
9. **duplicateEntriesWindowWidgets.js**
10. **duplicateEntriesWindowUI.js**
11. **duplicateEntriesWindowDisplay.js**
12. **duplicateEntriesWindowSearch.js**
13. **duplicateEntriesWindow.js** (main window object)

---

### Module overview

#### 1. duplicateEntriesWindowState.js

**Role:** Default initial state for the duplicate-entries window (plain data, no logic).

**Exports:** `defaultState()` — returns a fresh object with initial property values (restart, abManager, vcards, BOOK_1/BOOK_2, positionSearch, preferences, phone prefixes, etc.). The main script builds `DuplicateEntriesWindow` by merging this with methods via `Object.assign(DuplicateEntriesWindowState.defaultState(), { ... })`.

**Responsibilities:** Keep the long list of initial property values out of `duplicateEntriesWindow.js` so the main file stays short and readable.

**Dependencies:** None (load first).

---

#### 2. duplicateEntriesWindowStrings.js

**Role:** Strings (i18n) adapter. Insulates the rest of the app from how localized strings are loaded (legacy: Services.strings / stringbundle; TB128: e.g. browser.i18n).

**Exports:** `createStringProvider(ctx)` — creates the string bundle for ctx (sets ctx.stringBundle) and returns a `getString(name)` function. Assign `ctx.getString = DuplicateEntriesWindowStrings.createStringProvider(ctx)` in main window init.

**Responsibilities:** Single place that touches ChromeUtils/Services or document stringbundle for i18n. For TB128, a second implementation can use browser.i18n without changing callers.

**Dependencies:** None (load after State).

---

#### 3. duplicateEntriesWindowContacts.js

**Role:** Read/write access to Thunderbird address books and contact cards. Insulates the rest of the app from the card type (legacy: nsIAbCard; TB128: can wrap a different type).

**Exports:** `getAbManager`, `getDirectory(uri)`, `getAddressBookList(abManager)`, `getSelectedDirectoryFromOpener()`, `getAllAbCards(directory, context)`, `getCardProperty`, `setCardProperty`, `saveCard(abDir, card)`, `deleteCard(abDir, card)`.

**Address book list:** `getAddressBookList(abManager)` returns `{ dirNames, URIs }` and insulates directory enumeration (legacy: hasMoreElements/getNext; TB128 may differ). `getSelectedDirectoryFromOpener()` returns the selected address book URI when the window is opened from the Address Book UI (legacy: window.opener.GetSelectedDirectory; TB128 may use messaging).

**Stable card interface:** Cards returned from `getAllAbCards` are wrapped with `getProperty(name, default)`, `setProperty(name, value)`, `getPropertyNames()`, `getRawCard()`. CardValues and Comparison use only this interface; save/delete use `getRawCard()` when the directory API requires the raw card. Legacy implementation wraps nsIAbCard; a TB128 implementation can wrap the new contact type without changing callers.

**Responsibilities:**
- Obtain the nsIAbManager and resolve directory URIs to nsIAbDirectory.
- Load all cards from one or two address books (return wrapped cards); optionally enrich each card for comparison (virtual properties) via the context’s `enrichCardForComparison`.
- Read/write individual card properties and persist cards (save/delete); accept wrapped or raw card for save/delete.

**Dependencies:** None (load after State). The main window passes itself as `context` so that card enrichment can use Fields/CardValues logic.

---

#### 4. duplicateEntriesWindowFields.js

**Role:** Central definition of address-book field lists and property-type predicates.

**Exports:** `addressBookFields`, `matchablesList`, `metaProperties`, `ignoredFieldsDefault`, and predicates: `isText`, `isFirstLastDisplayName`, `isEmail`, `isPhoneNumber`, `isSet`, `isSelection`, `isNumerical`, `defaultValue`, `charWeight`.

**Responsibilities:**
- Define the full list of address book properties and which are used for matching (`__Names`, `__Emails`, `__PhoneNumbers`).
- Provide type checks (text, email, phone, set, selection, numerical) and default values per property.
- Provide `charWeight` for “information content” used when preferring one card over another.

**Dependencies:** None. Other modules and the main window read these constants and functions.

---

#### 5. duplicateEntriesWindowPrefs.js

**Role:** Load and save user preferences for the duplicate-finder window (pref branch `extensions.DuplicateContactsManager.*`). Insulates callers from how prefs are stored (legacy: nsIPrefBranch; TB128: e.g. browser.storage).

**Exports:** `getPrefsBranch`, `loadPrefs(ctx)`, `applyPrefsToDOM(ctx)`, `readPrefsFromDOM(ctx)`, `savePrefs(ctx)`.

**Backend interface:** `ctx.prefsBranch` is a backend object with `getBoolPref(name)`, `getCharPref(name)`, `setBoolPref(name, value)`, `setCharPref(name, value)`. Legacy implementation wraps nsIPrefBranch; a WebExt backend can be added for TB128 without changing loadPrefs/savePrefs.

**Responsibilities:**
- Create the prefs backend (legacy or future WebExt); read prefs into the window context (autoremove, preserve first book, defer interactive, phone prefixes, ignored fields).
- Sync context to/from the options form (apply to DOM on init, read from DOM on Start, write back to prefs when saving).

**Dependencies:** Expects `ctx` to have Fields-derived data (`ignoredFieldsDefault`, `addressBookFields`, `consideredFields`, `isSet`, `matchablesList`) and to set `prefsBranch` from `getPrefsBranch()`.

---

#### 6. duplicateEntriesWindowMatching.js

**Role:** Normalization and matching logic for duplicate detection (names, emails, phones).

**Exports:** `simplifyText`, `pruneText`, `abstract`, `transformMiddlePrefixName`, `noMailsPhonesMatch`, `noNamesMatch`, `phonesMatch`, `mailsMatch`, `namesMatch`.

**Responsibilities:**
- Normalize text (prune, transform name order, abstract for comparison) using a config object that supplies type checks and phone-prefix settings.
- Decide whether two simplified cards match on names, emails, or phones; handle the “no names/emails/phones to match” case.

**Dependencies:** Uses a normalization config (from main window’s `getNormalizationConfig()`); no other add-on modules.

---

#### 7. duplicateEntriesWindowCardValues.js

**Role:** Card value pipeline — get display or comparison values from a card, and build simplified cards for matching.

**Exports:** `getProperty`, `getPrunedProperty`, `getTransformedProperty`, `getAbstractedTransformedProperty`, `completeFirstLastDisplayName`, `getSimplifiedCard`, `propertySet`, `enrichCardForComparison`.

**Responsibilities:**
- Get raw, pruned, transformed, or abstracted values for a property (used by comparison and display).
- Build simplified card objects (abstracted names, emails, phones) for the matching module.
- Enrich cards with virtual properties (`__NonEmptyFields`, `__CharWeight`, `__MailListNames`, `__Emails`, `__PhoneNumbers`) when loading from Contacts.

**Dependencies:** Uses Matching for `pruneText`, `abstract`, `transformMiddlePrefixName`. Expects `ctx` to have Fields predicates and `getNormalizationConfig`, `vcards`, `vcardsSimplified`, `consideredFields`.

---

#### 8. duplicateEntriesWindowWidgets.js

**Role:** DOM/Widget adapter. Insulates UI and Display from element type (legacy: XUL menulist, hbox, description, textbox, label, image, row; TB128: HTML select, div, span, input, label, img, tr).

**Exports:** `createSelectionList(cls, labels, values, selected)`, `createHbox()`, `createDescription()`, `createLabel()`, `createTextbox()`, `createImage()`, `createRow()`.

**Responsibilities:** Only this module calls `document.createElement` with tag names for dynamic UI. UI and Display use Widgets.* instead of raw createElement so that for TB128 a second implementation (HTML elements) can be added without changing UI/Display logic.

**Dependencies:** None (load after Comparison, before UI and Display).

---

#### 9. duplicateEntriesWindowComparison.js

**Role:** Compare two cards for “equivalent or less information” and compute preference for which to delete.

**Exports:** `propertyUnion`, `compareCards(c1, c2, context)`.

**Also defines:** `Set.prototype.isSuperset` and `Set.prototype.toString` (used by Display and by comparison internals).

**Responsibilities:**
- Union of property names from two cards; field-by-field comparison using context’s value pipeline and Fields predicates.
- Push differing properties into `context.nonequivalentProperties`; return comparison result and preference (which card to prefer for deletion).

**Dependencies:** Uses Matching’s `abstract` (via context’s getters). Expects context to expose `consideredFields`, `metaProperties`, type predicates, `defaultValue`, `getAbstractedTransformedProperty`, etc.

---

#### 10. duplicateEntriesWindowUI.js

**Role:** UI state transitions, progress/finished stats, low-level DOM helpers, and “which side to keep” selection.

**Exports:** `enable`, `disable`, `show`, `hide`, `show_hack`, `make_visible`, `make_invisible`, `createSelectionList`, `setContactLeftRight`, `showReadyState`, `showSearchingState`, `showDuplicatePairState`, `disableDuplicateActionButtons`, `showFinishedState`, `showComparisonTableHeader`, `hideComparisonTableHeader`, `updateDeletedInfo`, `updateProgress`, `showFinishedStats`.

**Responsibilities:**
- Show/hide/enable/disable elements by id; create XUL menulists (address book dropdowns, PreferMailFormat/boolean in comparison table).
- Switch between “ready”, “searching”, “duplicate pair”, and “finished” states; update progress meter and card-count labels; fill the finished-state panel with result statistics.
- Implement “keep left/right” (radio labels, header and cell classes) via `setContactLeftRight(ctx, side)`.

**Dependencies:** None (only DOM and context data). Other code calls these with the main window as `ctx` where needed.

---

#### 10. duplicateEntriesWindowDisplay.js

**Role:** Build and clear the comparison table (side-by-side fields, equivalence symbols, editable inputs).

**Exports:** `displayCardData`, `purgeAttributesTable`, `getCardFieldValues`.

**Responsibilities:**
- Fill the comparison table for a pair of cards: labels, matchable rows (names/emails/phones), per-field rows with left/right values and equivalence (≡ ≅ ⋦ ⋧ etc.), including PhotoURI and selection dropdowns.
- Clear the table (purge rows, hide header via UI module).
- Read back edited values from the table for a given side (“left” or “right”).

**Dependencies:** Uses UI’s `showComparisonTableHeader`, `hideComparisonTableHeader`; expects `ctx` to have Fields predicates, `getProperty`, `getAbstractedTransformedProperty`, `createSelectionList`, `setContactLeftRight`, `attributesTableRows`, `displayedFields`, `editableFields`, etc.

---

#### 12. duplicateEntriesWindowSearch.js

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

### Insulation adapters (outside duplicate-entries window)

These adapters keep the rest of the add-on independent of platform APIs that may change in Thunderbird 128+.

- **duplicateContactsManagerLauncher.js** — Opens the duplicate-finder window. Legacy: `window.open(chrome URL)`; TB128: e.g. `browser.windows.create(extension URL)`. Load before `duplicateContactsManager.js` in overlays (menuOverlay.xul, menuOverlayABook.xul, duplicateContactsManager.xul). Exports: `openDuplicatesWindow()`.

- **duplicateContactsManagerAddonPrefs.js** — Registers extension preference definitions (options dialog). Legacy: `Preferences.addAll` from preferencesBindings; TB128: may use storage or options_ui schema. Load after preferencesBindings.js and before Preferences.js in options.xul. Exports: `addAddonPrefs()`.

---

## Change history

### Version 2.2.0 (TB128 port)
* **Port to Thunderbird 128 (WebExtensions/MV3):** Single codebase with runtime detection; same JS modules run in legacy (XUL) and TB128 (HTML) contexts.
* **Manifest:** `manifest-tb128.json` for TB128 (MV3, background script, options_ui, permissions: addressBooks, storage, menus). Legacy build continues to use install.rdf + chrome.manifest + manifest.json with legacy type.
* **Background:** `background.js` registers Tools menu and opens duplicate-finder via Launcher; Launcher uses `browser.windows.create` in TB128.
* **Adapters (TB128 branches):** Strings → `browser.i18n.getMessage`; Prefs → `browser.storage.local`; Contacts → `messenger.addressBooks.list()`, `messenger.contacts.list/get/update/delete` with wrapped contact interface; Widgets → HTML elements (select, div, span, input, img, tr); AddonPrefs → no-op (options use storage).
* **Async:** init(), startSearch(), readAddressBooks(), updateAbCard(), deleteAbCard(), applyAndSearchNextDuplicate(), keepAndSearchNextDuplicate() are async; getAddressBookList() and getAllAbCards() return Promises (legacy: Promise.resolve(sync)); runIntervalAction() async to await deleteAbCard.
* **UI:** `duplicateEntriesWindow.html` hosts the duplicate-finder with same element IDs; `options.html` + `options-tb128.js` for TB128 options; `_locales/en/messages.json` for i18n; UI/Prefs compat for HTML (.textContent, .checked, button label).

### Version 2.1.7 (insulation for TB128)
* **Launcher adapter:** duplicateContactsManagerLauncher.js — open duplicate-finder window via `openDuplicatesWindow()`; duplicateContactsManager.js no longer calls `window.open` directly. Overlays load Launcher before duplicateContactsManager.js.
* **Address book list adapter:** DuplicateEntriesWindowContacts.getAddressBookList(abManager) and getSelectedDirectoryFromOpener(); main window init uses these instead of enumerating abManager.directories or calling window.opener.GetSelectedDirectory. Fix: selected-directory regex returns full URI (match[0]) instead of match[1].
* **Addon prefs adapter:** duplicateContactsManagerAddonPrefs.js — register option prefs via addAddonPrefs(); Preferences.js calls adapter instead of Preferences.addAll directly. options.xul loads AddonPrefs after preferencesBindings.js, before Preferences.js.

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
