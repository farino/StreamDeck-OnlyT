import streamDeck from "@elgato/streamdeck";

import { TimerControl } from "./actions/timer-control";

streamDeck.actions.registerAction(new TimerControl());
streamDeck.connect();
