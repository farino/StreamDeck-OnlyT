import streamDeck from "@elgato/streamdeck";

import { TimerControl } from "./actions/timer-control";
import { StartStopOnly } from "./actions/start-stop-only";
import { ItemTitles } from "./actions/item-titles";
import { AddMinute } from "./actions/add-minute";
import { SubtractMinute } from "./actions/subtract-minute";
import { JWStudy } from "./actions/jw-study";
import { JWMeetings } from "./actions/jw-meetings";

streamDeck.actions.registerAction(new TimerControl());
streamDeck.actions.registerAction(new StartStopOnly());
streamDeck.actions.registerAction(new ItemTitles());
streamDeck.actions.registerAction(new AddMinute());
streamDeck.actions.registerAction(new SubtractMinute());
streamDeck.actions.registerAction(new JWStudy());
streamDeck.actions.registerAction(new JWMeetings());
streamDeck.connect();
