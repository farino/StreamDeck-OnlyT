import { OnlyTClient } from "./onlyt-client";
import {
	type ConnectionSettings,
	DEFAULT_CONNECTION,
} from "../types";
import { normalizeConnection, type ConnectionInput } from "../utils/connection-settings";

type ConnectionListener = () => void;

let connection: ConnectionSettings = { ...DEFAULT_CONNECTION };
let client: OnlyTClient | null = null;
const listeners = new Set<ConnectionListener>();

export function getPluginConnection(): ConnectionSettings {
	return connection;
}

export function getOnlyTClient(): OnlyTClient {
	if (!client) {
		client = new OnlyTClient(connection.host, connection.port, connection.apiCode);
	}
	return client;
}

export function applyPluginConnection(
	next: ConnectionInput | undefined,
): void {
	const normalized = normalizeConnection(next);
	const changed =
		normalized.host !== connection.host ||
		normalized.port !== connection.port ||
		normalized.apiCode !== connection.apiCode;

	connection = normalized;

	if (client) {
		client.updateConnection(connection.host, connection.port, connection.apiCode);
	} else {
		client = new OnlyTClient(connection.host, connection.port, connection.apiCode);
	}

	if (changed) {
		for (const listener of listeners) {
			listener();
		}
	}
}

export function onPluginConnectionChanged(
	listener: ConnectionListener,
): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
