import streamDeck, {
	action,
	type KeyDownEvent,
} from "@elgato/streamdeck";

import { BaseOnlyTAction } from "./base-onlyt-action";
import {
	renderSubtractMinuteGlyph,
	renderEndOfMeeting,
} from "../utils/svg-renderer";
import {
	type AdjustTimeSettings,
	type ParsedTimerState,
} from "../types";

const DELTA_SECS = -60;

/**
 * Stream Deck action that subtracts one minute from the current OnlyT talk.
 * Calls POST /api/v4/timers/{talkId}/duration with { deltaSeconds: -60 }.
 * The tile always shows a "-1" glyph so the operator knows what the
 * button does at a glance.
 */
@action({ UUID: "com.farino.streamdeck-onlyt.subtract-minute" })
export class SubtractMinute extends BaseOnlyTAction<AdjustTimeSettings> {
	protected renderState(state: ParsedTimerState): string {
		if (state.currentTalkId === 0) {
			return renderEndOfMeeting();
		}
		return renderSubtractMinuteGlyph();
	}

	protected override async onKeyPress(
		state: ParsedTimerState,
		ev: KeyDownEvent<AdjustTimeSettings>,
	): Promise<void> {
		if (!this.client) return;

		if (state.currentTalkId === 0) {
			streamDeck.logger.warn("No talk to adjust (end of meeting)");
			await ev.action.showAlert();
			return;
		}

		streamDeck.logger.info(
			`SubtractMinute press: talkId=${state.currentTalkId}, delta=${DELTA_SECS}s`,
		);

		const result = await this.client.changeDuration(state.currentTalkId, DELTA_SECS);
		if (!result) {
			await ev.action.showAlert();
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, 300));
		await this.refresh();
	}
}
