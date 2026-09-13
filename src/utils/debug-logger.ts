import { appendFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * NDJSON file logger used while debugging the "flashing Offline" bug.
 * Writes one JSON entry per line to a file inside the OS temp directory so
 * the log can be collected from any PC the plugin runs on (the HTTP debug
 * server on the developer's PC is not reachable from other machines).
 *
 * Path (Windows): %TEMP%\onlyt-debug.log
 * Path (macOS/Linux): /tmp/onlyt-debug.log
 *
 * All I/O errors are silently swallowed so debug logging never breaks the
 * plugin.
 */
const LOG_FILE = join(tmpdir(), "onlyt-debug.log");
const SESSION_ID = "d51016";

export function debugLog(
	location: string,
	hypothesisId: string,
	message: string,
	data?: Record<string, unknown>,
): void {
	try {
		const entry = {
			sessionId: SESSION_ID,
			id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			timestamp: Date.now(),
			location,
			hypothesisId,
			message,
			data: data ?? {},
		};
		appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
	} catch {
		// Never let debug logging break the plugin.
	}
}

/** Path on disk where debug NDJSON entries are appended. Exposed for messages. */
export const DEBUG_LOG_PATH = LOG_FILE;
