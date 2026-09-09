import { formatTime } from "../types";

const SIZE = 144;

const COLOURS = {
	textPrimary: "#ffffff",
	textSecondary: "#b2bec3",
	playIcon: "#00b894",
	timeGreen: "#00d967",
	timeOrange: "#f5a623",
	timeRed: "#ff4d4d",
	// Deeper, more saturated red used specifically for the Dynamic-mode
	// overtime fill so it reads as a genuine "you have gone over" alarm
	// instead of the paler text-friendly `timeRed`.
	dynamicRed: "#dc2626",
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
 * Clamp a number between min and max.
 */
function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
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
 * Visual centre of a text glyph relative to its baseline y.
 * Text baselines sit near the bottom of the glyph, so the visible centre is
 * roughly 35% of the font size above the baseline.
 */
function textVisualCentre(baselineY: number, fontSize: number): number {
	return baselineY - fontSize * 0.35;
}

/**
 * Decide the ink colour for a text element sitting over the Dynamic fill,
 * based on where the fill's top edge is:
 *   - if the fill top is at or above the text's visual centre, the text sits
 *     inside the fill and must render in BLACK.
 *   - otherwise the text sits on the exposed dark tile and must render in
 *     WHITE.
 */
function inkColourForFillTop(refY: number, fillTop: number): string {
	return fillTop <= refY ? "#000000" : "#ffffff";
}

/**
 * Render a single Dynamic-mode text element with the correct base colour for
 * the start-of-second fill position, and (if the fill's top edge crosses this
 * text during the 1 s animation) an SMIL <set> that snaps the colour at the
 * exact fractional time when the fill edge hits the text's visual centre.
 * This keeps the text readable throughout the drain without needing clip-path
 * or mask support in the renderer.
 */
function dynamicText(
	text: string,
	x: number,
	baselineY: number,
	fontSize: number,
	prevFillTop: number,
	currFillTop: number,
): string {
	const refY = textVisualCentre(baselineY, fontSize);
	const startColour = inkColourForFillTop(refY, prevFillTop);
	const endColour = inkColourForFillTop(refY, currFillTop);

	const attrs =
		`x="${x}" y="${baselineY}" text-anchor="middle" font-family="Arial,sans-serif" ` +
		`font-size="${fontSize}" font-weight="bold"`;

	if (startColour === endColour) {
		return `<text ${attrs} fill="${startColour}">${escXml(text)}</text>`;
	}

	// Fill edge crosses this text during the 1 s animation. Snap the colour at
	// the exact fractional time when fillTop == refY, so the swap tracks the
	// fill's visual position.
	let frac = (refY - prevFillTop) / (currFillTop - prevFillTop);
	frac = Math.max(0.001, Math.min(0.999, frac));

	return `<text ${attrs} fill="${startColour}">${escXml(text)}` +
		`<set attributeName="fill" to="${endColour}" begin="${frac.toFixed(3)}s" fill="freeze"/>` +
		`</text>`;
}

/**
 * Dynamic-mode variant of renderTitle: renders one or two lines using
 * `dynamicText` so each line picks the right ink colour and animates its own
 * snap independently of the fill rect.
 */
function renderDynamicTitle(
	text: string,
	fontSize: number,
	centreY: number,
	prevFillTop: number,
	currFillTop: number,
): string {
	const lines = splitTitle(text);
	const lineHeight = fontSize + 2;

	if (lines.length === 1) {
		return dynamicText(lines[0], 72, centreY, fontSize, prevFillTop, currFillTop);
	}

	const y1 = centreY - lineHeight / 2 + fontSize / 3;
	const y2 = y1 + lineHeight;

	return (
		dynamicText(lines[0], 72, y1, fontSize, prevFillTop, currFillTop) +
		dynamicText(lines[1], 72, y2, fontSize, prevFillTop, currFillTop)
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
 * Render the "running" state in Dynamic mode: a coloured fill anchored to the
 * bottom of the tile that drains as the timer counts down, with title and
 * time drawn on top and their colour inverted to match whichever background
 * they are currently over.
 *
 * Colour thresholds:
 *   remaining > target/2      -> green
 *   0 < remaining <= target/2 -> orange
 *   remaining <= 0            -> deep red, fill snaps to full height
 *
 * How the text stays readable:
 *   - The fill rect animates its `y` and `height` from the previous second's
 *     values to the current ones over 1 s using SMIL <animate>.
 *   - Each text element picks its base ink colour from the start-of-second
 *     fill position (BLACK if the fill covers the text, WHITE otherwise).
 *   - If the fill's top edge crosses the text during this second, an SMIL
 *     <set> snaps the ink colour to the end-of-second value at the exact
 *     fractional moment of the crossover, so the swap tracks the fill edge
 *     without needing clip-path or mask support in the renderer.
 */
export function renderRunningDynamic(
	talkName: string,
	remainingSecs: number,
	targetSecs: number,
): string {
	const isOvertime = remainingSecs <= 0;
	const safeTarget = targetSecs > 0 ? targetSecs : 1;

	let fillColour: string;
	if (isOvertime) {
		fillColour = COLOURS.dynamicRed;
	} else if (remainingSecs <= safeTarget / 2) {
		fillColour = COLOURS.timeOrange;
	} else {
		fillColour = COLOURS.timeGreen;
	}

	// Fraction of the tile covered by the fill, anchored to the bottom.
	// Overtime forces a full-height red fill.
	const currFrac = isOvertime ? 1 : clamp(remainingSecs / safeTarget, 0, 1);
	const prevFrac = isOvertime ? 1 : clamp((remainingSecs + 1) / safeTarget, 0, 1);

	const currHeight = currFrac * SIZE;
	const prevHeight = prevFrac * SIZE;
	const currY = SIZE - currHeight;
	const prevY = SIZE - prevHeight;

	const pY = prevY.toFixed(2);
	const cY = currY.toFixed(2);
	const pH = prevHeight.toFixed(2);
	const cH = currHeight.toFixed(2);

	const name = talkName || "Running";
	const displayTime = isOvertime
		? `+${formatTime(Math.abs(remainingSecs))}`
		: formatTime(remainingSecs);

	const fillRect =
		`<rect x="0" width="${SIZE}" y="${pY}" height="${pH}" fill="${fillColour}">` +
			`<animate attributeName="y" from="${pY}" to="${cY}" dur="1s" fill="freeze"/>` +
			`<animate attributeName="height" from="${pH}" to="${cH}" dur="1s" fill="freeze"/>` +
		`</rect>`;

	return wrapSvg(`
		${fillRect}
		${renderDynamicTitle(name, 16, 28, prevY, currY)}
		${dynamicText(displayTime, 72, 92, 40, prevY, currY)}
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
