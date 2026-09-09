import streamDeck from "@elgato/streamdeck";

import { TimerControl } from "./actions/timer-control";
import { StartStopOnly } from "./actions/start-stop-only";
import { ItemTitles } from "./actions/item-titles";

streamDeck.actions.registerAction(new TimerControl());
streamDeck.actions.registerAction(new StartStopOnly());
streamDeck.actions.registerAction(new ItemTitles());
streamDeck.connect();
