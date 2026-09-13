import streamDeck from "@elgato/streamdeck";
import type { TimersResponse, TimerCommandResponse } from "../types";
// #region agent log
import { debugLog, DEBUG_LOG_PATH } from "../utils/debug-logger";
// #endregion

const REQUEST_TIMEOUT_MS = 3000;
// #region agent log
// One-time announce so the log file always contains at least a heartbeat
// even if every request later fails silently.
debugLog("onlyt-client.ts:module", "boot", "OnlyTClient module loaded", {
	debugLogPath: DEBUG_LOG_PATH,
	requestTimeoutMs: REQUEST_TIMEOUT_MS,
});
// #endregion

/**
 * Node's built-in fetch resolves `localhost` to IPv6 (`::1`) first on Windows,
 * but OnlyT's HTTP listener only binds to IPv4 (`127.0.0.1`). Force IPv4 so
 * requests succeed regardless of what the user configured in the property inspector.
 */
function normalizeHost(host: string): string {
	const trimmed = (host || "").trim().toLowerCase();
	return trimmed === "localhost" ? "127.0.0.1" : (host || "127.0.0.1");
}

/**
 * HTTP client for the OnlyT REST API (v4).
 */
export class OnlyTClient {
	private baseUrl: string;
	private apiCode: string;

	constructor(host: string, port: number, apiCode: string = "") {
		this.baseUrl = `http://${normalizeHost(host)}:${port}`;
		this.apiCode = apiCode;
		// #region agent log
		// H1 + H6: capture what host the plugin is ACTUALLY targeting so we
		// can compare against what the user typed in the PI.
		debugLog("onlyt-client.ts:constructor", "H1_H6", "OnlyTClient constructed", {
			rawHost: host,
			normalizedHost: normalizeHost(host),
			port,
			apiCodeLength: apiCode?.length ?? 0,
			baseUrl: this.baseUrl,
		});
		// #endregion
	}

	updateConnection(host: string, port: number, apiCode: string = ""): void {
		this.baseUrl = `http://${normalizeHost(host)}:${port}`;
		this.apiCode = apiCode;
		// #region agent log
		// H6: PI settings edits flow through here. If the plugin later uses
		// a stale URL despite the user editing the PI, this log won't fire.
		debugLog("onlyt-client.ts:updateConnection", "H6", "OnlyTClient connection updated", {
			rawHost: host,
			normalizedHost: normalizeHost(host),
			port,
			apiCodeLength: apiCode?.length ?? 0,
			baseUrl: this.baseUrl,
		});
		// #endregion
	}

	async getTimers(): Promise<TimersResponse | null> {
		return this.request<TimersResponse>("GET", "/api/v4/timers/");
	}

	async startTimer(talkId: number): Promise<TimerCommandResponse | null> {
		return this.request<TimerCommandResponse>("POST", `/api/v4/timers/${talkId}`);
	}

	async stopTimer(talkId: number): Promise<TimerCommandResponse | null> {
		return this.request<TimerCommandResponse>("DELETE", `/api/v4/timers/${talkId}`);
	}

	async changeDuration(talkId: number, deltaSecs: number): Promise<TimerCommandResponse | null> {
		return this.request<TimerCommandResponse>(
			"POST",
			`/api/v4/timers/${talkId}/duration`,
			{ deltaSeconds: deltaSecs },
		);
	}

	private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T | null> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			"Accept": "application/json",
		};

		if (this.apiCode) {
			headers["ApiCode"] = this.apiCode;
		}

		if (body) {
			headers["Content-Type"] = "application/json";
		}

		// #region agent log
		const reqStartedAt = Date.now();
		const reqId = `${reqStartedAt}_${Math.random().toString(36).slice(2, 8)}`;
		let timedOut = false;
		// #endregion

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => {
				// #region agent log
				timedOut = true;
				// #endregion
				controller.abort();
			}, REQUEST_TIMEOUT_MS);

			streamDeck.logger.debug(`${method} ${url}`);

			const response = await fetch(url, {
				method,
				headers,
				signal: controller.signal,
				...(body ? { body: JSON.stringify(body) } : {}),
			});

			clearTimeout(timeout);

			if (!response.ok) {
				const body = await response.text().catch(() => "(no body)");
				streamDeck.logger.error(`${method} ${url} -> HTTP ${response.status}: ${body}`);
				// #region agent log
				// H4: non-2xx after successful TCP connect - could be OnlyT returning 5xx under load.
				debugLog("onlyt-client.ts:request", "H4", "HTTP non-ok", {
					reqId,
					method,
					url,
					status: response.status,
					elapsedMs: Date.now() - reqStartedAt,
					bodySnippet: body.slice(0, 200),
				});
				// #endregion
				return null;
			}

			const text = await response.text();
			streamDeck.logger.debug(`${method} ${url} -> ${response.status} OK`);

			// #region agent log
			// H2 + H4: capture elapsed ms for every successful request so we can
			// see the timing pattern - are successes fast and failures slow (timeout)?
			debugLog("onlyt-client.ts:request", "H2_H4", "HTTP ok", {
				reqId,
				method,
				url,
				status: response.status,
				elapsedMs: Date.now() - reqStartedAt,
				bodyLength: text.length,
			});
			// #endregion

			if (!text || text.trim().length === 0) {
				return { success: true } as T;
			}

			return JSON.parse(text) as T;
		} catch (err) {
			streamDeck.logger.error(`${method} ${url} -> Exception: ${err}`);
			// #region agent log
			// H1 + H2 + H3: capture the real failure signal - err name, code, and
			// cause together with elapsed ms disambiguate DNS failure vs ECONNREFUSED
			// vs AbortError-from-timeout vs firewall-induced ECONNRESET.
			const e = err as (Error & { code?: string; cause?: { code?: string; message?: string; errno?: number } }) | undefined;
			debugLog("onlyt-client.ts:request", "H1_H2_H3", "HTTP exception", {
				reqId,
				method,
				url,
				elapsedMs: Date.now() - reqStartedAt,
				timedOut,
				errName: e?.name,
				errMessage: e?.message,
				errCode: e?.code,
				causeCode: e?.cause?.code,
				causeMessage: e?.cause?.message,
				causeErrno: e?.cause?.errno,
			});
			// #endregion
			return null;
		}
	}
}
