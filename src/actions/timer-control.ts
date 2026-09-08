import streamDeck, {
	action,
	SingletonAction,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
	type DidReceiveSettingsEvent,
} from "@elgato/streamdeck";

import { OnlyTClient } from "../services/onlyt-client";
import {
	renderReady,
	renderRunning,
	renderOffline,
	renderConnecting,
	renderEndOfMeeting,
} from "../utils/svg-renderer";
import {
	type TimerSettings,
	type TimersResponse,
	type ParsedTimerState,
	DEFAULT_SETTINGS,
	parseTimeSpan,
} from "../types";

const POLL_INTERVAL_MS = 1000;

/**
 * Stream Deck action that controls the OnlyT meeting timer.
 * Polls the OnlyT REST API and renders dynamic SVG on the key.
 */
@action({ UUID: "com.farino.streamdeck-onlyt.timer-control" })
export class TimerControl extends SingletonAction<TimerSettings> {
	private client: OnlyTClient | null = null;
	private pollTimer: NodeJS.Timeout | null = null;
	private cachedState: ParsedTimerState | null = null;
	private isOnline = false;

	override async onWillAppear(ev: WillAppearEvent<TimerSettings>): Promise<void> {
		streamDeck.logger.info("onWillAppear fired");

		const settings = { ...DEFAULT_SETTINGS, ...ev.payload.settings };
		streamDeck.logger.info(`Settings: host=${settings.host}, port=${settings.port}`);

		this.client = new OnlyTClient(settings.host, settings.port, settings.apiCode);
		this.cachedState = null;
		this.isOnline = false;

		await ev.action.setImage(`data:image/svg+xml,${encodeURIComponent(renderConnecting())}`);
		await ev.action.setTitle("");

		this.stopPolling();
		this.pollTimer = setInterval(() => {
			this.pollAll().catch((err) => {
				streamDeck.logger.error(`Poll error: ${err}`);
			});
		}, POLL_INTERVAL_MS);

		await this.pollAll();
	}

	override async onWillDisappear(_ev: WillDisappearEvent<TimerSettings>): Promise<void> {
		streamDeck.logger.info("onWillDisappear fired");
		this.stopPolling();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TimerSettings>): Promise<void> {
		const settings = { ...DEFAULT_SETTINGS, ...ev.payload.settings };
		streamDeck.logger.info(`Settings updated: host=${settings.host}, port=${settings.port}`);

		if (this.client) {
			this.client.updateConnection(settings.host, settings.port, settings.apiCode);
		} else {
			this.client = new OnlyTClient(settings.host, settings.port, settings.apiCode);
		}

		this.cachedState = null;
		this.isOnline = false;
	}

	override async onKeyDown(ev: KeyDownEvent<TimerSettings>): Promise<void> {
		streamDeck.logger.info("onKeyDown fired");

		if (!this.client) {
			streamDeck.logger.warn("No client configured");
			await ev.action.showAlert();
			return;
		}

		if (!this.isOnline || !this.cachedState) {
			streamDeck.logger.warn(`Cannot act: online=${this.isOnline}, hasState=${!!this.cachedState}`);
			await ev.action.showAlert();
			return;
		}

		const state = this.cachedState;
		streamDeck.logger.info(`Current state: running=${state.isRunning}, talkId=${state.currentTalkId}`);

		try {
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
			await this.pollAll();
		} catch (err) {
			streamDeck.logger.error(`onKeyDown error: ${err}`);
			await ev.action.showAlert();
		}
	}

	private async pollAll(): Promise<void> {
		if (!this.client) return;

		const data = await this.client.getTimers();

		if (!data) {
			if (this.isOnline) {
				streamDeck.logger.warn("Lost connection to OnlyT");
			}
			this.isOnline = false;
			this.cachedState = null;
			await this.updateAllActions(renderOffline());
			return;
		}

		if (!this.isOnline) {
			streamDeck.logger.info("Connected to OnlyT");
		}
		this.isOnline = true;

		const parsed = this.parseTimerData(data);
		this.cachedState = parsed;

		const svg = this.renderState(parsed);
		await this.updateAllActions(svg);
	}

	private async updateAllActions(svg: string): Promise<void> {
		const encoded = `data:image/svg+xml,${encodeURIComponent(svg)}`;
		for (const a of this.actions) {
			await a.setImage(encoded);
			await a.setTitle("");
		}
	}

	private parseTimerData(data: TimersResponse): ParsedTimerState {
		const { status, timerInfo } = data;

		const currentTalk = timerInfo.find((t) => t.talkId === status.talkId);
		const currentTalkName = currentTalk?.talkTitle ?? "";
		const currentTalkDuration = currentTalk?.actualDurationSecs ?? status.targetSeconds;
		const closingSecs = currentTalk?.closingSecs ?? status.closingSecs;

		const elapsedSecs = parseTimeSpan(status.timeElapsed);
		const remainingSecs = status.targetSeconds - elapsedSecs;
		const isOvertime = remainingSecs < 0;

		return {
			isRunning: status.isRunning,
			isPaused: status.isPaused,
			currentTalkId: status.talkId,
			currentTalkName,
			remainingSecs,
			targetSecs: status.targetSeconds,
			closingSecs,
			isOvertime,
			nextTalkName: currentTalkName,
			nextTalkDurationSecs: currentTalkDuration,
		};
	}

	private renderState(state: ParsedTimerState): string {
		if (state.isRunning) {
			return renderRunning(
				state.currentTalkName,
				state.remainingSecs,
				state.closingSecs,
			);
		}

		if (state.currentTalkId === 0) {
			return renderEndOfMeeting();
		}

		return renderReady(state.currentTalkName, state.nextTalkDurationSecs);
	}

	private stopPolling(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}
}
