import { action } from "@elgato/streamdeck";

import { BaseOnlyTAction } from "./base-onlyt-action";
import {
	renderTitleOnly,
	renderEndOfMeeting,
} from "../utils/svg-renderer";
import {
	type ItemTitlesSettings,
	type ParsedTimerState,
} from "../types";

/**
 * Display-only Stream Deck action for OnlyT.
 * Shows the current talk name in large white text, wrapped over up to
 * 3 lines. No time, no controls. Pressing the button does nothing (the
 * base class provides a no-op `onKeyPress`), so this is purely a live
 * label the operator can glance at.
 */
@action({ UUID: "com.farino.streamdeck-onlyt.item-titles" })
export class ItemTitles extends BaseOnlyTAction<ItemTitlesSettings> {
	protected renderState(state: ParsedTimerState): string {
		if (state.currentTalkId === 0) {
			return renderEndOfMeeting();
		}
		return renderTitleOnly(state.currentTalkName);
	}
}
