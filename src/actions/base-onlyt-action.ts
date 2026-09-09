import streamDeck, {
	SingletonAction,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
	type DidReceiveSettingsEvent,
} from "@elgato/streamdeck";

import { OnlyTClient } from "../services/onlyt-client";
import { renderOffline, renderConnecting } from "../utils/svg-renderer";
import {
	type ConnectionSettings,
	type TimersResponse,
	type ParsedTimerState,
	DEFAULT_CONNECTION,
	parseTimeSpan,
} from "../types";

const POLL_INTERVAL_MS = 200;

/**
 * Shared base for every action in this plugin. Owns the OnlyT connection,
 * the 5 Hz poll loop, offline detection, state parsing, and the "only push
 * a new image when the rendered SVG actually changed" throttle.
 *
 * Subclasses provide two things:
 *  - `renderState(state)` - returns the SVG string for the current parsed
 *    state (each action can render however it likes).
 *  - `onKeyPress(state, ev)` - optional; called on button press with the
 *    latest parsed state and the raw event. Default is a no-op so
 *    display-only actions (e.g. "Item Titles Only") don't have to override.
 *
 * `ConnectionSettings` is the minimum shape a subclass's settings type must
 * satisfy; subclasses are free to extend it with additional fields (e.g.
 * `TimerSettings` adds `displayMode` and `showTitle`).
 */
export abstract class BaseOnlyTAction<
	S extends ConnectionSettings,
> extends SingletonAction<S> {
	protected client: OnlyTClient | null = null;
	protected pollTimer: NodeJS.Timeout | null = null;
	protected cachedState: ParsedTimerState | null = null;
	protected isOnline = false;
	protected lastRenderedSvg = "";
	protected settings: S = { ...(DEFAULT_CONNECTION as S) };

	override async onWillAppear(ev: WillAppearEvent<S>): Promise<void> {
		streamDeck.logger.info(`${this.constructor.name}.onWillAppear fired`);

		const settings = this.mergeSettings(ev.payload.settings);
		this.settings = settings;
		this.client = new OnlyTClient(settings.host, settings.port, settings.apiCode);
		this.cachedState = null;
		this.isOnline = false;
		this.lastRenderedSvg = "";

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

	override async onWillDisappear(_ev: WillDisappearEvent<S>): Promise<void> {
		streamDeck.logger.info(`${this.constructor.name}.onWillDisappear fired`);
		this.stopPolling();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): Promise<void> {
		const settings = this.mergeSettings(ev.payload.settings);
		streamDeck.logger.info(
			`${this.constructor.name} settings updated: host=${settings.host}, port=${settings.port}`,
		);

		this.settings = settings;

		if (this.client) {
			this.client.updateConnection(settings.host, settings.port, settings.apiCode);
		} else {
			this.client = new OnlyTClient(settings.host, settings.port, settings.apiCode);
		}

		this.cachedState = null;
		this.isOnline = false;
		this.lastRenderedSvg = "";
	}

	override async onKeyDown(ev: KeyDownEvent<S>): Promise<void> {
		streamDeck.logger.info(`${this.constructor.name}.onKeyDown fired`);

		if (!this.client) {
			streamDeck.logger.warn("No client configured");
			await ev.action.showAlert();
			return;
		}

		if (!this.isOnline || !this.cachedState) {
			streamDeck.logger.warn(
				`Cannot act: online=${this.isOnline}, hasState=${!!this.cachedState}`,
			);
			await ev.action.showAlert();
			return;
		}

		try {
			await this.onKeyPress(this.cachedState, ev);
		} catch (err) {
			streamDeck.logger.error(`onKeyDown error: ${err}`);
			await ev.action.showAlert();
		}
	}

	/**
	 * Merge persisted settings on top of the shared connection defaults.
	 * Subclasses that need to layer their own defaults can override this.
	 */
	protected mergeSettings(persisted: Partial<S> | undefined): S {
		return { ...(DEFAULT_CONNECTION as S), ...(persisted ?? {}) } as S;
	}

	/**
	 * Return the SVG to display for the given parsed state. Called after
	 * every successful poll and when the SVG differs from the last frame.
	 */
	protected abstract renderState(state: ParsedTimerState): string;

	/**
	 * Handle a button press with the latest parsed state. Default is a
	 * no-op so display-only actions (e.g. Item Titles Only) don't need
	 * to override anything.
	 */
	protected async onKeyPress(
		_state: ParsedTimerState,
		_ev: KeyDownEvent<S>,
	): Promise<void> {
		// no-op by default
	}

	/**
	 * Trigger an immediate poll and re-render, e.g. after a start/stop call
	 * so the button reflects the new state without waiting for the next tick.
	 */
	protected async refresh(): Promise<void> {
		await this.pollAll();
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
		// Skip re-render if the displayed content has not changed since last poll.
		// This keeps the Stream Deck update rate to ~1 Hz (once per displayed
		// second) even though we poll OnlyT at 5 Hz for tight sync.
		if (svg === this.lastRenderedSvg) {
			return;
		}
		this.lastRenderedSvg = svg;

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

	private stopPolling(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}
}
