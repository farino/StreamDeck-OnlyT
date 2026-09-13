import streamDeck, {
	action,
	SingletonAction,
	type WillAppearEvent,
	type KeyDownEvent,
} from "@elgato/streamdeck";

import { renderJWStudyGlyph } from "../utils/svg-renderer";
import { navigateJWLibrary } from "../utils/jw-navigator";

/**
 * Stream Deck action that brings JW Library to the foreground and
 * navigates to the "Personal Study" section using Windows UI Automation.
 * Extends SingletonAction directly — no OnlyT connection needed.
 */
@action({ UUID: "com.farino.streamdeck-onlyt.jw-study" })
export class JWStudy extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		const svg = renderJWStudyGlyph();
		await ev.action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
		await ev.action.setTitle("");
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		streamDeck.logger.info("JWStudy key pressed");

		try {
			const result = await navigateJWLibrary("PersonalStudy");

			if (result !== "OK") {
				streamDeck.logger.warn(`JWStudy navigation failed: ${result}`);
				await ev.action.showAlert();
			}
		} catch (err) {
			streamDeck.logger.error(`JWStudy error: ${err}`);
			await ev.action.showAlert();
		}
	}
}
