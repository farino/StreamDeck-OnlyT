import streamDeck, {
	action,
	type KeyDownEvent,
} from "@elgato/streamdeck";

import { BaseOnlyTAction } from "./base-onlyt-action";
import { renderBellGlyph } from "../utils/svg-renderer";
import {
	type ConnectionSettings,
	type ParsedTimerState,
} from "../types";

/**
 * Stream Deck action that rings the OnlyT overtime bell.
 * Calls POST /api/v4/bell. The tile always shows a bell glyph.
 * Note: OnlyT must have the bell enabled in Options to hear sound;
 * the API still returns success when the bell is disabled.
 */
@action({ UUID: "com.farino.streamdeck-onlyt.bell" })
export class Bell extends BaseOnlyTAction<ConnectionSettings> {
	protected renderState(
		_state: ParsedTimerState,
		_settings: ConnectionSettings,
	): string {
		return renderBellGlyph();
	}

	protected override async onKeyPress(
		_state: ParsedTimerState,
		ev: KeyDownEvent<ConnectionSettings>,
	): Promise<void> {
		if (!this.client) return;

		streamDeck.logger.info("Bell press: ringing OnlyT bell");
		const result = await this.client.ringBell();
		streamDeck.logger.info(`Bell result: ${JSON.stringify(result)}`);

		if (result === null || result.success === false) {
			await ev.action.showAlert();
			return;
		}

		await ev.action.showOk();
	}
}
