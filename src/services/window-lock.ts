import { execFile, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import streamDeck from "@elgato/streamdeck";

import type { PluginGlobalSettings } from "../types";

const SCRIPT_PATH = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"onlyt-window-lock.ps1",
);

const PI_EVENT_GET_MONITORS = "onlytGetMonitors";
const PI_EVENT_MONITORS = "onlytMonitors";

/** Windows display device name, e.g. \\.\DISPLAY2 */
const MONITOR_NAME_PATTERN = /^\\\\\.\\DISPLAY\d+$/;

type MonitorInfo = { deviceName: string; label: string; primary: boolean };

let helper: ChildProcess | null = null;
let activeMonitor: string | null = null;

function powershellArgs(mode: "List" | "Lock" | "Unlock", extra: string[] = []): string[] {
	return [
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		SCRIPT_PATH,
		"-Mode",
		mode,
		...extra,
	];
}

function runOnce(mode: "List" | "Unlock"): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			"powershell.exe",
			powershellArgs(mode),
			{ windowsHide: true, timeout: 15000 },
			(err, stdout) => (err ? reject(err) : resolve(stdout)),
		);
	});
}

export async function listMonitors(): Promise<MonitorInfo[]> {
	try {
		const out = (await runOnce("List")).trim();
		const parsed = JSON.parse(out) as MonitorInfo[];
		return parsed.filter((m) => MONITOR_NAME_PATTERN.test(m.deviceName));
	} catch (err) {
		streamDeck.logger.warn(`Could not list monitors: ${err}`);
		return [];
	}
}

function stopHelper(): void {
	if (helper) {
		helper.removeAllListeners("exit");
		helper.kill();
		helper = null;
	}
	activeMonitor = null;
}

function startHelper(monitor: string): void {
	const extra = ["-ParentPid", String(process.pid)];
	if (monitor) {
		extra.push("-Monitor", monitor);
	}

	const child = spawn("powershell.exe", powershellArgs("Lock", extra), {
		windowsHide: true,
		stdio: ["ignore", "ignore", "pipe"],
	});

	child.stderr?.on("data", (chunk: Buffer) => {
		streamDeck.logger.warn(`Window lock helper: ${chunk.toString().trim()}`);
	});
	child.on("exit", (code) => {
		streamDeck.logger.info(`Window lock helper exited (code ${code})`);
		if (helper === child) {
			helper = null;
			activeMonitor = null;
		}
	});

	helper = child;
	activeMonitor = monitor;
	streamDeck.logger.info(
		`OnlyT main window lock enabled (monitor=${monitor || "any"})`,
	);
}

/** Start, restart or stop the lock helper so it matches the global settings. */
export function applyWindowLockSettings(raw: Record<string, unknown> | undefined): void {
	const enabled = raw?.lockMainWindow === true;
	const requested = typeof raw?.lockMonitor === "string" ? raw.lockMonitor : "";
	const monitor = MONITOR_NAME_PATTERN.test(requested) ? requested : "";

	if (enabled) {
		if (helper && activeMonitor === monitor) return;
		stopHelper();
		startHelper(monitor);
		return;
	}

	if (helper) {
		stopHelper();
		// Give the user their resizable window back straight away.
		runOnce("Unlock").catch((err) =>
			streamDeck.logger.warn(`Window unlock failed: ${err}`),
		);
		streamDeck.logger.info("OnlyT main window lock disabled");
	}
}

export async function loadWindowLockFromGlobalSettings(): Promise<void> {
	const global = await streamDeck.settings.getGlobalSettings<PluginGlobalSettings>();
	applyWindowLockSettings(global as Record<string, unknown>);
}

async function pushMonitorsToPropertyInspector(): Promise<void> {
	const monitors = await listMonitors();
	await streamDeck.ui.sendToPropertyInspector({
		event: PI_EVENT_MONITORS,
		monitors,
	});
}

/** Let property inspectors request the monitor list for the lock dropdown. */
export function registerWindowLockUi(): void {
	streamDeck.ui.onDidAppear(() => {
		void pushMonitorsToPropertyInspector();
	});

	streamDeck.ui.onSendToPlugin((ev) => {
		const payload = ev.payload as { event?: string } | undefined;
		if (payload?.event === PI_EVENT_GET_MONITORS) {
			void pushMonitorsToPropertyInspector();
		}
	});

	// Never leave an orphaned helper behind when the plugin exits.
	process.on("exit", () => helper?.kill());
}
