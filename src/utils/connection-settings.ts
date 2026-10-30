import {
	type ConnectionSettings,
	DEFAULT_CONNECTION,
} from "../types";

/** Loose host/port/apiCode shape (e.g. straight from global or legacy settings). */
export type ConnectionInput = {
	host?: string;
	port?: number | string;
	apiCode?: string;
};

const CONNECTION_KEYS = ["host", "port", "apiCode"] as const;

/**
 * True when persisted action settings still carry a user-entered OnlyT connection.
 */
export function hasLegacyConnectionFields(
	raw: Record<string, unknown> | undefined,
): boolean {
	if (!raw) return false;

	const host = raw.host;
	if (typeof host === "string" && host.trim()) return true;

	const port = raw.port;
	if (typeof port === "number" && !Number.isNaN(port)) return true;
	if (typeof port === "string" && port.trim()) return true;

	const apiCode = raw.apiCode;
	if (typeof apiCode === "string" && apiCode.trim()) return true;

	return false;
}

/**
 * Read host / port / API code from legacy per-action settings.
 */
export function extractLegacyConnection(
	raw: Record<string, unknown> | undefined,
): ConnectionSettings | null {
	if (!hasLegacyConnectionFields(raw)) return null;

	let host = DEFAULT_CONNECTION.host;
	if (typeof raw?.host === "string" && raw.host.trim()) {
		host = raw.host.trim();
	}

	let port = DEFAULT_CONNECTION.port;
	if (typeof raw?.port === "number" && !Number.isNaN(raw.port)) {
		port = raw.port;
	} else if (typeof raw?.port === "string" && raw.port.trim()) {
		port = parseInt(raw.port, 10) || DEFAULT_CONNECTION.port;
	}

	const apiCode =
		typeof raw?.apiCode === "string" ? raw.apiCode : DEFAULT_CONNECTION.apiCode;

	return normalizeConnection({ host, port, apiCode });
}

export function normalizeConnection(
	partial: ConnectionInput | undefined,
): ConnectionSettings {
	const hostRaw = partial?.host;
	const host =
		typeof hostRaw === "string" && hostRaw.trim()
			? hostRaw.trim()
			: DEFAULT_CONNECTION.host;

	const portRaw = partial?.port as number | string | undefined;
	let port = DEFAULT_CONNECTION.port;
	if (typeof portRaw === "number" && !Number.isNaN(portRaw)) {
		port = portRaw;
	} else if (typeof portRaw === "string" && portRaw.trim()) {
		port = parseInt(portRaw, 10) || DEFAULT_CONNECTION.port;
	}

	const apiCode =
		typeof partial?.apiCode === "string"
			? partial.apiCode
			: DEFAULT_CONNECTION.apiCode;

	return {
		host: normalizeHostForConnection(host),
		port,
		apiCode,
	};
}

function normalizeHostForConnection(host: string): string {
	const h = host.trim().toLowerCase();
	if (h === "localhost") return "127.0.0.1";
	return host.trim();
}

function connectionVoteKey(settings: ConnectionSettings): string {
	return `${normalizeHostForConnection(settings.host)}|${settings.port}|${settings.apiCode}`;
}

/**
 * Pick the most common host/port/apiCode profile across action instances.
 */
export function majorityConnection(
	candidates: ConnectionSettings[],
): ConnectionSettings | null {
	if (candidates.length === 0) return null;

	const tallies = new Map<string, { count: number; value: ConnectionSettings }>();

	for (const candidate of candidates) {
		const normalized = normalizeConnection(candidate);
		const key = connectionVoteKey(normalized);
		const entry = tallies.get(key) ?? { count: 0, value: normalized };
		entry.count += 1;
		tallies.set(key, entry);
	}

	let best: { count: number; value: ConnectionSettings } | null = null;
	for (const entry of tallies.values()) {
		if (!best || entry.count > best.count) {
			best = entry;
		}
	}

	return best?.value ?? null;
}

export function hasConfiguredGlobalConnection(
	raw: Record<string, unknown> | undefined,
): boolean {
	if (!raw) return false;
	if (raw.connectionMigrated === true) return true;
	return hasLegacyConnectionFields(raw);
}

/**
 * Remove OnlyT connection fields from action settings JSON.
 */
export function stripConnectionFields<T extends Record<string, unknown>>(
	settings: T,
): Omit<T, "host" | "port" | "apiCode"> {
	const copy = { ...settings };
	for (const key of CONNECTION_KEYS) {
		delete copy[key];
	}
	return copy;
}
