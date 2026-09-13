import streamDeck, {
	action,
	SingletonAction,
	type WillAppearEvent,
	type KeyDownEvent,
} from "@elgato/streamdeck";

import { renderJWMeetingsGlyph } from "../utils/svg-renderer";
import { navigateJWLibrary } from "../utils/jw-navigator";

/**
 * Stream Deck action that brings JW Library to the foreground and
 * navigates to the "Meetings" section (via Home first) using Windows
 * UI Automation. Extends SingletonAction directly — no OnlyT connection.
 */
@action({ UUID: "com.farino.streamdeck-onlyt.jw-meetings" })
export class JWMeetings extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		const svg = renderJWMeetingsGlyph();
		await ev.action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
		await ev.action.setTitle("");
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		streamDeck.logger.info("JWMeetings key pressed");

		try {
			const result = await navigateJWLibrary("Meetings");

			if (result !== "OK") {
				streamDeck.logger.warn(`JWMeetings navigation failed: ${result}`);
				await ev.action.showAlert();
			}
		} catch (err) {
			streamDeck.logger.error(`JWMeetings error: ${err}`);
			await ev.action.showAlert();
		}
	}
}
