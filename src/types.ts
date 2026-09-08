/**
 * Per-action-instance settings persisted by Stream Deck.
 */
export type TimerSettings = {
	host: string;
	port: number;
	apiCode: string;
};

export const DEFAULT_SETTINGS: TimerSettings = {
	host: "localhost",
	port: 8096,
	apiCode: "",
};

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
