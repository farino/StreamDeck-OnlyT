import streamDeck, {
	SingletonAction,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
	type DidReceiveSettingsEvent,
} from "@elgato/streamdeck";

import { OnlyTClient } from "../services/onlyt-client";
import { renderOffline, renderConnecting } from "../utils/svg-renderer";
// #region agent log
import { debugLog } from "../utils/debug-logger";
// #endregion
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
 * Multiple visible instances of the same action are supported: each keeps
 * its own settings (e.g. display mode) and is rendered independently.
 * Connection settings from the most recently configured instance drive the
 * shared OnlyT client.
 *
 * Subclasses provide two things:
 *  - `renderState(state, settings)` - returns the SVG string for the current
 *    parsed state using that instance's settings.
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
	/** Per-instance last rendered SVG, keyed by action context id. */
	protected lastRenderedSvgById = new Map<string, string>();
	/** Per-instance settings, keyed by action context id. */
	protected instanceSettings = new Map<string, S>();
	/** Connection settings used by the shared OnlyT client. */
	protected settings: S = { ...(DEFAULT_CONNECTION as S) };

	override async onWillAppear(ev: WillAppearEvent<S>): Promise<void> {
		streamDeck.logger.info(`${this.constructor.name}.onWillAppear fired`);

		const settings = this.mergeSettings(ev.payload.settings);
		this.instanceSettings.set(ev.action.id, settings);
		this.applyConnectionSettings(settings);
		this.lastRenderedSvgById.delete(ev.action.id);

		await ev.action.setImage(`data:image/svg+xml,${encodeURIComponent(renderConnecting())}`);
		await ev.action.setTitle("");

		if (!this.pollTimer) {
			this.pollTimer = setInterval(() => {
				this.pollAll().catch((err) => {
					streamDeck.logger.error(`Poll error: ${err}`);
				});
			}, POLL_INTERVAL_MS);
		}

		await this.pollAll();
	}

	override async onWillDisappear(ev: WillDisappearEvent<S>): Promise<void> {
		streamDeck.logger.info(`${this.constructor.name}.onWillDisappear fired`);
		this.instanceSettings.delete(ev.action.id);
		this.lastRenderedSvgById.delete(ev.action.id);

		// Store already removed this action before our handler runs; stop
		// polling only when no instances of this action remain visible.
		if ([...this.actions].length === 0) {
			this.stopPolling();
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): Promise<void> {
		const settings = this.mergeSettings(ev.payload.settings);
		streamDeck.logger.info(
			`${this.constructor.name} settings updated: host=${settings.host}, port=${settings.port}`,
		);

		this.instanceSettings.set(ev.action.id, settings);
		this.applyConnectionSettings(settings);
		this.lastRenderedSvgById.delete(ev.action.id);

		await this.refresh();
	}

	override async onKeyDown(ev: KeyDownEvent<S>): Promise<void> {
		debugLog("base-onlyt-action.ts:onKeyDown", "KEYPRESS", "onKeyDown fired", {
			action: this.constructor.name,
			hasClient: !!this.client,
			isOnline: this.isOnline,
			hasCachedState: !!this.cachedState,
		});

		if (!this.client) {
			debugLog("base-onlyt-action.ts:onKeyDown", "ALERT", "no client", {});
			await ev.action.showAlert();
			return;
		}

		if (!this.isOnline || !this.cachedState) {
			debugLog("base-onlyt-action.ts:onKeyDown", "RETRY", "no state, doing fresh poll", {
				isOnline: this.isOnline,
				hasCachedState: !!this.cachedState,
			});
			await this.refresh();
		}

		if (!this.isOnline || !this.cachedState) {
			debugLog("base-onlyt-action.ts:onKeyDown", "ALERT", "still no state after retry", {
				isOnline: this.isOnline,
				hasCachedState: !!this.cachedState,
			});
			await ev.action.showAlert();
			return;
		}

		try {
			await this.onKeyPress(this.cachedState, ev);
		} catch (err) {
			const e = err as Error;
			debugLog("base-onlyt-action.ts:onKeyDown", "ALERT", "exception in onKeyPress", {
				action: this.constructor.name,
				errName: e?.name,
				errMessage: e?.message,
			});
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
	 * Return the SVG to display for the given parsed state and this
	 * instance's settings. Called after every successful poll when the
	 * SVG differs from the last frame for that instance.
	 */
	protected abstract renderState(state: ParsedTimerState, settings: S): string;

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

	private applyConnectionSettings(settings: S): void {
		this.settings = settings;
		if (this.client) {
			this.client.updateConnection(settings.host, settings.port, settings.apiCode);
		} else {
			this.client = new OnlyTClient(settings.host, settings.port, settings.apiCode);
		}
	}

	private async pollAll(): Promise<void> {
		if (!this.client) return;

		const data = await this.client.getTimers();

		if (!data) {
			if (this.isOnline) {
				streamDeck.logger.warn("Lost connection to OnlyT");
			}
			// #region agent log
			// Confirms the flashing pattern: which polls returned null (offline) vs
			// data. Combined with the request-level logs we can see whether the plugin
			// truly alternates success/failure or whether the render logic is at fault.
			debugLog("base-onlyt-action.ts:pollAll", "H1_H2_H3_H4", "poll -> offline (null data)", {
				action: this.constructor.name,
				wasOnline: this.isOnline,
			});
			// #endregion
			this.isOnline = false;
			this.cachedState = null;
			await this.updateAllActions(null);
			return;
		}

		if (!this.isOnline) {
			streamDeck.logger.info("Connected to OnlyT");
		}
		this.isOnline = true;

		// #region agent log
		// H5: if parseTimerData throws on unexpected data shape, we want to know
		// what the raw payload looked like before the exception. Wrap the parse
		// in try/catch and log both success and failure with a compact payload
		// preview.
		let parsed: ParsedTimerState;
		try {
			parsed = this.parseTimerData(data);
			debugLog("base-onlyt-action.ts:pollAll", "H1_H2_H3_H4", "poll -> data ok", {
				action: this.constructor.name,
				talkId: parsed.currentTalkId,
				isRunning: parsed.isRunning,
				timerInfoCount: data.timerInfo?.length ?? 0,
			});
		} catch (err) {
			const e = err as Error;
			debugLog("base-onlyt-action.ts:pollAll", "H5", "parseTimerData threw", {
				action: this.constructor.name,
				errName: e?.name,
				errMessage: e?.message,
				statusKeys: Object.keys(data?.status ?? {}),
				timerInfoCount: data?.timerInfo?.length ?? 0,
				timerInfoFirstKeys: data?.timerInfo?.[0] ? Object.keys(data.timerInfo[0]) : [],
			});
			this.isOnline = false;
			this.cachedState = null;
			await this.updateAllActions(null);
			return;
		}
		// #endregion

		this.cachedState = parsed;
		await this.updateAllActions(parsed);
	}

	/**
	 * Push a fresh image to every visible instance. When `state` is null the
	 * offline tile is shown; otherwise each instance is rendered with its
	 * own settings so display modes can differ per key.
	 */
	private async updateAllActions(state: ParsedTimerState | null): Promise<void> {
		for (const a of this.actions) {
			const settings = this.instanceSettings.get(a.id) ?? this.mergeSettings(undefined);
			const svg = state === null ? renderOffline() : this.renderState(state, settings);

			if (svg === this.lastRenderedSvgById.get(a.id)) {
				continue;
			}
			this.lastRenderedSvgById.set(a.id, svg);

			const encoded = `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
