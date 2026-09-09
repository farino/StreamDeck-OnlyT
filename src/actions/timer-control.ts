import streamDeck, {
	action,
	type KeyDownEvent,
} from "@elgato/streamdeck";

import { BaseOnlyTAction } from "./base-onlyt-action";
import {
	renderReady,
	renderRunning,
	renderRunningDynamic,
	renderRunningRadial,
	renderEndOfMeeting,
} from "../utils/svg-renderer";
import {
	type TimerSettings,
	type ParsedTimerState,
	DEFAULT_SETTINGS,
} from "../types";

/**
 * Full countdown Stream Deck action for OnlyT.
 * Displays the current talk name and colour-coded countdown (or draining
 * fill / radial ring, depending on `displayMode`), and toggles start/stop
 * on OnlyT when pressed. Sync is handled by `BaseOnlyTAction`'s 5 Hz poll.
 */
@action({ UUID: "com.farino.streamdeck-onlyt.timer-control" })
export class TimerControl extends BaseOnlyTAction<TimerSettings> {
	protected override mergeSettings(
		persisted: Partial<TimerSettings> | undefined,
	): TimerSettings {
		return { ...DEFAULT_SETTINGS, ...(persisted ?? {}) };
	}

	protected renderState(state: ParsedTimerState): string {
		if (state.isRunning) {
			if (this.settings.displayMode === "dynamic") {
				return renderRunningDynamic(
					state.currentTalkName,
					state.remainingSecs,
					state.targetSecs,
					this.settings.showTitle,
				);
			}
			if (this.settings.displayMode === "radial") {
				return renderRunningRadial(
					state.currentTalkName,
					state.remainingSecs,
					state.targetSecs,
				);
			}
			return renderRunning(
				state.currentTalkName,
				state.remainingSecs,
				state.closingSecs,
				this.settings.showTitle,
			);
		}

		if (state.currentTalkId === 0) {
			return renderEndOfMeeting();
		}

		return renderReady(
			state.currentTalkName,
			state.nextTalkDurationSecs,
			this.settings.showTitle,
		);
	}

	protected override async onKeyPress(
		state: ParsedTimerState,
		ev: KeyDownEvent<TimerSettings>,
	): Promise<void> {
		if (!this.client) return;

		streamDeck.logger.info(
			`TimerControl press: running=${state.isRunning}, talkId=${state.currentTalkId}`,
		);

		if (state.isRunning) {
			streamDeck.logger.info(`Stopping timer talkId=${state.currentTalkId}`);
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
			streamDeck.logger.info(`Starting timer talkId=${state.currentTalkId}`);
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
