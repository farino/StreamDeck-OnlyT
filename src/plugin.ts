import streamDeck from "@elgato/streamdeck";

import { TimerControl } from "./actions/timer-control";
import { StartStopOnly } from "./actions/start-stop-only";
import { ItemTitles } from "./actions/item-titles";
import { AddMinute } from "./actions/add-minute";
import { SubtractMinute } from "./actions/subtract-minute";

streamDeck.actions.registerAction(new TimerControl());
streamDeck.actions.registerAction(new StartStopOnly());
streamDeck.actions.registerAction(new ItemTitles());
streamDeck.actions.registerAction(new AddMinute());
streamDeck.actions.registerAction(new SubtractMinute());
streamDeck.connect();
