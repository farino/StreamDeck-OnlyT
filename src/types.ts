/**
 * Visual mode used when rendering the key.
 *  - "default": transparent background, coloured text (original look).
 *  - "dynamic": coloured fill bar that drains as the timer counts down,
 *               transitioning green -> orange (halfway) -> red (overtime).
 *  - "radial":  coloured ring around the time that drains anti-clockwise,
 *               green -> orange (halfway) -> red ring that grows back
 *               anti-clockwise while in overtime.
 */
export type DisplayMode = "default" | "dynamic" | "radial";

import type { JsonObject } from "@elgato/utils";

/**
 * OnlyT connection (host / port / API code). Stored in Stream Deck GLOBAL
 * settings and shared by every action - never persisted per action instance.
 */
export type ConnectionSettings = {
	host: string;
	port: number;
	apiCode: string;
};

export const DEFAULT_CONNECTION: ConnectionSettings = {
	host: "127.0.0.1",
	port: 8096,
	apiCode: "",
};

/**
 * Per-action-instance settings persisted by Stream Deck for the
 * Timer Control action (full countdown display with mode + title toggle).
 */
export type TimerSettings = {
	displayMode: DisplayMode;
	/** Show the current talk name above the time (Default and Dynamic modes only). */
	showTitle: boolean;
	/** Show the green play triangle and "START" label when the timer is stopped. */
	showStartButton: boolean;
};

export const DEFAULT_SETTINGS: TimerSettings = {
	displayMode: "default",
	showTitle: true,
	showStartButton: true,
};

/**
 * Plugin-wide settings persisted via Stream Deck global settings.
 * `connectionMigrated` marks that legacy per-action values were merged in.
 */
export type PluginGlobalSettings = {
	host?: string;
	port?: number | string;
	apiCode?: string;
	connectionMigrated?: boolean;
	/** Stop the user resizing the OnlyT main window and keep it on `lockMonitor`. */
	lockMainWindow?: boolean;
	/** Windows display device name (e.g. `\\.\DISPLAY2`) the main window is kept on. */
	lockMonitor?: string;
};

/**
 * Actions with no instance options of their own (connection is global).
 */
export type EmptyActionSettings = JsonObject;
export type StartStopSettings = EmptyActionSettings;
export type ItemTitlesSettings = EmptyActionSettings;
export type AdjustTimeSettings = EmptyActionSettings;

/**
 * GET /api/v4/timers/ response shape from OnlyT.
 */
export type TimersResponse = {
	status: TimerStatus;
	timerInfo: TimerInfo[];
};

export type TimerStatus = {
	talkId: number;
	targetSeconds: number;
	isRunning: boolean;
	isPaused: boolean;
	timeElapsed: string;
	closingSecs: number;
};

export type TimerInfo = {
	talkId: number;
	talkTitle: string;
	meetingSectionNameInternal: string;
	meetingSectionNameLocalised: string;
	originalDurationSecs: number;
	modifiedDurationSecs: number | null;
	adaptedDurationSecs: number | null;
	actualDurationSecs: number;
	usesBell: boolean;
	completedTimeSecs: number | null;
	countUp: boolean;
	closingSecs: number;
	editable: boolean;
};

/**
 * POST /api/v4/timers/{talkId}/ or DELETE response shape.
 */
export type TimerCommandResponse = {
	talkId: number;
	command: "Start" | "Stop";
	success: boolean;
	currentStatus: TimerStatus;
};

/**
 * Parsed state used by the action for rendering and control.
 */
export type ParsedTimerState = {
	isRunning: boolean;
	isPaused: boolean;
	currentTalkId: number;
	currentTalkName: string;
	remainingSecs: number;
	targetSecs: number;
	closingSecs: number;
	isOvertime: boolean;
	nextTalkName: string;
	nextTalkDurationSecs: number;
};

/**
 * Parse a .NET TimeSpan string "HH:MM:SS.fff" into total seconds.
 */
export function parseTimeSpan(ts: string): number {
	const parts = ts.split(":");
	if (parts.length < 3) return 0;

	const hours = parseInt(parts[0], 10) || 0;
	const minutes = parseInt(parts[1], 10) || 0;
	const secParts = parts[2].split(".");
	const seconds = parseInt(secParts[0], 10) || 0;

	return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format seconds into MM:SS display string.
 */
export function formatTime(totalSecs: number): string {
	const abs = Math.abs(Math.floor(totalSecs));
	const m = Math.floor(abs / 60);
	const s = abs % 60;
	const sign = totalSecs < 0 ? "-" : "";
	return `${sign}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
