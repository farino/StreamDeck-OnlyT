import streamDeck from "@elgato/streamdeck";
import type { TimersResponse, TimerCommandResponse } from "../types";

const REQUEST_TIMEOUT_MS = 3000;

/**
 * HTTP client for the OnlyT REST API (v4).
 */
export class OnlyTClient {
	private baseUrl: string;
	private apiCode: string;

	constructor(host: string, port: number, apiCode: string = "") {
		this.baseUrl = `http://${host}:${port}`;
		this.apiCode = apiCode;
	}

	updateConnection(host: string, port: number, apiCode: string = ""): void {
		this.baseUrl = `http://${host}:${port}`;
		this.apiCode = apiCode;
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

	private async request<T>(method: string, path: string): Promise<T | null> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			"Accept": "application/json",
		};

		if (this.apiCode) {
			headers["ApiCode"] = this.apiCode;
		}

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

			streamDeck.logger.debug(`${method} ${url}`);

			const response = await fetch(url, {
				method,
				headers,
				signal: controller.signal,
			});

			clearTimeout(timeout);

			if (!response.ok) {
				const body = await response.text().catch(() => "(no body)");
				streamDeck.logger.error(`${method} ${url} -> HTTP ${response.status}: ${body}`);
				return null;
			}

			const text = await response.text();
			streamDeck.logger.debug(`${method} ${url} -> ${response.status} OK`);

			if (!text || text.trim().length === 0) {
				return { success: true } as T;
			}

			return JSON.parse(text) as T;
		} catch (err) {
			streamDeck.logger.error(`${method} ${url} -> Exception: ${err}`);
			return null;
		}
	}
}
