import { formatTime } from "../types";

const SIZE = 144;

const COLOURS = {
	textPrimary: "#ffffff",
	textSecondary: "#b2bec3",
	playIcon: "#00b894",
	timeGreen: "#00d967",
	timeOrange: "#f5a623",
	timeRed: "#ff4d4d",
};

const MAX_CHARS_SINGLE_LINE = 12;
const MAX_CHARS_PER_LINE = 14;

/**
 * Escape XML special characters for safe SVG embedding.
 */
function escXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Wrap SVG content in the root element (no background - transparent).
 */
function wrapSvg(content: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${content}</svg>`;
}

/**
 * Split a title into up to 2 lines, breaking at word boundaries when possible.
 * Falls back to character split if a single word is too long.
 */
function splitTitle(text: string): string[] {
	if (!text) return [""];
	if (text.length <= MAX_CHARS_SINGLE_LINE) return [text];

	const words = text.split(/\s+/);

	// Try word-boundary split into two lines
	if (words.length > 1) {
		let line1 = "";
		let line2 = "";
		for (const w of words) {
			if (!line1) {
				line1 = w;
			} else if ((line1 + " " + w).length <= MAX_CHARS_PER_LINE) {
				line1 += " " + w;
			} else {
				line2 = line2 ? line2 + " " + w : w;
			}
		}
		if (line2.length > MAX_CHARS_PER_LINE) {
			line2 = line2.substring(0, MAX_CHARS_PER_LINE - 1) + "\u2026";
		}
		return line2 ? [line1, line2] : [line1];
	}

	// Single long word - hard split
	const line1 = text.substring(0, MAX_CHARS_PER_LINE);
	let line2 = text.substring(MAX_CHARS_PER_LINE);
	if (line2.length > MAX_CHARS_PER_LINE) {
		line2 = line2.substring(0, MAX_CHARS_PER_LINE - 1) + "\u2026";
	}
	return [line1, line2];
}

/**
 * Render title as one or two lines, returning SVG text elements.
 * @param fontSize - font size in px
 * @param colour - text colour
 * @param centreY - y coordinate for single line, or centre of the two lines
 */
function renderTitle(
	text: string,
	fontSize: number,
	colour: string,
	centreY: number,
): string {
	const lines = splitTitle(text);
	const lineHeight = fontSize + 2;

	if (lines.length === 1) {
		return `<text x="72" y="${centreY}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${colour}">${escXml(lines[0])}</text>`;
	}

	const y1 = centreY - lineHeight / 2 + fontSize / 3;
	const y2 = y1 + lineHeight;

	return (
		`<text x="72" y="${y1}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${colour}">${escXml(lines[0])}</text>` +
		`<text x="72" y="${y2}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${colour}">${escXml(lines[1])}</text>`
	);
}

/**
 * Render the "ready / stopped" state.
 * Shows the current talk name, its predefined duration, and a play triangle.
 */
export function renderReady(talkName: string, durationSecs: number): string {
	const name = talkName || "Ready";
	const time = formatTime(durationSecs);

	return wrapSvg(`
		${renderTitle(name, 16, COLOURS.textPrimary, 28)}
		<text x="72" y="88" text-anchor="middle" font-family="Arial,sans-serif"
			font-size="38" font-weight="bold" fill="${COLOURS.textPrimary}">${time}</text>
		<polygon points="56,108 56,132 80,120" fill="${COLOURS.playIcon}"/>
		<text x="90" y="125" text-anchor="start" font-family="Arial,sans-serif"
			font-size="13" fill="${COLOURS.textSecondary}">START</text>
	`);
}

/**
 * Render the "running" state with transparent background and colour-coded time.
 * Green = normal, orange = closing, red = overtime.
 * The RUNNING label pulses in the same colour as the time.
 */
export function renderRunning(
	talkName: string,
	remainingSecs: number,
	closingSecs: number,
): string {
	const isOvertime = remainingSecs < 0;
	const isClosing = !isOvertime && remainingSecs <= closingSecs;

	let colour: string;
	if (isOvertime) {
		colour = COLOURS.timeRed;
	} else if (isClosing) {
		colour = COLOURS.timeOrange;
	} else {
		colour = COLOURS.timeGreen;
	}

	const name = talkName || "Running";
	const displayTime = isOvertime
		? `+${formatTime(Math.abs(remainingSecs))}`
		: formatTime(remainingSecs);

	return wrapSvg(`
		${renderTitle(name, 16, COLOURS.textPrimary, 28)}
		<text x="72" y="92" text-anchor="middle" font-family="Arial,sans-serif"
			font-size="40" font-weight="bold" fill="${colour}">${displayTime}</text>
		<text x="72" y="126" text-anchor="middle" font-family="Arial,sans-serif"
			font-size="14" font-weight="bold" fill="${colour}">
			RUNNING
			<animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/>
		</text>
	`);
}

/**
 * Render the "offline" state when OnlyT is unreachable.
 * Shows a warning triangle above a two-line "OnlyT / Offline" cascade.
 */
export function renderOffline(): string {
	return wrapSvg(`
		<path d="M 72 12 L 96 46 L 48 46 Z" fill="none" stroke="${COLOURS.timeRed}"
			stroke-width="3" stroke-linejoin="round"/>
		<line x1="72" y1="24" x2="72" y2="36" stroke="${COLOURS.timeRed}"
			stroke-width="3" stroke-linecap="round"/>
		<circle cx="72" cy="42" r="1.8" fill="${COLOURS.timeRed}"/>
		<text x="72" y="80" text-anchor="middle" font-family="Arial,sans-serif"
			font-size="22" font-weight="bold" fill="${COLOURS.textPrimary}">OnlyT</text>
		<text x="72" y="112" text-anchor="middle" font-family="Arial,sans-serif"
			font-size="22" font-weight="bold" fill="${COLOURS.timeRed}">
			Offline
			<animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite"/>
		</text>
	`);
}

/**
 * Render the "connecting" state shown on first appearance.
 */
export function renderConnecting(): string {
	return wrapSvg(`
		<circle cx="56" cy="62" r="6" fill="${COLOURS.textSecondary}" opacity="0.4"/>
		<circle cx="72" cy="62" r="6" fill="${COLOURS.textSecondary}" opacity="0.7"/>
		<circle cx="88" cy="62" r="6" fill="${COLOURS.textSecondary}"/>
		<text x="72" y="100" text-anchor="middle" font-family="Arial,sans-serif"
			font-size="14" fill="${COLOURS.textSecondary}">Connecting</text>
	`);
}

/**
 * Render the "end of meeting" state when all talks are done.
 */
export function renderEndOfMeeting(): string {
	return wrapSvg(`
		<circle cx="72" cy="56" r="20" fill="none" stroke="${COLOURS.playIcon}"
			stroke-width="3"/>
		<polyline points="62,56 70,64 84,48" fill="none" stroke="${COLOURS.playIcon}"
			stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
		<text x="72" y="104" text-anchor="middle" font-family="Arial,sans-serif"
			font-size="14" font-weight="bold" fill="${COLOURS.textSecondary}">COMPLETE</text>
	`);
}
