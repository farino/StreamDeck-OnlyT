import streamDeck from "@elgato/streamdeck";

import { TimerControl } from "./actions/timer-control";
import { StartStopOnly } from "./actions/start-stop-only";
import { ItemTitles } from "./actions/item-titles";
import { AddMinute } from "./actions/add-minute";
import { SubtractMinute } from "./actions/subtract-minute";
import { Bell } from "./actions/bell";
import {
	applyGlobalSettingsPayload,
	loadGlobalConnectionSettings,
} from "./services/global-connection";
import {
	applyWindowLockSettings,
	loadWindowLockFromGlobalSettings,
	registerWindowLockUi,
} from "./services/window-lock";

// Host / port / API code are plugin-wide (global settings). Any property
// inspector change arrives here and updates every action at once.
streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
	const settings = ev.settings as Record<string, unknown>;
	streamDeck.logger.info(
		`Global settings received: host=${settings.host}, port=${settings.port}`,
	);
	applyGlobalSettingsPayload(settings);
	applyWindowLockSettings(settings);
});

streamDeck.actions.registerAction(new TimerControl());
streamDeck.actions.registerAction(new StartStopOnly());
streamDeck.actions.registerAction(new ItemTitles());
streamDeck.actions.registerAction(new AddMinute());
streamDeck.actions.registerAction(new SubtractMinute());
streamDeck.actions.registerAction(new Bell());
streamDeck.connect();

registerWindowLockUi();
void loadGlobalConnectionSettings();
void loadWindowLockFromGlobalSettings();
