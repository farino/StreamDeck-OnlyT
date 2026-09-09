import streamDeck, {
	action,
	type KeyDownEvent,
} from "@elgato/streamdeck";

import { BaseOnlyTAction } from "./base-onlyt-action";
import {
	renderPlayGlyph,
	renderStopGlyph,
	renderEndOfMeeting,
} from "../utils/svg-renderer";
import {
	type StartStopSettings,
	type ParsedTimerState,
} from "../types";

/**
 * Minimalist Stream Deck action for OnlyT.
 * No talk name, no countdown - just a neutral white play glyph when the
 * timer is stopped and a stop glyph when it's running. Pressing the button
 * toggles start/stop against OnlyT exactly like the full Timer Control
 * action, so operators can dedicate a key purely to "go / halt".
 */
@action({ UUID: "com.farino.streamdeck-onlyt.start-stop" })
export class StartStopOnly extends BaseOnlyTAction<StartStopSettings> {
	protected renderState(state: ParsedTimerState): string {
		if (state.isRunning) {
			return renderStopGlyph();
		}
		if (state.currentTalkId === 0) {
			return renderEndOfMeeting();
		}
		return renderPlayGlyph();
	}

	protected override async onKeyPress(
		state: ParsedTimerState,
		ev: KeyDownEvent<StartStopSettings>,
	): Promise<void> {
		if (!this.client) return;

		streamDeck.logger.info(
			`StartStopOnly press: running=${state.isRunning}, talkId=${state.currentTalkId}`,
		);

		if (state.isRunning) {
			const result = await this.client.stopTimer(state.currentTalkId);
			streamDeck.logger.info(`Stop result: ${JSON.stringify(result)}`);
			if (!result?.success) {
				await ev.action.showAlert();
				return;
			}
		} else {
			if (state.currentTalkId === 0) {
				streamDeck.logger.warn("No talk to start (end of meeting)");
				await ev.action.showAlert();
				return;
			}
			const result = await this.client.startTimer(state.currentTalkId);
			streamDeck.logger.info(`Start result: ${JSON.stringify(result)}`);
			if (!result?.success) {
				await ev.action.showAlert();
				return;
			}
		}

		await new Promise((resolve) => setTimeout(resolve, 300));
		await this.refresh();
	}
}
