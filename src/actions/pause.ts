import streamDeck, {
	action,
	type KeyDownEvent,
} from "@elgato/streamdeck";

import { BaseOnlyTAction } from "./base-onlyt-action";
import {
	renderPauseGlyph,
	renderResumeGlyph,
	renderEndOfMeeting,
} from "../utils/svg-renderer";
import {
	type ConnectionSettings,
	type ParsedTimerState,
} from "../types";

/**
 * Stream Deck action that pauses / resumes the current OnlyT talk.
 *
 * Resume works today via the existing start API (OnlyT treats Start as
 * resume when the talk is already paused). Pause itself is not exposed
 * by OnlyT's REST API yet (UI-only in 2.5.x), so a press while running
 * shows an alert until OnlyT adds a pause endpoint.
 */
@action({ UUID: "com.farino.streamdeck-onlyt.pause" })
export class Pause extends BaseOnlyTAction<ConnectionSettings> {
	protected renderState(
		state: ParsedTimerState,
		_settings: ConnectionSettings,
	): string {
		if (state.currentTalkId === 0) {
			return renderEndOfMeeting();
		}
		if (state.isPaused) {
			return renderResumeGlyph();
		}
		return renderPauseGlyph();
	}

	protected override async onKeyPress(
		state: ParsedTimerState,
		ev: KeyDownEvent<ConnectionSettings>,
	): Promise<void> {
		if (!this.client) return;

		if (state.currentTalkId === 0) {
			streamDeck.logger.warn("No talk to pause (end of meeting)");
			await ev.action.showAlert();
			return;
		}

		// Already paused — resume via the start endpoint (OnlyT supports this).
		if (state.isPaused) {
			streamDeck.logger.info(`Pause press: resume talkId=${state.currentTalkId}`);
			const result = await this.client.startTimer(state.currentTalkId);
			streamDeck.logger.info(`Resume result: ${JSON.stringify(result)}`);
			if (result === null || result.success === false) {
				await ev.action.showAlert();
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 300));
			await this.refresh();
			return;
		}

		if (!state.isRunning) {
			streamDeck.logger.warn("Timer is not running — nothing to pause");
			await ev.action.showAlert();
			return;
		}

		// OnlyT 2.5.x exposes isPaused in status but has no pause/control
		// API endpoint. Fail visibly until OnlyT adds one.
		streamDeck.logger.warn(
			"Pause requested but OnlyT API has no pause endpoint (UI-only feature)",
		);
		await ev.action.showAlert();
	}
}
