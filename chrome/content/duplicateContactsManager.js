// Opens duplicate-finder window via Launcher adapter (insulates window.open for TB128 port).
var DuplicateContactsManager = {
	manageDuplicatesIsRunning: false,
	menuButtonAction: function() {
		this.manageDuplicates();
	},
	manageDuplicates: function() {
		this.manageDuplicatesIsRunning = true;
		DuplicateContactsManagerLauncher.openDuplicatesWindow();
	}
};
